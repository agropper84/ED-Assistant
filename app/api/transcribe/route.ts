import { NextRequest, NextResponse } from 'next/server';
import { DICTATION_WHISPER_PROMPT, ENCOUNTER_WHISPER_PROMPT } from '@/lib/whisper-prompts';
import { getAnthropicClient, getOpenAIClient } from '@/lib/api-keys';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings } from '@/lib/kv';
import { MODELS } from '@/lib/config';

export const maxDuration = 60;

/**
 * Convert spoken punctuation commands to actual punctuation.
 * Runs BEFORE medicalization so "comma" doesn't become "coma", etc.
 */
function convertSpokenPunctuation(text: string): string {
  return text
    // Sentence-ending: "period" / "full stop" → "." (but not "menstrual period" or "period of ...")
    .replace(/(?<!\bmenstrual)\s*\b(?:period|full stop)\b(?!\s+of)\s*/gi, '. ')
    // Comma
    .replace(/\s*\bcomma\b\s*/gi, ', ')
    // Question mark
    .replace(/\s*\b(?:question mark)\b\s*/gi, '? ')
    // Exclamation
    .replace(/\s*\b(?:exclamation (?:mark|point))\b\s*/gi, '! ')
    // Colon
    .replace(/\s*\bcolon\b\s*/gi, ': ')
    // Semicolon
    .replace(/\s*\bsemicolon\b\s*/gi, '; ')
    // Dash / hyphen
    .replace(/\s*\b(?:dash|hyphen)\b\s*/gi, ' — ')
    // New line / new paragraph
    .replace(/\s*\b(?:new line|newline|next line)\b\s*/gi, '\n')
    .replace(/\s*\b(?:new paragraph|next paragraph)\b\s*/gi, '\n\n')
    // Capitalize after sentence-ending punctuation
    .replace(/([.!?]\s+)([a-z])/g, (_, punct, letter) => punct + letter.toUpperCase())
    // Clean up extra spaces
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Detect common Whisper hallucinations produced from silence or noise.
 * Whisper often generates these phrases when given near-empty audio.
 */
function isWhisperHallucination(text: string, context?: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  // Too short to be meaningful (just punctuation or 1-2 words)
  if (normalized.length < 3) return true;

  const hallucinations = [
    'thank you', 'thanks for watching', 'thank you for watching',
    'thanks for listening', 'thank you for listening',
    'please subscribe', 'like and subscribe',
    'see you next time', 'bye', 'goodbye',
    'you', 'the end', 'gene',
    'and more', 'and after',
  ];
  if (hallucinations.some(h => normalized === h || normalized.startsWith(h + ' '))) return true;

  // Check if Whisper just echoed back the context (hallucination from silence)
  if (context) {
    const normalizedCtx = context.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    // If the transcription is a substring of the last part of context, it's an echo
    const ctxTail = normalizedCtx.slice(-normalized.length * 2);
    if (normalized.length > 10 && ctxTail.includes(normalized)) return true;
    // If context ends with essentially the same text
    if (normalized.length > 10 && normalizedCtx.endsWith(normalized)) return true;
  }

  return false;
}

/** Get calibration rules for the medicalize prompt */
async function getCalibrationRules(mode: string): Promise<string> {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return '';
    const settings = await getUserSettings(session.userId);
    const calKey = mode === 'dictation' ? 'dictationCalibration' : 'encounterCalibration';
    const cal = settings?.[calKey] as Record<string, string> | undefined;
    if (!cal) return '';
    const parts: string[] = [];
    if (cal.rules) parts.push(`Physician-specific rules:\n${cal.rules}`);
    if (cal.terminology) parts.push(`Known terminology corrections:\n${cal.terminology}`);
    if (cal.style) parts.push(`Physician style: ${cal.style}`);
    if (cal.speakerLabeling) parts.push(`Speaker identification: ${cal.speakerLabeling}`);
    return parts.length > 0 ? `\n\n${parts.join('\n')}` : '';
  } catch {
    return '';
  }
}

