import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const anthropic = await getAnthropicClient();
    const { text, operation, hint, context, expandInstructions, shortenInstructions } = await request.json();

    if (!text || !operation) {
      return NextResponse.json({ error: 'Missing text or operation' }, { status: 400 });
    }

    let prompt: string;

    if (operation === 'expand') {
      const instructions = expandInstructions || 'Rewrite ONLY the selected text with more detail incorporated. Keep the same clinical voice and style. Do not add information that wouldn\'t be known from the context. Output ONLY the rewritten text, nothing else.';
      prompt = `You are helping an emergency department physician edit their encounter documentation.

Here is the selected text from their note:
"${text}"

${context ? `Surrounding context from the same section:\n${context}\n` : ''}${hint ? `The physician wants to add: ${hint}\n` : 'The physician wants more clinical detail added to this text.'}

${instructions}`;
    } else if (operation === 'shorten') {
      const instructions = shortenInstructions || 'Make this more concise while preserving all clinically important information. Remove unnecessary words and redundancy. Keep the same professional tone. Output ONLY the shortened text, nothing else.';
      prompt = `You are helping an emergency department physician edit their encounter documentation.

Here is the selected text from their note:
"${text}"

${context ? `Surrounding context from the same section:\n${context}\n` : ''}${instructions}`;
    } else {
      return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Error editing text:', error);
    return NextResponse.json(
      { error: 'Failed to edit text', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
