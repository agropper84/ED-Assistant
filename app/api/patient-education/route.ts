import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, getPatient, updatePatientFields } from '@/lib/data-layer';
import { callWithPHIProtection } from '@/lib/claude';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { MODELS } from '@/lib/config';
import { z } from 'zod';

export const maxDuration = 60;

const schema = z.object({
  rowIndex: z.number().int(),
  sheetName: z.string(),
  patientName: z.string().optional(),
  topic: z.string().optional(),
  instructions: z.string().max(2000).optional(),
  language: z.string().optional(),
});

export const POST = withApiHandler(
  { rateLimit: { limit: 10, window: 60 } },
  async (request: NextRequest) => {
    const { rowIndex, sheetName, patientName, topic, instructions, language } = await parseBody(request, schema);
    const ctx = await getDataContext();

    const patient = await getPatient(ctx, rowIndex, sheetName, patientName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const diagnosisTopic = topic?.trim() || patient.diagnosis || '';
    if (!diagnosisTopic) {
      return NextResponse.json({ error: 'No diagnosis or topic specified' }, { status: 400 });
    }

    const context: string[] = [];
    if (patient.diagnosis) context.push(`Diagnosis: ${patient.diagnosis}`);
    if (patient.assessmentPlan) context.push(`Assessment & Plan:\n${patient.assessmentPlan}`);
    if (patient.management) context.push(`Management:\n${patient.management}`);

    const langNote = language?.trim() ? `\n\nIMPORTANT: Write the entire handout in ${language}.` : '';
    const customNote = instructions?.trim() ? `\n\nAdditional instructions from the physician:\n${instructions}` : '';

    const prompt = `You are a patient education specialist creating clear, empathetic handouts for emergency department patients. Write at a grade 6-8 reading level. Use simple language. Be reassuring but accurate.${langNote}

Create a patient education handout about: ${diagnosisTopic}

${context.length > 0 ? `CLINICAL CONTEXT:\n${context.join('\n\n')}\n` : ''}FORMAT:
- Start with a clear title: "Understanding [Condition]"
- What is this condition? (2-3 sentences)
- What did we find? (brief summary based on their assessment)
- What to expect (recovery timeline, normal symptoms)
- Warning signs — when to come back to the ER (bullet list, clear and specific)
- Home care instructions (practical, actionable steps)
- Medications (if mentioned in the plan — dosage reminders, side effects to watch for)
- Follow-up (who to see, when)

Keep it concise (under 500 words). Use short paragraphs and bullet points. Avoid medical jargon — if you must use a medical term, explain it in parentheses.${customNote}`;

    const handout = await callWithPHIProtection(
      prompt,
      { name: patient.name, age: patient.age, gender: patient.gender, birthday: patient.birthday, triageVitals: patient.triageVitals, transcript: patient.transcript, additional: patient.additional, pastDocs: patient.pastDocs },
      { model: MODELS.default, maxTokens: 2048, temperature: 0.3 },
    );

    await updatePatientFields(ctx, rowIndex, { education: handout }, sheetName, patient.name);

    return NextResponse.json({ handout });
  }
);
