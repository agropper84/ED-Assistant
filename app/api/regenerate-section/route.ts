import { NextRequest, NextResponse } from 'next/server';
import { callWithPHIProtection } from '@/lib/claude';
import { getDataContext, getPatient, updatePatientFields } from '@/lib/data-layer';
import { getStyleGuideFromSheet } from '@/lib/google-sheets';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { regenerateSectionSchema } from '@/lib/schemas';
import { MODELS } from '@/lib/config';

export const maxDuration = 60;

const SECTION_LABELS: Record<string, string> = {
  hpi: 'HPI (History of Present Illness)',
  objective: 'Objective / Physical Examination',
  assessmentPlan: 'Assessment & Plan',
};

const SECTION_INSTRUCTIONS: Record<string, string> = {
  hpi: `Narrative summary of patient's presentation. Thoroughly document the history and features supporting the working diagnosis. Document that appropriate red flags have been ruled out. Professional, concise ED physician language. Use paragraph/narrative form, NOT bullet points.`,
  objective: `Physical examination findings ONLY. Use "Patient appears well, NAD. AVSS." for normal, then include ONLY pertinent exam findings that were documented or mentioned. Use narrative form.`,
  assessmentPlan: `Diagnosis or working diagnosis. Summarize assessment leading to diagnosis. Include differential if applicable. Document management plan: investigations ordered, treatments given. Document that appropriate red flags were ruled out. Include return to ED instructions. Use paragraph/narrative form only. No bullet points.`,
};

export const POST = withApiHandler(
  { rateLimit: { limit: 15, window: 60 }, auditEvent: 'generate.edit' },
  async (request: NextRequest) => {
    const { rowIndex, sheetName, section, updates } = await parseBody(request, regenerateSectionSchema);
    const ctx = await getDataContext();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build style guidance
    let styleSection = '';
    try {
      const guide = await getStyleGuideFromSheet(ctx.sheets);
      const parts: string[] = [];
      const sectionExamples = guide.examples[section as keyof typeof guide.examples];
      if (sectionExamples?.length > 0) {
        parts.push(`Style examples for this section:\n${sectionExamples.map((e: string, i: number) => `Example ${i + 1}:\n${e}`).join('\n\n')}`);
      }
      if (guide.extractedFeatures.length > 0) {
        parts.push(`Key style features (secondary to examples above): ${guide.extractedFeatures.join(', ')}`);
      }
      if (guide.customGuidance) {
        parts.push(`Charting guidance: ${guide.customGuidance}`);
      }
      if (parts.length > 0) {
        styleSection = `\nSTYLE GUIDANCE:\nClosely match the tone, structure, and phrasing from the style examples first. Use the key features only to fill in gaps.\n${parts.join('\n')}\n`;
      }
    } catch {}

    const prompt = `You are an AI assistant helping an emergency department physician update one section of their encounter documentation.

PATIENT: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

SOURCE DATA:
${patient.triageVitals ? `Triage: ${patient.triageVitals}\n` : ''}${patient.transcript ? `Transcript: ${patient.transcript}\n` : ''}${patient.additional ? `Additional: ${patient.additional}\n` : ''}
CURRENT ${SECTION_LABELS[section].toUpperCase()}:
${(patient as any)[section] || 'Not yet documented'}

${updates ? `PHYSICIAN'S UPDATES/CORRECTIONS:\n${updates}\n` : ''}${section === 'assessmentPlan' && patient.apNotes ? `PHYSICIAN'S ADDITIONAL NOTES:\n${patient.apNotes}\n` : ''}
OTHER SECTIONS FOR CONTEXT:
${section !== 'hpi' ? `HPI: ${patient.hpi}\n` : ''}${section !== 'objective' ? `Objective: ${patient.objective}\n` : ''}${section !== 'assessmentPlan' ? `Assessment & Plan: ${patient.assessmentPlan}\n` : ''}
${styleSection}
Regenerate ONLY the ${SECTION_LABELS[section]} section, incorporating the physician's updates/corrections into the existing content. Keep all existing accurate information. Do NOT add information not in the source data or updates.

${SECTION_INSTRUCTIONS[section]}

Respond with ONLY the regenerated section content. No headers, labels, or extra text.`;

    const regenerated = await callWithPHIProtection(
      prompt,
      { name: patient.name, age: patient.age, gender: patient.gender, birthday: patient.birthday, triageVitals: patient.triageVitals, transcript: patient.transcript, additional: patient.additional, pastDocs: patient.pastDocs },
      { model: MODELS.default, maxTokens: 2048, temperature: 0.3 },
    );

    await updatePatientFields(ctx, rowIndex, { [section]: regenerated.trim() }, sheetName);

    return NextResponse.json({ success: true, content: regenerated.trim() });
  }
);
