import { NextRequest, NextResponse } from 'next/server';
import { callWithPHIProtection } from '@/lib/claude';
import { getDataContext, getPatient, updatePatientFields } from '@/lib/data-layer';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { clinicalQuestionSchema } from '@/lib/schemas';
import { MODELS } from '@/lib/config';

export const maxDuration = 60;

interface QAMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export const POST = withApiHandler(
  { rateLimit: { limit: 20, window: 60 }, auditEvent: 'clinical.question' },
  async (request: NextRequest) => {
    const { rowIndex, sheetName, question, history, useOpenEvidence } = await parseBody(request, clinicalQuestionSchema);
    const ctx = await getDataContext();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build structured profile context (PMHx, medications, allergies, etc.)
    let profileContext = '';
    if (patient.profile) {
      try {
        const prof = JSON.parse(patient.profile);
        const parts: string[] = [];
        if (prof.age) parts.push(`Age: ${prof.age}`);
        if (prof.gender) parts.push(`Gender: ${prof.gender}`);
        if (prof.pmhx?.length) parts.push(`PMHx: ${prof.pmhx.join(', ')}`);
        if (prof.medications?.length) parts.push(`Medications: ${prof.medications.join(', ')}`);
        if (prof.allergies?.length) parts.push(`Allergies: ${prof.allergies.join(', ')}`);
        if (prof.surgicalHx?.length) parts.push(`Surgical Hx: ${prof.surgicalHx.join(', ')}`);
        if (prof.socialHx) parts.push(`Social Hx: ${prof.socialHx}`);
        if (prof.familyHx) parts.push(`Family Hx: ${prof.familyHx}`);
        if (parts.length) profileContext = parts.join('\n');
      } catch {}
    }

    // Build patient context
    const contextParts: string[] = [];
    if (patient.name || patient.age || patient.gender) {
      contextParts.push(`**Demographics:** ${patient.name || 'Unknown'}, ${patient.age || '?'}${patient.gender ? ` ${patient.gender}` : ''}`);
    }
    if (patient.birthday) contextParts.push(`**DOB:** ${patient.birthday}`);
    if (profileContext) contextParts.push(`**Patient Profile:**\n${profileContext}`);
    if (patient.diagnosis) contextParts.push(`**Diagnosis:** ${patient.diagnosis}`);
    if (patient.icd10) contextParts.push(`**ICD-10:** ${patient.icd10}`);
    if (patient.triageVitals) contextParts.push(`**Triage/Vitals:**\n${patient.triageVitals}`);
    if (patient.encounterNotes) contextParts.push(`**Encounter Notes:**\n${patient.encounterNotes}`);
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

    const systemPrompt = useOpenEvidence
      ? `You are a clinical decision support assistant for a physician. Answer based on the patient data below. Provide thorough, evidence-based answers with citations. Include guideline references with markdown hyperlinks [Name](URL) where possible. Consider the patient's demographics, comorbidities, and medications when formulating your answer.

## Patient Data
${contextParts.join('\n\n')}`
      : `You are a clinical decision support assistant. Answer concisely based on the patient data below. Be direct — lead with the answer, then brief rationale. Use 2-4 sentences unless the question requires more. Cite key guidelines by name when relevant. Consider the patient's demographics, comorbidities, and medications when formulating your answer.

## Patient Data
${contextParts.join('\n\n')}`;

    const patientDataForPHI = {
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      birthday: patient.birthday,
      triageVitals: patient.triageVitals,
      transcript: patient.transcript,
      encounterNotes: patient.encounterNotes,
      additional: patient.additional,
      pastDocs: patient.pastDocs,
      profile: patient.profile,
    };

    // Reframe for OE if requested
    let oeQuery: string | undefined;
    if (useOpenEvidence) {
      oeQuery = await callWithPHIProtection(
        `Rewrite this clinical question to be a standalone, specific medical query suitable for a medical evidence search engine. Include the relevant patient context (age, sex, diagnosis, key findings) directly in the question so it can be understood without any other context. Keep it under 2 sentences. Do NOT include patient name or identifiers.

Patient context:
${contextParts.slice(0, 5).join('\n')}

Original question: "${question.trim()}"

Output ONLY the reframed question, nothing else.`,
        patientDataForPHI,
        { model: MODELS.fast, maxTokens: 200, temperature: 0 },
      );
      oeQuery = oeQuery.trim();
    }

    // Build conversation prompt with history
    const conversationParts: string[] = [];
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        conversationParts.push(`${msg.role === 'user' ? 'Question' : 'Answer'}: ${msg.content}`);
      }
    }
    conversationParts.push(`Question: ${question.trim()}`);

    const fullPrompt = `${systemPrompt}\n\n${conversationParts.join('\n\n')}\n\nAnswer:`;

    const answer = await callWithPHIProtection(
      fullPrompt,
      patientDataForPHI,
      {
        model: useOpenEvidence ? MODELS.default : MODELS.fast,
        maxTokens: useOpenEvidence ? 2048 : 1024,
        temperature: 0.2,
      },
    );

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
  }
);
