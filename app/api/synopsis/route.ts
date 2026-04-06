import { NextRequest, NextResponse } from 'next/server';
import { callWithPHIProtection } from '@/lib/claude';
import { getSheetsContext, getPatient, updatePatientFields } from '@/lib/google-sheets';
import { withApiHandler } from '@/lib/api-handler';

export const maxDuration = 30;

export const POST = withApiHandler(
  { rateLimit: { limit: 20, window: 60 } },
  async (request: NextRequest) => {
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName } = await request.json();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const parts: string[] = [];
    if (patient.hpi) parts.push(`HPI: ${patient.hpi}`);
    if (patient.objective) parts.push(`Objective: ${patient.objective}`);
    if (patient.assessmentPlan) parts.push(`Assessment & Plan: ${patient.assessmentPlan}`);
    if (patient.diagnosis) parts.push(`Diagnosis: ${patient.diagnosis}`);
    if (!patient.hasOutput) {
      if (patient.triageVitals) parts.push(`Triage Notes: ${patient.triageVitals}`);
      if (patient.transcript) parts.push(`Transcript: ${patient.transcript}`);
      if (patient.additional) parts.push(`Additional Findings: ${patient.additional}`);
    }

    if (parts.length === 0) {
      return NextResponse.json({ error: 'No clinical data available' }, { status: 400 });
    }

    const prompt = `You are an ED physician's assistant. Write a 3-5 sentence clinical synopsis summarizing this patient encounter. Be concise and focus on the key clinical picture, working diagnosis, and plan. Use professional medical language.

Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

${parts.join('\n\n')}

Write ONLY the synopsis, no headers or labels.`;

    const synopsis = await callWithPHIProtection(
      prompt,
      { name: patient.name, age: patient.age, gender: patient.gender, birthday: patient.birthday, triageVitals: patient.triageVitals, transcript: patient.transcript, additional: patient.additional, pastDocs: patient.pastDocs },
      { model: 'claude-haiku-4-5-20251001', maxTokens: 512, temperature: 0.2 },
    );

    await updatePatientFields(ctx, rowIndex, { synopsis: synopsis.trim() }, sheetName);

    return NextResponse.json({ synopsis: synopsis.trim() });
  }
);
