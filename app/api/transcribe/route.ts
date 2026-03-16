import { NextRequest, NextResponse } from 'next/server';
import { DICTATION_WHISPER_PROMPT, ENCOUNTER_WHISPER_PROMPT } from '@/lib/whisper-prompts';
import { getAnthropicClient, getOpenAIClient } from '@/lib/api-keys';

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

async function medicalize(rawText: string, mode: string, context?: string): Promise<string> {
  const contextBlock = context
    ? `\n\nPrevious context for continuity (do NOT repeat, only use to resolve ambiguity):\n"${context}"\n`
    : '';

  const prompt = mode === 'encounter'
    ? `Convert this recorded doctor-patient emergency department encounter into a structured clinical transcript. Rules:
- Identify and label speakers as "Dr:" and "Pt:" (or "Family:" if applicable)
- Convert patient's colloquial descriptions into medically relevant language while preserving their reported symptoms and timeline
- Convert physician's spoken language into proper medical terminology
- Preserve all clinically relevant information — do NOT add, infer, or remove details
- Fix filler words, false starts, and repetition
- Use concise, professional formatting
- Output ONLY the converted transcript, nothing else
- If the input contains no clinical content (e.g. just greetings, filler, or noise), output exactly: EMPTY

Recording:
${rawText}`
    : `Convert voice-dictated physician notes into proper medical documentation. Rules:
- Replace colloquial terms with medical terminology (e.g., "belly"→"abdomen", "heart attack"→"MI", "blood pressure"→"BP", "sugar"→"glucose", "blood thinner"→"anticoagulant")
- Fix common speech-to-text errors: "CPA"→"CVA", "tendered"→"tender", "new Monya"→"pneumonia", "be a pap"→"BiPAP", "see pap"→"CPAP", "sack row"→"sacro", "die a bee tees"→"diabetes", "epigastric"→"epigastric", "anti-buy-otics"→"antibiotics"
- Preserve all clinical information exactly — do NOT add, infer, or remove details
- Use concise physician charting style and standard abbreviations
- Output as a single continuous block — no added line breaks unless input has them
- Output ONLY the converted text, nothing else
- If no clinical content (greetings, filler, noise), output exactly: EMPTY${contextBlock}

Dictation:
${rawText}`;

  const anthropic = await getAnthropicClient();
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const result = response.content[0].type === 'text' ? response.content[0].text : '';
  const trimmed = result.trim();
  // If Claude flagged as empty/no content, return empty string
  if (!trimmed || trimmed === 'EMPTY') return '';
  return trimmed;
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

    // Whisper uses the prompt for style/vocabulary conditioning AND context continuity.
    // Appending the last ~50 words of previous text helps Whisper maintain context
    // across segments (correct spelling, terminology consistency, fewer hallucinations).
    const contextTail = context
      ? context.split(/\s+/).slice(-50).join(' ')
      : '';
    const whisperPrompt = contextTail
      ? `${basePrompt}. Previous context: ${contextTail}`
      : basePrompt;

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
