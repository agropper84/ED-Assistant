import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getAnthropicClient } from '@/lib/api-keys';

export const maxDuration = 15;

// POST /api/shortcuts/icd-lookup
// Body: { diagnosis }
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const anthropic = await getAnthropicClient();
    const { diagnosis } = await request.json();

    if (!diagnosis) {
      return NextResponse.json({ error: 'diagnosis is required' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: `For the diagnosis "${diagnosis}", provide the most appropriate ICD-9 and ICD-10 codes. Return ONLY valid JSON: {"icd9": "code", "icd10": "code"}. If multiple codes apply, use the most specific primary code.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    try {
      const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      const result = JSON.parse(cleaned);
      return NextResponse.json({ icd9: result.icd9 || '', icd10: result.icd10 || '' });
    } catch {
      return NextResponse.json({ icd9: '', icd10: '', raw: text });
    }
  } catch (error: any) {
    console.error('Shortcut ICD lookup error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
