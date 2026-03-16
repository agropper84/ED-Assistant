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
    const { rowIndex, sheetName, question, history, useOpenEvidence } = await request.json();

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

    // If Open Evidence is requested, reframe the question with clinical context
    // in parallel with the main AI answer
    let oeQueryPromise: Promise<string> | null = null;
    if (useOpenEvidence) {
      oeQueryPromise = (async () => {
        const reframeRes = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          temperature: 0,
          messages: [{
            role: 'user',
            content: `Rewrite this clinical question to be a standalone, specific medical query suitable for a medical evidence search engine. Include the relevant patient context (age, sex, diagnosis, key findings) directly in the question so it can be understood without any other context. Keep it under 2 sentences. Do NOT include patient name or identifiers.

Patient context:
${contextParts.slice(0, 5).join('\n')}

Original question: "${question.trim()}"

Output ONLY the reframed question, nothing else.`,
          }],
        });
        const text = reframeRes.content[0].type === 'text' ? reframeRes.content[0].text : '';
        return text.trim();
      })();
    }

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

    // Await the reframed OE query if requested
    const oeQuery = oeQueryPromise ? await oeQueryPromise : undefined;

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

    return NextResponse.json({ answer, ...(oeQuery ? { oeQuery } : {}) });
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
