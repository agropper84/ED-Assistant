import { NextRequest, NextResponse } from 'next/server';
import { parsePatientInfo, getRoundedTime } from '@/lib/parse-patient';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export const maxDuration = 30;

// POST /api/parse - Parse patient data
export async function POST(request: NextRequest) {
  try {
    const { text, parseRules, formatExample } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    // If a format example is provided, use AI to parse by analogy
    if (formatExample?.sampleText && formatExample?.fieldName) {
      const result = await parseWithAI(text, formatExample);
      const timestamp = getRoundedTime();
      return NextResponse.json({ ...result, timestamp });
    }

    // Otherwise fall back to regex-based parsing
    const parsed = parsePatientInfo(text, parseRules || undefined);
    const timestamp = getRoundedTime();

    return NextResponse.json({
      ...parsed,
      timestamp,
    });
  } catch (error) {
    console.error('Error parsing patient data:', error);
    return NextResponse.json(
      { error: 'Failed to parse patient data' },
      { status: 500 }
    );
  }
}

interface FormatExample {
  sampleText: string;
  fieldName: string;
  fieldAge: string;
  fieldGender: string;
  fieldDob: string;
  fieldMrn: string;
  fieldHcn: string;
}

async function parseWithAI(
  newText: string,
  example: FormatExample,
): Promise<{ name: string; age: string; gender: string; birthday: string; hcn: string; mrn: string }> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Extract patient demographics from EMR text. I'll show you an example of the format first, then the actual text to parse.

EXAMPLE EMR TEXT:
---
${example.sampleText}
---

In that example, the fields are:
${example.fieldName ? `- Name: "${example.fieldName}"` : ''}
${example.fieldAge ? `- Age: "${example.fieldAge}"` : ''}
${example.fieldGender ? `- Gender: "${example.fieldGender}"` : ''}
${example.fieldDob ? `- DOB: "${example.fieldDob}"` : ''}
${example.fieldMrn ? `- MRN: "${example.fieldMrn}"` : ''}
${example.fieldHcn ? `- HCN: "${example.fieldHcn}"` : ''}

NOW PARSE THIS NEW TEXT (same format):
---
${newText}
---

Return ONLY a JSON object with these fields: name, age, gender, birthday, hcn, mrn. Use empty string for any field not found.`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { name: '', age: '', gender: '', birthday: '', hcn: '', mrn: '' };
  }

  try {
    const parsed = JSON.parse(match[0]);
    return {
      name: parsed.name?.toString() || '',
      age: parsed.age?.toString() || '',
      gender: parsed.gender?.toString() || '',
      birthday: (parsed.birthday || parsed.dob)?.toString() || '',
      hcn: parsed.hcn?.toString() || '',
      mrn: parsed.mrn?.toString() || '',
    };
  } catch {
    return { name: '', age: '', gender: '', birthday: '', hcn: '', mrn: '' };
  }
}
