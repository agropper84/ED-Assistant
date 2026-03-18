import { NextRequest, NextResponse } from 'next/server';
import { getSheetsContext, getPatient, updatePatientFields } from '@/lib/google-sheets';
import { getAnthropicClient } from '@/lib/api-keys';
import { verifyLinks } from '@/lib/verify-links';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const anthropic = await getAnthropicClient();
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName, sources } = await request.json();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build clinical context
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

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: `You are a medical education consultant. Based on this clinical case, recommend key learning resources for a medical learner (resident, medical student, or new physician) to deepen their understanding of the relevant topics.

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
- Key literature: [specific study/review with link]`,
      }],
    });

    let education = response.content[0].type === 'text' ? response.content[0].text : '';

    // Verify links — remove broken URLs
    education = await verifyLinks(education);

    // Save to sheet
    await updatePatientFields(ctx, rowIndex, { education }, sheetName);

    return NextResponse.json({ education });
  } catch (err: any) {
    if (err.message?.includes('Not authenticated')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (err.message?.includes('API key')) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('Education generation error:', err);
    return NextResponse.json({ error: 'Failed to generate education resources' }, { status: 500 });
  }
}
