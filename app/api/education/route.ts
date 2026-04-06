import { NextRequest, NextResponse } from 'next/server';
import { getSheetsContext, getPatient, updatePatientFields } from '@/lib/google-sheets';
import { callWithPHIProtection } from '@/lib/claude';
import { verifyLinks } from '@/lib/verify-links';
import { withApiHandler } from '@/lib/api-handler';

export const maxDuration = 60;

export const POST = withApiHandler(
  { rateLimit: { limit: 10, window: 60 } },
  async (request: NextRequest) => {
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName, sources } = await request.json();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const context: string[] = [];
    if (patient.diagnosis) context.push(`Diagnosis: ${patient.diagnosis}`);
    if (patient.ddx) context.push(`DDx: ${patient.ddx}`);
    if (patient.hpi) context.push(`HPI: ${patient.hpi}`);
    if (patient.assessmentPlan) context.push(`Assessment & Plan: ${patient.assessmentPlan}`);
    if (patient.management) context.push(`Management: ${patient.management}`);
    if (patient.investigations) context.push(`Investigations: ${patient.investigations}`);
    if (patient.triageVitals) context.push(`Triage: ${patient.triageVitals}`);

    const sourceConstraint = sources?.trim()
      ? `\n\nPrioritize recommendations from: ${sources}. You may include other high-quality sources as needed.`
      : '';

    const prompt = `You are a medical education consultant. Based on this clinical case, recommend key learning resources for a medical learner (resident, medical student, or new physician) to deepen their understanding of the relevant topics.

CLINICAL CASE:
${context.join('\n\n')}

INSTRUCTIONS:
- Identify the 3-5 most important clinical topics from this case that a learner should study
- For each topic, recommend:
  1. A specific textbook chapter or section (with chapter/page if possible)
  2. A key guideline or clinical practice statement
  3. One landmark study or important review article
- Include clickable markdown hyperlinks [Title](URL) for online resources (PubMed, guidelines, UpToDate topics)
- Focus on high-yield, foundational knowledge
- Be specific (e.g. "Tintinalli's Ch. 67: Acute Coronary Syndromes" not just "read about ACS")
- Use concise format${sourceConstraint}

Respond in this format for each topic:

**Topic Name**
- Textbook: [specific chapter/section]
- Guideline: [specific guideline with link]
- Key literature: [specific study/review with link]`;

    let education = await callWithPHIProtection(
      prompt,
      { name: patient.name, age: patient.age, gender: patient.gender, birthday: patient.birthday, triageVitals: patient.triageVitals, transcript: patient.transcript, additional: patient.additional, pastDocs: patient.pastDocs },
      { model: 'claude-sonnet-4-20250514', maxTokens: 2048, temperature: 0.3 },
    );

    education = await verifyLinks(education);
    await updatePatientFields(ctx, rowIndex, { education }, sheetName);

    return NextResponse.json({ education });
  }
);
