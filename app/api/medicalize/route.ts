import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';

export const maxDuration = 30;

/** Medicalize text only (no transcription). Used when Deepgram handles transcription. */
export async function POST(request: NextRequest) {
  try {
    const { text, context } = await request.json();
    if (!text?.trim()) return NextResponse.json({ text: '' });

    const contextBlock = context
      ? `\n\nPrevious context for continuity (do NOT repeat, only use to resolve ambiguity):\n"${context}"\n`
      : '';

    const anthropic = await getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      temperature: 0,
      system: `You are a medical transcription processor. You receive raw transcribed text from a physician's dictation. Your ONLY job is to clean it up and output the cleaned version. NEVER ask questions, request clarification, or add commentary. NEVER say "I need" or "please provide". Just process whatever text you receive, even if it seems incomplete or fragmentary — it may be a segment of a longer dictation.

Rules:
- PRESERVE ALL CONTENT — every word the physician dictated must be kept
- Replace medical colloquialisms with proper terminology ONLY where clearly medical (e.g., "belly"→"abdomen", "heart attack"→"MI", "blood pressure"→"BP")
- Do NOT medicalize non-medical descriptions (mechanism of injury, activities, context)
- Fix speech-to-text errors
- Clean up filler words, false starts, and repetition
- Output as a single continuous block of text
- Output ONLY the cleaned text — no explanations, no questions, no commentary
- If input is truly just noise/silence (e.g. "Thank you", "Bye"), output EMPTY`,
      messages: [{
        role: 'user',
        content: `${contextBlock}${text}`,
      }],
    });

    const result = response.content[0].type === 'text' ? response.content[0].text : '';
    const trimmed = result.trim();
    if (!trimmed || trimmed === 'EMPTY') return NextResponse.json({ text: '' });
    return NextResponse.json({ text: trimmed });
  } catch (error: any) {
    console.error('Medicalize error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