async function medicalize(rawText: string, mode: string, context?: string): Promise<string> {
  const contextBlock = context
    ? `\n\nPrevious context for continuity (do NOT repeat, only use to resolve ambiguity):\n"${context}"\n`
    : '';

  const calRules = await getCalibrationRules(mode);

  const prompt = mode === 'encounter'
    ? `Convert this recorded doctor-patient emergency department encounter into a structured clinical transcript. Rules:
- If the input already has speaker labels (e.g. "Speaker 1:", "Speaker 2:"), convert them to "Dr:" and "Pt:" (or "Family:")
- If no speaker labels, identify speakers from context and label as "Dr:" and "Pt:"
- Convert patient's colloquial descriptions into medically relevant language while preserving their reported symptoms and timeline
- Convert physician's spoken language into proper medical terminology
- Preserve all clinically relevant information — do NOT add, infer, or remove details
- Fix speech-to-text errors for medical terms (e.g. "new Monya"→"pneumonia", "CPA"→"CVA")
- Remove filler words, false starts, and repetition
- Use concise, professional formatting
- Output ONLY the converted transcript, nothing else
- If the input contains no clinical content (e.g. just greetings, filler, or noise), output exactly: EMPTY${calRules}

Recording:
${rawText}`
    : `${rawText}`;

  const systemPrompt = mode === 'encounter'
    ? undefined
    : `You are a medical transcription processor for an emergency physician's dictation. Your ONLY job is to clean up the raw speech-to-text output. NEVER ask questions, request clarification, or add commentary. Just process whatever text you receive, even if it seems incomplete — it may be a segment of a longer dictation.

Rules:
- PRESERVE ALL CONTENT — every word the physician dictated must be kept
- Replace medical colloquialisms: "belly"→"abdomen", "heart attack"→"MI", "sugar"→"glucose", "blood thinner"→"anticoagulant"
- Keep standard medical abbreviations as-is: BP, HR, RR, SpO2, GCS, CVA, PE, DVT, STEMI, etc. Do NOT expand them
- Fix speech-to-text errors on medical terms: "CPA"→"CVA", "tendered"→"tender", "new monya"→"pneumonia", "see PA"→"CVA"
- Format vital signs consistently when dictated (e.g., "BP 120/80, HR 88, RR 16, SpO2 98% on RA")
- If physician dictates in sections (e.g., "HPI", "Exam", "Plan"), preserve that structure with line breaks
- Do NOT medicalize non-medical descriptions (mechanism of injury, patient activities, social context)
- Clean up filler words (um, uh, like), false starts, and accidental repetition
- Output ONLY the cleaned text — no explanations, no questions
- If input is just noise/silence, output EMPTY${calRules}${contextBlock}`;

  const anthropic = await getAnthropicClient();
  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 2048,
    temperature: 0,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  const result = response.content[0].type === 'text' ? response.content[0].text : '';
  const trimmed = result.trim();
  if (!trimmed || trimmed === 'EMPTY') return '';

  // Safety: if Claude drastically shortened the text, return original
  if (rawText.length > 20 && trimmed.length < rawText.length * 0.4) {
    console.warn(`Medicalize over-condensed: ${rawText.length} chars → ${trimmed.length} chars. Returning original.`);
    return rawText;
  }

  return trimmed;
}

/** Get calibration terminology to append to Whisper prompt */
async function getCalibrationTerms(mode: string): Promise<string> {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return '';
    const settings = await getUserSettings(session.userId);
    const calKey = mode === 'dictation' ? 'dictationCalibration' : 'encounterCalibration';
    const cal = settings?.[calKey] as Record<string, string> | undefined;
    if (!cal?.terminology) return '';
    // Extract the written form from "spoken → written" pairs
    const terms = cal.terminology
      .split('\n')
      .map(line => {
        const arrow = line.indexOf('→');
        return arrow >= 0 ? line.substring(arrow + 1).trim() : line.trim();
      })
      .filter(k => k.length > 1)
      .slice(0, 30);
    return terms.length > 0 ? `. User terminology: ${terms.join(', ')}` : '';
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const mode = (formData.get('mode') as string) || 'dictation';
    const context = (formData.get('context') as string) || '';
    const skipMedicalize = (formData.get('skipMedicalize') as string) === 'true';

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const basePrompt = mode === 'encounter' ? ENCOUNTER_WHISPER_PROMPT : DICTATION_WHISPER_PROMPT;

    // Append user-specific calibration terminology to improve recognition
    const calTerms = await getCalibrationTerms(mode);

    // Whisper uses the prompt for style/vocabulary conditioning AND context continuity.
    const contextTail = context
      ? context.split(/\s+/).slice(-50).join(' ')
      : '';
    const whisperPrompt = contextTail
      ? `${basePrompt}${calTerms}. Previous context: ${contextTail}`
      : `${basePrompt}${calTerms}`;

    const openai = await getOpenAIClient();
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      prompt: whisperPrompt,
      language: 'en',
      temperature: 0,
    });

    const rawText = transcription.text?.trim();
    if (!rawText) {
      return NextResponse.json({ text: '' });
    }

    // Filter out Whisper hallucinations (common artifacts from silence/noise/echo)
    if (isWhisperHallucination(rawText, context)) {
      return NextResponse.json({ text: '' });
    }

    // Convert spoken punctuation ("period", "comma") to actual punctuation first
    const punctuated = convertSpokenPunctuation(rawText);

    // Skip medicalization if requested (fast dictation mode)
    if (skipMedicalize) {
      return NextResponse.json({ text: punctuated });
    }

    // Convert to medical language, reusing context tail for continuity
    const medicalText = await medicalize(punctuated, mode, contextTail || undefined);

    return NextResponse.json({ text: medicalText });
  } catch (error: any) {
    console.error('Transcription error:', error);
    const message = error?.message || 'Transcription failed';
    const status = error?.status || 500;
    return NextResponse.json({ error: message }, { status });
  }
}
