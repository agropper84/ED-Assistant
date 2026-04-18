import { NextRequest, NextResponse } from 'next/server';
import { callWithPHIProtection } from '@/lib/claude';
import { getDataContext, getPatient, updatePatientFields } from '@/lib/data-layer';
import { verifyLinks } from '@/lib/verify-links';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { analysisSchema } from '@/lib/schemas';
import { MODELS } from '@/lib/config';

export const maxDuration = 30;

export const POST = withApiHandler(
  { rateLimit: { limit: 20, window: 60 }, auditEvent: 'generate.analysis' },
  async (request: NextRequest) => {
    const { rowIndex, sheetName, section, educationMode } = await parseBody(request, analysisSchema);
    const ctx = await getDataContext();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const parts: string[] = [];
    if (patient.hpi) parts.push(`HPI: ${patient.hpi}`);
    if (patient.objective) parts.push(`Objective: ${patient.objective}`);
    if (patient.assessmentPlan) parts.push(`Assessment & Plan: ${patient.assessmentPlan}`);
    if (patient.diagnosis) parts.push(`Diagnosis: ${patient.diagnosis}`);
    if (patient.triageVitals) parts.push(`Triage Notes: ${patient.triageVitals}`);
    if (patient.transcript) parts.push(`Transcript: ${patient.transcript}`);
    if (patient.additional) parts.push(`Additional Findings: ${patient.additional}`);

    if (parts.length === 0) {
      return NextResponse.json({ error: 'No clinical data available' }, { status: 400 });
    }

    const sectionPrompts: Record<string, string> = {
      management: `Provide a recommended management plan including medications, procedures, disposition planning, and follow-up. Use narrative form.`,
      evidence: `Cite pertinent evidence, guidelines, or clinical decision rules relevant to this presentation. ONLY use URLs you are confident are real — use PubMed links with actual PMIDs. If unsure of a URL, cite by name without a link. Use narrative form with [Name](URL) markdown links.`,
    };

    const ddxInstruction = educationMode
      ? `List a BROAD differential diagnosis for educational purposes. Include common, uncommon, and must-not-miss diagnoses — even unlikely ones worth considering. For each, include brief reasoning for why it should be on the differential and key distinguishing features. Aim for 8-15 diagnoses ranked by likelihood.`
      : `List the differential diagnoses ranked by likelihood. Include brief reasoning.`;

    let prompt: string;
    if (section === 'ddx-investigations') {
      prompt = `You are an experienced emergency medicine physician. Based on the following patient data, generate ONLY the differential diagnosis and recommended investigations.

Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

${parts.join('\n\n')}

Respond in EXACTLY this format:

===DDX===
${ddxInstruction}

===INVESTIGATIONS===
List recommended investigations/workup.`;
    } else if (section === 'management-evidence') {
      prompt = `You are an experienced emergency medicine physician. Based on the following patient data, generate ONLY the management plan and supporting evidence.

Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

${parts.join('\n\n')}

Respond in EXACTLY this format:

===MANAGEMENT===
Provide recommended management steps including disposition planning.

===EVIDENCE===
Cite pertinent evidence, guidelines, or clinical decision rules relevant to this presentation. ONLY use URLs you are confident are real. If unsure of a URL, cite by name without a link.`;
    } else if (section && sectionPrompts[section]) {
      prompt = `You are an experienced physician. Based on the following patient data, generate ONLY the ${section} section.

Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

${parts.join('\n\n')}

${sectionPrompts[section]}

Output ONLY the ${section} content, nothing else.`;
    } else {
      prompt = `You are an experienced emergency medicine physician. Based on the following patient data, generate a differential diagnosis, recommended management plan, and pertinent evidence-based references.

Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

${parts.join('\n\n')}

Respond in EXACTLY this format with these section headers:

===DDX===
${ddxInstruction}

===INVESTIGATIONS===
List recommended investigations/workup.

===MANAGEMENT===
Provide recommended management steps including disposition planning.

===EVIDENCE===
Cite pertinent evidence, guidelines, or clinical decision rules relevant to this presentation. ONLY use URLs you are confident are real. If unsure of a URL, cite by name without a link.`;
    }

    // PHI protection is handled by callWithPHIProtection
    let text = await callWithPHIProtection(
      prompt,
      { name: patient.name, age: patient.age, gender: patient.gender, birthday: patient.birthday, triageVitals: patient.triageVitals, transcript: patient.transcript, additional: patient.additional, pastDocs: patient.pastDocs },
      { model: MODELS.fast, maxTokens: 2048, temperature: 0.3 },
    );

    text = await verifyLinks(text);

    const fields: Record<string, string> = {};
    const getSection = (key: string): string => {
      const regex = new RegExp(`===${key}===\\s*([\\s\\S]*?)(?====\\w|$)`);
      const match = text.match(regex);
      return match ? match[1].trim() : '';
    };

    if (section === 'ddx-investigations') {
      const ddx = getSection('DDX');
      const investigations = getSection('INVESTIGATIONS');
      if (ddx) fields.ddx = ddx;
      if (investigations) fields.investigations = investigations;
    } else if (section === 'management-evidence') {
      const management = getSection('MANAGEMENT');
      const evidence = getSection('EVIDENCE');
      if (management) fields.management = management;
      if (evidence) fields.evidence = evidence;
    } else if (section) {
      if (text.trim()) fields[section] = text.trim();
    } else {
      const ddx = getSection('DDX');
      const investigations = getSection('INVESTIGATIONS');
      const management = getSection('MANAGEMENT');
      const evidence = getSection('EVIDENCE');

      if (ddx) fields.ddx = ddx;
      if (investigations) fields.investigations = investigations;
      if (management) fields.management = management;
      if (evidence) fields.evidence = evidence;
    }

    if (Object.keys(fields).length > 0) {
      await updatePatientFields(ctx, rowIndex, fields, sheetName, patient.name);
    }

    return NextResponse.json({ success: true, ...fields });
  }
);
