import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { medicalizeSchema } from '@/lib/schemas';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings } from '@/lib/kv';
import { MODELS } from '@/lib/config';

export const maxDuration = 30;

async function getCalibrationBlock(mode: string): Promise<string> {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return '';
    const settings = await getUserSettings(session.userId);
    const calKey = mode === 'dictation' ? 'dictationCalibration' : 'encounterCalibration';
    const cal = settings?.[calKey] as Record<string, string> | undefined;
    if (!cal) return '';
    const parts: string[] = [];
    if (cal.rules) parts.push(`Physician-specific rules:\n${cal.rules}`);
    if (cal.terminology) parts.push(`Known corrections:\n${cal.terminology}`);
    if (cal.style) parts.push(`Style: ${cal.style}`);
    if (cal.speakerLabeling) parts.push(`Speaker ID: ${cal.speakerLabeling}`);
    return parts.length > 0 ? `\n\n${parts.join('\n')}\n` : '';
  } catch {
    return '';
  }
}

export const POST = withApiHandler(
  { rateLimit: { limit: 30, window: 60 } },
  async (request: NextRequest) => {
    const { text, context, mode } = await parseBody(request, medicalizeSchema);
    if (!text?.trim()) return NextResponse.json({ text: '' });

    const calBlock = await getCalibrationBlock(mode || 'dictation');
    const contextBlock = context
      ? `\nPrevious context for continuity (do NOT repeat, only use to resolve ambiguity):\n"${context}"\n`
      : '';

    const isEncounter = mode === 'encounter';
    const anthropic = await getAnthropicClient();

    let systemPrompt: string;
    let userMessage: string;

    if (isEncounter) {
      // Encounter mode: instructions + text in user message (multi-speaker)
      systemPrompt = 'You convert raw doctor-patient encounter transcripts into structured clinical transcripts. Output ONLY the converted transcript.';
      userMessage = `Convert this recorded doctor-patient emergency department encounter into a structured clinical transcript. Rules:
- If the input has speaker labels (e.g. "Speaker 1:", "Speaker 2:"), convert them to "Dr:" and "Pt:" (or "Family:")
- If no speaker labels, identify speakers from context and label as "Dr:" and "Pt:"
- Convert patient's colloquial descriptions into medically relevant language while preserving their reported symptoms and timeline
- Convert physician's spoken language into proper medical terminology
- Preserve all clinically relevant information — do NOT add, infer, or remove details
- Fix speech-to-text errors for medical terms
- Remove filler words, false starts, and repetition
- Use concise, professional formatting
- Output ONLY the converted transcript, nothing else
- If the input contains no clinical content, output exactly: EMPTY${calBlock}
Recording:
${text}`;
    } else {
      // Dictation mode: system prompt for instructions, user message for just the text
      systemPrompt = `You are a medical transcription processor for an emergency physician's dictation. Your ONLY job is to clean up the raw speech-to-text output and return the cleaned version. NEVER ask questions, request clarification, or add commentary. NEVER say "I need" or "please provide". Just process whatever text you receive, even if it seems incomplete.

Rules:
- PRESERVE ALL CONTENT — every word the physician dictated must be kept
- Replace medical colloquialisms ONLY where clearly medical (e.g., "belly"→"abdomen", "heart attack"→"MI", "sugar"→"glucose")
- Keep standard medical abbreviations as-is (BP, HR, RR, SpO2, GCS, CVA, PE, DVT, etc.) — do NOT expand them
- Fix speech-to-text errors on medical terms (e.g., "CPA"→"CVA", "tendered"→"tender", "new monya"→"pneumonia")
- Do NOT medicalize non-medical descriptions (mechanism of injury, patient activities, social context)
- Clean up filler words, false starts, and accidental repetition
- Output ONLY the cleaned text — no explanations, no questions
- If input is just noise/silence, output EMPTY${calBlock}${contextBlock}`;

      userMessage = text;
    }

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 2048,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const result = response.content[0].type === 'text' ? response.content[0].text : '';
    const trimmed = result.trim();
    if (!trimmed || trimmed === 'EMPTY') return NextResponse.json({ text: '' });

    // Safety: if Claude drastically shortened the text (>60% reduction), return original
    // This prevents over-condensation of valid dictation
    const inputLen = text.trim().length;
    if (inputLen > 20 && trimmed.length < inputLen * 0.4) {
      console.warn(`Medicalize over-condensed: ${inputLen} chars → ${trimmed.length} chars. Returning original.`);
      return NextResponse.json({ text: text.trim() });
    }

    return NextResponse.json({ text: trimmed });
  }
);
