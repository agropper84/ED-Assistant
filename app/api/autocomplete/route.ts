import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSessionFromCookies } from '@/lib/session';

export const maxDuration = 10;

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId || !session.accessToken) {
      return NextResponse.json({ completion: '' }, { status: 401 });
    }

    const { partial, context } = await req.json();

    if (!partial || typeof partial !== 'string' || partial.length < 3) {
      return NextResponse.json({ completion: '' });
    }

    const { age, gender, chiefComplaint, textBefore } = context || {};

    const contextLines: string[] = [];
    if (age) contextLines.push(`Age: ${age}`);
    if (gender) contextLines.push(`Gender: ${gender}`);
    if (chiefComplaint) contextLines.push(`Chief complaint: ${chiefComplaint}`);

    const patientInfo = contextLines.length > 0
      ? contextLines.join(', ')
      : 'No patient info available';

    // Last 500 chars for document flow context
    const recentText = textBefore
      ? textBefore.slice(-500)
      : '';

    const prompt = `You are an autocomplete engine for an emergency department physician writing clinical encounter notes.

Patient: ${patientInfo}

${recentText ? `Recent text in document:\n${recentText}\n\n` : ''}The physician is currently typing this sentence:
"${partial}"

Output ONLY the remaining text to complete this sentence. Rules:
- Do NOT repeat any part of what's already typed
- One sentence maximum — stop at the first period
- Clinical shorthand is OK (e.g. "pt", "yo", "hx", "dx", "tx", "c/o", "s/p")
- Be concise and clinically appropriate
- Output nothing but the completion text, no quotes, no explanation`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    let completion = '';
    const block = message.content[0];
    if (block.type === 'text') {
      completion = block.text;
    }

    // Clean up: strip wrapping quotes
    completion = completion.replace(/^["']|["']$/g, '').trim();

    // If the model echoed the partial, strip it
    const lowerCompletion = completion.toLowerCase();
    const lowerPartial = partial.toLowerCase();
    if (lowerCompletion.startsWith(lowerPartial)) {
      completion = completion.substring(partial.length);
    }

    // Cap at first sentence boundary
    const sentenceEnd = completion.search(/\.\s|\.$/);
    if (sentenceEnd !== -1) {
      completion = completion.substring(0, sentenceEnd + 1);
    }

    return NextResponse.json({ completion: completion.trim() });
  } catch (error) {
    console.error('Autocomplete error:', error);
    return NextResponse.json({ completion: '' });
  }
}
