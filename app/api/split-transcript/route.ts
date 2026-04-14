import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';
import { getSessionFromCookies } from '@/lib/session';
import { MODELS } from '@/lib/config';

export const maxDuration = 60;

interface SplitSegment {
  patientName: string;
  transcript: string;
  matched: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const anthropic = await getAnthropicClient();
    // Auth check
    const session = await getSessionFromCookies();
    if (!session.userId || !session.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { transcript, patientNames } = await request.json();

    if (!transcript || !patientNames || patientNames.length === 0) {
      return NextResponse.json(
        { error: 'Transcript and patient names are required' },
        { status: 400 }
      );
    }

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 4096,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `You are helping split a multi-patient medical dictation transcript into segments, one per patient.

PATIENT LIST (these are the patients seen today):
${patientNames.map((n: string, i: number) => `${i + 1}. ${n}`).join('\n')}

TRANSCRIPT:
${transcript}

INSTRUCTIONS:
- The physician dictated notes for multiple patients in sequence in a single recording.
- Identify where one patient's notes end and the next patient's begin.
- Match each segment to a patient from the list above. The physician may refer to patients by first name, last name, or partial name (e.g., "Mr. Smith" for "Smith, John").
- If a segment cannot be matched to any patient on the list, use the name as spoken in the transcript.
- Preserve the full transcript text — do not summarize or modify the dictated content.
- Return ONLY valid JSON, no other text.

Return a JSON array in this exact format:
[
  { "patientName": "exact name from list or as spoken", "transcript": "full dictated text for this patient" }
]`
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON from response (handle markdown code blocks)
    let parsed: Array<{ patientName: string; transcript: string }>;
    try {
      const jsonStr = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse split results', raw: text },
        { status: 500 }
      );
    }

    // Mark each segment as matched or unmatched
    const nameSet = new Set(patientNames.map((n: string) => n.toLowerCase()));
    const segments: SplitSegment[] = parsed.map(seg => ({
      patientName: seg.patientName,
      transcript: seg.transcript,
      matched: nameSet.has(seg.patientName.toLowerCase()),
    }));

    return NextResponse.json({ segments });
  } catch (error: any) {
    console.error('Error splitting transcript:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to split transcript', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
