import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { sampleText } = await request.json();

    if (!sampleText || !sampleText.trim()) {
      return NextResponse.json(
        { error: 'Missing sampleText' },
        { status: 400 }
      );
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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

    // Extract JSON object from response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    const rules = JSON.parse(match[0]);

    // Validate required fields exist
    const required = ['formatName', 'ageDobPattern', 'hcnPattern', 'mrnPattern', 'nameCleanup'];
    for (const key of required) {
      if (typeof rules[key] !== 'string') {
        rules[key] = '';
      }
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
