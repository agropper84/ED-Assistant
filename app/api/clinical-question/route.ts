import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSheetsContext, getPatient, updatePatientFields } from '@/lib/google-sheets';

export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

interface QAMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName, question, history } = await request.json();

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build patient context for the system prompt
    const contextParts: string[] = [];

    if (patient.name || patient.age || patient.gender) {
      contextParts.push(`**Demographics:** ${patient.name || 'Unknown'}, ${patient.age || '?'}${patient.gender ? ` ${patient.gender}` : ''}`);
    }
    if (patient.birthday) contextParts.push(`**DOB:** ${patient.birthday}`);
    if (patient.diagnosis) contextParts.push(`**Diagnosis:** ${patient.diagnosis}`);
    if (patient.icd10) contextParts.push(`**ICD-10:** ${patient.icd10}`);
    if (patient.triageVitals) contextParts.push(`**Triage/Vitals:**\n${patient.triageVitals}`);
    if (patient.transcript) contextParts.push(`**Encounter Transcript:**\n${patient.transcript}`);
    if (patient.additional) contextParts.push(`**Additional Info:**\n${patient.additional}`);
    if (patient.pastDocs) contextParts.push(`**Past Documents:**\n${patient.pastDocs}`);
    if (patient.hpi) contextParts.push(`**HPI:**\n${patient.hpi}`);
    if (patient.objective) contextParts.push(`**Objective:**\n${patient.objective}`);
    if (patient.assessmentPlan) contextParts.push(`**Assessment & Plan:**\n${patient.assessmentPlan}`);
    if (patient.ddx) contextParts.push(`**Differential Diagnosis:**\n${patient.ddx}`);
    if (patient.investigations) contextParts.push(`**Investigations:**\n${patient.investigations}`);
    if (patient.synopsis) contextParts.push(`**Synopsis:**\n${patient.synopsis}`);
    if (patient.management) contextParts.push(`**Management:**\n${patient.management}`);
    if (patient.evidence) contextParts.push(`**Evidence:**\n${patient.evidence}`);

    const systemPrompt = `You are a clinical decision support assistant for an emergency department physician. You have access to the following patient data and should answer questions based on this context. Provide concise, evidence-based answers. When relevant, cite guidelines or key studies. Be direct and clinically practical.

## Patient Data
${contextParts.join('\n\n')}`;

    // Build Claude messages from history + new question
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: question.trim() });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0.3,
      system: systemPrompt,
      messages,
    });

    const answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // Build updated QA history
    const now = new Date().toISOString();
    const existingQA: QAMessage[] = (() => {
      try {
        return patient.clinicalQA ? JSON.parse(patient.clinicalQA) : [];
      } catch {
        return [];
      }
    })();

    existingQA.push(
      { role: 'user', content: question.trim(), ts: now },
      { role: 'assistant', content: answer, ts: now },
    );

    await updatePatientFields(ctx, rowIndex, {
      clinicalQA: JSON.stringify(existingQA),
    }, sheetName);

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('Error in clinical question:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to process question', detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}
