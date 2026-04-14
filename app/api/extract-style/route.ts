import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';
import { MODELS } from '@/lib/config';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const anthropic = await getAnthropicClient();
    const { example, section, existingFeatures } = await request.json();

    if (!example || !section) {
      return NextResponse.json(
        { error: 'Missing example or section' },
        { status: 400 }
      );
    }

    const existingList = (existingFeatures || []).length > 0
      ? `\n\nAlready detected features (DO NOT duplicate these):\n${(existingFeatures as string[]).map((f: string) => `- ${f}`).join('\n')}`
      : '';

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 512,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: `Analyze this emergency department ${section} documentation example and extract 3-6 key charting style features. Focus on:
- Voice and tense (e.g. "third person, past tense")
- Abbreviation patterns (e.g. "heavy use of standard medical abbreviations")
- Structure (e.g. "bullet point format" or "paragraph narrative")
- Detail level (e.g. "concise, focused on pertinent positives/negatives")
- Sentence style (e.g. "short declarative sentences" or "complex compound sentences")
- Any distinctive patterns

Return ONLY a JSON array of short feature strings (3-8 words each). No explanation.${existingList}

Example documentation:
${example}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ features: [] });
    }

    const features: string[] = JSON.parse(match[0]);
    // Filter out any that duplicate existing features (case-insensitive)
    const existingLower = new Set((existingFeatures || []).map((f: string) => f.toLowerCase()));
    const newFeatures = features.filter(
      (f: string) => typeof f === 'string' && f.trim() && !existingLower.has(f.toLowerCase().trim())
    );

    return NextResponse.json({ features: newFeatures });
  } catch (error: any) {
    console.error('Error extracting style features:', error);
    return NextResponse.json(
      { error: 'Failed to extract features', detail: error?.message },
      { status: 500 }
    );
  }
}
