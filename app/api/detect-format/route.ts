import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';
import { MODELS } from '@/lib/config';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const anthropic = await getAnthropicClient();
    const { sampleText, fields } = await request.json();

    if (!sampleText || !sampleText.trim()) {
      return NextResponse.json(
        { error: 'Missing sampleText' },
        { status: 400 }
      );
    }

    // New mode: user provides sample text + manually identified field values
    if (fields) {
      const response = await anthropic.messages.create({
        model: MODELS.fast,
        max_tokens: 1024,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `You are analyzing a sample of patient data from a hospital EMR system. The user has identified specific field values within the sample text. Your job is to create JavaScript regex patterns that will reliably extract these fields from similar text.

SAMPLE EMR TEXT:
---
${sampleText}
---

USER-IDENTIFIED FIELDS:
${fields.name ? `- Patient Name: "${fields.name}"` : '- Patient Name: (not identified)'}
${fields.age ? `- Age: "${fields.age}"` : '- Age: (not identified)'}
${fields.gender ? `- Gender: "${fields.gender}"` : '- Gender: (not identified)'}
${fields.dob ? `- Date of Birth: "${fields.dob}"` : '- DOB: (not identified)'}
${fields.mrn ? `- MRN: "${fields.mrn}"` : '- MRN: (not identified)'}
${fields.hcn ? `- HCN: "${fields.hcn}"` : '- HCN: (not identified)'}

INSTRUCTIONS:
Look at where each identified value appears in the sample text. Create regex patterns that would extract these values from similarly formatted text. Consider the surrounding context (labels, separators, line positions) to make robust patterns.

Return a JSON object with these fields:
- "ageDobPattern": JavaScript regex where group 1 = age, group 2 = gender (M/F), group 3 = DOB. If gender isn't in the text, make group 2 optional. Use double-escaped backslashes (e.g. "\\\\d+" not "\\d+").
- "hcnPattern": JavaScript regex where group 1 = HCN. Use double-escaped backslashes.
- "mrnPattern": JavaScript regex where group 1 = MRN. Use double-escaped backslashes.
- "nameCleanup": comma-separated words/markers near the name that are NOT part of the patient name (e.g. "ED, ER, IP, Patient:")

Return ONLY valid JSON, no explanation or markdown.`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
      }

      const rules = JSON.parse(match[0]);
      const required = ['ageDobPattern', 'hcnPattern', 'mrnPattern', 'nameCleanup'];
      for (const key of required) {
        if (typeof rules[key] !== 'string') rules[key] = '';
      }

      return NextResponse.json({ rules });
    }

    // Legacy mode: auto-detect from sample text only
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 512,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `You are analyzing a sample of patient data from a hospital EMR system. Your job is to figure out the format and produce regex patterns that can extract patient demographics.

Analyze this sample and return a JSON object with these fields:
- "formatName": short name for the EMR format (e.g. "Meditech", "EPIC", "Cerner", or a descriptive name)
- "ageDobPattern": a JavaScript regex pattern string where capture group 1 = age, group 2 = gender (M/F), group 3 = date of birth. Use double-escaped backslashes for regex special chars (e.g. "\\\\d+" not "\\d+").
- "hcnPattern": a JavaScript regex pattern string where capture group 1 = health card number (HCN). Use double-escaped backslashes.
- "mrnPattern": a JavaScript regex pattern string where capture group 1 = medical record number (MRN). Use double-escaped backslashes.
- "nameCleanup": comma-separated words/markers that appear on the name line but are NOT part of the patient's name (e.g. "ED, ER, IP")

Return ONLY valid JSON, no explanation or markdown.

Sample EMR data:
${sampleText}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const rules = JSON.parse(match[0]);
    const required = ['formatName', 'ageDobPattern', 'hcnPattern', 'mrnPattern', 'nameCleanup'];
    for (const key of required) {
      if (typeof rules[key] !== 'string') rules[key] = '';
    }

    return NextResponse.json({ rules });
  } catch (error: any) {
    console.error('Error detecting format:', error);
    return NextResponse.json(
      { error: 'Failed to detect format', detail: error?.message },
      { status: 500 }
    );
  }
}
