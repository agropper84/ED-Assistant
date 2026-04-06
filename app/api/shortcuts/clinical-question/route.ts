import { NextRequest, NextResponse } from 'next/server';
import { authenticateShortcut, isAuthed } from '@/lib/shortcut-auth';
import { getPatient, updatePatientFields } from '@/lib/google-sheets';
import { getAnthropicClient } from '@/lib/api-keys';

export const maxDuration = 30;

// POST /api/shortcuts/clinical-question
// Body: { rowIndex, sheetName, question, history?: [{ role, content }] }
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateShortcut(request);
    if (!isAuthed(auth)) return auth;

    const anthropic = await getAnthropicClient();
    const { rowIndex, sheetName, question, history } = await request.json();

    if (!question) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    const patient = await getPatient(auth.ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build patient context
    const context: string[] = [];
    context.push(`Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}`);
    if (patient.diagnosis) context.push(`Diagnosis: ${patient.diagnosis}`);
    if (patient.hpi) context.push(`HPI: ${patient.hpi}`);
    if (patient.objective) context.push(`Objective: ${patient.objective}`);
    if (patient.assessmentPlan) context.push(`A&P: ${patient.assessmentPlan}`);
    if (patient.triageVitals) context.push(`Triage: ${patient.triageVitals}`);
    if (patient.transcript) context.push(`Transcript: ${patient.transcript}`);
    if (patient.additional) context.push(`Additional: ${patient.additional}`);

    const messages: { role: 'user' | 'assistant'; content: string }[] = [];

    // Add conversation history if provided
    if (Array.isArray(history)) {
      for (const msg of history) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add current question
    messages.push({ role: 'user', content: question });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0.3,
      system: `You are an emergency medicine physician assistant. Answer clinical questions about this patient concisely and accurately. Use evidence-based medicine.\n\n${context.join('\n\n')}`,
      messages,
    });

    const answer = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Save Q&A to patient record
    try {
      const existing = patient.clinicalQA ? JSON.parse(patient.clinicalQA) : [];
      existing.push({ role: 'user', content: question });
      existing.push({ role: 'assistant', content: answer });
      await updatePatientFields(auth.ctx, rowIndex, { clinicalQA: JSON.stringify(existing) }, sheetName);
    } catch {}

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('Shortcut clinical-question error:', error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
