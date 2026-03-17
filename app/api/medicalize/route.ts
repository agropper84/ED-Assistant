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
      messages: [{
        role: 'user',
        content: `Clean up voice-dictated physician notes. Rules:
- PRESERVE ALL CONTENT — history, mechanism of injury, social context, patient narrative, and clinical details must ALL be kept.
- Replace medical colloquialisms with proper terminology ONLY where clearly medical (e.g., "belly"→"abdomen", "heart attack"→"MI", "blood pressure"→"BP")
- Do NOT medicalize non-medical descriptions — keep mechanism of injury, activities, and context as dictated
- Fix any remaining speech-to-text errors
- Clean up filler words, false starts, and repetition
- Use concise physician charting style
- Output as a single continuous block
- Output ONLY the cleaned text, nothing else
- ONLY output EMPTY if truly just noise/silence artifacts${contextBlock}

Text:
${text}`,
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
