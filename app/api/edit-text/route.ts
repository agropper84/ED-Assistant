import { NextRequest, NextResponse } from 'next/server';
import { callWithPHIProtection } from '@/lib/claude';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { editTextSchema } from '@/lib/schemas';
import { MODELS } from '@/lib/config';

export const maxDuration = 30;

export const POST = withApiHandler(
  { rateLimit: { limit: 30, window: 60 }, auditEvent: 'generate.edit' },
  async (request: NextRequest) => {
    const { text, operation, hint, context, expandInstructions, shortenInstructions } = await parseBody(request, editTextSchema);

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

    // Text editing may contain PHI — pass null for patientData since we don't have structured patient info
    const result = await callWithPHIProtection(
      prompt,
      null,
      { model: MODELS.default, maxTokens: 1024, temperature: 0.2 },
    );

    return NextResponse.json({ success: true, result: result.trim() });
  }
);
