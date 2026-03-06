import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getSheetsContext, getDateSheets, getPatients } from '@/lib/google-sheets';

export const maxDuration = 30;

/** Extract sentences from a text field, split on ". " and "\n" */
function extractSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\.\s|\n/)
    .map(s => s.trim())
    .filter(s => s.length >= 15 && s.length <= 300);
}

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId || !session.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const ctx = await getSheetsContext();
    const allSheets = await getDateSheets(ctx);
    // Limit to last 30 sheets for performance
    const sheets = allSheets.slice(0, 30);

    // Fetch patients from all sheets in parallel
    const allPatients = (await Promise.all(
      sheets.map(sheet => getPatients(ctx, sheet).catch(() => []))
    )).flat();

    // Extract sentences from processed patients' output fields
    const frequencyMap = new Map<string, number>();

    for (const patient of allPatients) {
      if (patient.status !== 'processed') continue;

      const fields = [patient.hpi, patient.objective, patient.assessmentPlan, patient.ddx, patient.investigations];
      for (const field of fields) {
        for (const sentence of extractSentences(field)) {
          const lower = sentence.toLowerCase();
          frequencyMap.set(lower, (frequencyMap.get(lower) || 0) + 1);
        }
      }
    }

    // Sort by frequency (most common first), cap at 500
    const sentences = Array.from(frequencyMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 500)
      .map(([sentence]) => sentence);

    return NextResponse.json({ sentences });
  } catch (error: any) {
    console.error('Error fetching suggestions:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch suggestions', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
