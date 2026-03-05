import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSheetsContext, getPatient, updatePatientFields, getStyleGuideFromSheet } from '@/lib/google-sheets';

export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

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

export async function POST(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName, section, updates } = await request.json();

    if (!section || !SECTION_LABELS[section]) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build style guidance from sheet
    let styleSection = '';
    try {
      const guide = await getStyleGuideFromSheet(ctx);
      const parts: string[] = [];
      const sectionExamples = guide.examples[section as keyof typeof guide.examples];
      if (sectionExamples?.length > 0) {
        parts.push(`Style examples for this section:\n${sectionExamples.map((e: string, i: number) => `Example ${i + 1}:\n${e}`).join('\n\n')}`);
      }
      if (guide.extractedFeatures.length > 0) {
        parts.push(`Style features: ${guide.extractedFeatures.join(', ')}`);
      }
      if (guide.customGuidance) {
        parts.push(`Charting guidance: ${guide.customGuidance}`);
      }
      if (parts.length > 0) {
        styleSection = `\nSTYLE GUIDANCE:\n${parts.join('\n')}\nMatch the writing style described above.\n`;
      }
    } catch {}

    // Get settings
    let model = 'claude-sonnet-4-20250514';
    let temperature = 0.3;

    const prompt = `You are an AI assistant helping an emergency department physician update one section of their encounter documentation.

PATIENT: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

SOURCE DATA:
${patient.triageVitals ? `Triage: ${patient.triageVitals}\n` : ''}${patient.transcript ? `Transcript: ${patient.transcript}\n` : ''}${patient.additional ? `Additional: ${patient.additional}\n` : ''}
CURRENT ${SECTION_LABELS[section].toUpperCase()}:
${(patient as any)[section] || 'Not yet documented'}

${updates ? `PHYSICIAN'S UPDATES/CORRECTIONS:\n${updates}\n` : ''}
OTHER SECTIONS FOR CONTEXT:
${section !== 'hpi' ? `HPI: ${patient.hpi}\n` : ''}${section !== 'objective' ? `Objective: ${patient.objective}\n` : ''}${section !== 'assessmentPlan' ? `Assessment & Plan: ${patient.assessmentPlan}\n` : ''}
${styleSection}
Regenerate ONLY the ${SECTION_LABELS[section]} section, incorporating the physician's updates/corrections into the existing content. Keep all existing accurate information. Do NOT add information not in the source data or updates.

${SECTION_INSTRUCTIONS[section]}

Respond with ONLY the regenerated section content. No headers, labels, or extra text.`;

    const response = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const regenerated = text.trim();

    // Save to sheet
    await updatePatientFields(ctx, rowIndex, { [section]: regenerated }, sheetName);

    return NextResponse.json({ success: true, content: regenerated });
  } catch (error: any) {
    console.error('Error regenerating section:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to regenerate section', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
