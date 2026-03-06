import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSheetsContext, getPatient, updatePatientFields } from '@/lib/google-sheets';

export const maxDuration = 30;

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName } = await request.json();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build context from available clinical data (processed or raw)
    const parts: string[] = [];
    if (patient.hpi) parts.push(`HPI: ${patient.hpi}`);
    if (patient.objective) parts.push(`Objective: ${patient.objective}`);
    if (patient.assessmentPlan) parts.push(`Assessment & Plan: ${patient.assessmentPlan}`);
    if (patient.diagnosis) parts.push(`Diagnosis: ${patient.diagnosis}`);
    // Fall back to raw data if no processed output
    if (!patient.hasOutput) {
      if (patient.triageVitals) parts.push(`Triage Notes: ${patient.triageVitals}`);
      if (patient.transcript) parts.push(`Transcript: ${patient.transcript}`);
      if (patient.additional) parts.push(`Additional Findings: ${patient.additional}`);
    }

    if (parts.length === 0) {
      return NextResponse.json({ error: 'No clinical data available' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: `You are an ED physician's assistant. Write a 3-5 sentence clinical synopsis summarizing this patient encounter. Be concise and focus on the key clinical picture, working diagnosis, and plan. Use professional medical language.

Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

${parts.join('\n\n')}

Write ONLY the synopsis, no headers or labels.`,
      }],
    });

    const synopsis = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    await updatePatientFields(ctx, rowIndex, { synopsis }, sheetName);

    return NextResponse.json({ synopsis });
  } catch (error: any) {
    console.error('Error generating synopsis:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to generate synopsis', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
