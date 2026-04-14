import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatients } from '@/lib/data-layer';
import { getAnthropicClient } from '@/lib/api-keys';
import { MODELS } from '@/lib/config';

export const maxDuration = 60;

// POST /api/shortcuts/handover
// Body: { sheetName }
// Generates a compiled handover summary for all patients on the sheet
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const anthropic = await getAnthropicClient();
    const { sheetName } = await request.json();

    const patients = await getPatients(auth.dataCtx, sheetName);
    if (patients.length === 0) {
      return NextResponse.json({ error: 'No patients found on this sheet' }, { status: 400 });
    }

    // Build patient summaries
    const summaries = patients.map((p, i) => {
      const parts: string[] = [];
      parts.push(`${i + 1}. ${p.name || 'Unknown'}, ${p.age || '?'} ${p.gender || ''}`);
      if (p.diagnosis) parts.push(`   Dx: ${p.diagnosis}`);
      if (p.synopsis) parts.push(`   Synopsis: ${p.synopsis}`);
      else if (p.hpi) parts.push(`   HPI: ${p.hpi.slice(0, 200)}${p.hpi.length > 200 ? '...' : ''}`);
      if (p.assessmentPlan) parts.push(`   Plan: ${p.assessmentPlan.slice(0, 200)}${p.assessmentPlan.length > 200 ? '...' : ''}`);
      return parts.join('\n');
    }).join('\n\n');

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 2048,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: `You are an ED physician preparing a shift handover. Create a concise handover summary for the following ${patients.length} patients. For each patient include: name, age/sex, diagnosis, brief clinical summary (1-2 sentences), current plan, and any pending items or follow-up needed. Format as a numbered list, professional and scannable.\n\n${summaries}`,
      }],
    });

    const handover = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return NextResponse.json({ handover, patientCount: patients.length });
  } catch (error: any) {
    console.error('Shortcut handover error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
