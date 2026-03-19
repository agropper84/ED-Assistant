import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';

export const maxDuration = 60;

// POST /api/parse-daysheet — Parse InputHealth day sheet PDF into patient list
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text from PDF
    let pdfText = '';
    try {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const data = await pdfParse(buffer);
      pdfText = data.text;
    } catch (err) {
      return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 400 });
    }

    if (!pdfText.trim()) {
      return NextResponse.json({ error: 'No text found in PDF' }, { status: 400 });
    }

    // Use AI to extract structured patient data from the day sheet text
    const anthropic = await getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Extract all patient appointments from this InputHealth day sheet into a JSON array.

DAY SHEET TEXT:
---
${pdfText}
---

For each patient/appointment row, extract:
- "time": appointment time (e.g. "10:00")  — convert to 24-hour HH:MM format
- "name": patient full name (Last, First format if possible)
- "dob": date of birth (as shown)
- "hcn": the ID number (health card / PHN)
- "note": the appointment note/reason
- "status": appointment status (e.g. "Confirmed", "Note signed", "Being seen")
- "type": visit type (e.g. "Office visit", "Phone Appointment")
- "phone": phone number from contact info
- "email": email from contact info

Return ONLY a valid JSON array. No explanation.
Example: [{"time":"10:00","name":"Law, Leslie","dob":"1950-09-16","hcn":"9149462633","note":"F/U on last appointment...","status":"Confirmed","type":"Office visit","phone":"+1 236 589 7742","email":"waterfall.law45@gmail.com"}]`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ error: 'Failed to parse patients from day sheet' }, { status: 500 });
    }

    try {
      const patients = JSON.parse(match[0]);
      return NextResponse.json({ patients });
    } catch {
      return NextResponse.json({ error: 'Failed to parse patient data' }, { status: 500 });
    }
  } catch (err: any) {
    if (err.message?.includes('API key')) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('Day sheet parse error:', err);
    return NextResponse.json({ error: 'Failed to process day sheet' }, { status: 500 });
  }
}
