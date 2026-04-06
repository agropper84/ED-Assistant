import { NextRequest, NextResponse } from 'next/server';
import { callWithPHIProtection } from '@/lib/claude';
import { withApiHandler } from '@/lib/api-handler';

export const maxDuration = 30;

export const POST = withApiHandler(
  { rateLimit: { limit: 30, window: 60 } },
  async (request: NextRequest) => {
    const { text, context } = await request.json();
    if (!text?.trim()) return NextResponse.json({ text: '' });

    const contextBlock = context
      ? `\n\nPrevious context for continuity (do NOT repeat, only use to resolve ambiguity):\n"${context}"\n`
      : '';

    const prompt = `You are a medical transcription processor. You receive raw transcribed text from a physician's dictation. Your ONLY job is to clean it up and output the cleaned version. NEVER ask questions, request clarification, or add commentary. NEVER say "I need" or "please provide". Just process whatever text you receive, even if it seems incomplete or fragmentary — it may be a segment of a longer dictation.

Rules:
- PRESERVE ALL CONTENT — every word the physician dictated must be kept
- Replace medical colloquialisms with proper terminology ONLY where clearly medical (e.g., "belly"→"abdomen", "heart attack"→"MI", "blood pressure"→"BP")
- Do NOT medicalize non-medical descriptions (mechanism of injury, activities, context)
- Fix speech-to-text errors
- Clean up filler words, false starts, and repetition
- Output as a single continuous block of text
- Output ONLY the cleaned text — no explanations, no questions, no commentary
- If input is truly just noise/silence (e.g. "Thank you", "Bye"), output EMPTY

${contextBlock}${text}`;

    // Medicalize doesn't have structured patient data — pass null
    const result = await callWithPHIProtection(
      prompt,
      null,
      { model: 'claude-haiku-4-5-20251001', maxTokens: 2048, temperature: 0 },
    );

    const trimmed = result.trim();
    if (!trimmed || trimmed === 'EMPTY') return NextResponse.json({ text: '' });
    return NextResponse.json({ text: trimmed });
  }
);
