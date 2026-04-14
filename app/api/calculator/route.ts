import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';
import { MODELS } from '@/lib/config';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const anthropic = await getAnthropicClient();
    const { query, patient, history, mode, variables } = await request.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    const context: string[] = [];
    if (patient?.age) context.push(`Age: ${patient.age}`);
    if (patient?.gender) context.push(`Gender: ${patient.gender}`);
    if (patient?.diagnosis) context.push(`Diagnosis: ${patient.diagnosis}`);
    if (patient?.triageVitals) context.push(`Vitals/Triage:\n${patient.triageVitals}`);
    if (patient?.objective) context.push(`Physical Exam/Objective:\n${patient.objective}`);
    if (patient?.investigations) context.push(`Investigations:\n${patient.investigations}`);
    if (patient?.transcript) context.push(`Encounter transcript:\n${patient.transcript.substring(0, 800)}`);
    if (patient?.additional) context.push(`Additional findings:\n${patient.additional.substring(0, 500)}`);
    if (patient?.hpi) context.push(`HPI:\n${patient.hpi.substring(0, 500)}`);

    // Mode 1: Get required variables for a calculator
    if (mode === 'variables') {
      const response = await anthropic.messages.create({
        model: MODELS.fast,
        max_tokens: 1024,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `For the medical calculation "${query}", return a JSON object with the required variables.

PATIENT DATA (search carefully for values like age, weight, creatinine, vitals, labs, etc.):
${context.join('\n\n')}

IMPORTANT EXTRACTION RULES:
- Age: extract from the "Age" field. Convert "45y" to 45. Set source to "patient" if found.
- Gender/Sex: extract from "Gender" field. "M" = male, "F" = female. Set source to "patient" if found.
- Weight: look in vitals, triage notes, transcript, exam, and HPI for weight in kg or lbs. Convert lbs to kg if needed (divide by 2.2). Set source to "patient" if found.
- Serum Creatinine: look in investigations, labs, transcript for creatinine/Cr values (mg/dL or µmol/L). Set source to "patient" if found.
- Heart Rate, BP, SpO2, RR, Temp: look in vitals/triage. Set source to "patient" if found.
- Any other lab values or clinical findings: search all patient data fields.
- If a value is found ANYWHERE in the patient data, set "value" to the number and "source" to "patient".
- Only set "value" to null and "source" to null if the value truly cannot be found.

Return JSON with:
- "name": full calculator name
- "variables": array of { "id": camelCase, "label": display name, "unit": string (e.g. "kg", "mg/dL", "years"), "type": "number" or "select", "options": (for select only) [{ "label": string, "value": number }], "value": number or null, "source": "patient" or null }
- "formula": brief formula description
- "mdcalcUrl": MDCalc URL or null

Return ONLY valid JSON.`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return NextResponse.json({ error: 'Failed to parse variables' }, { status: 500 });

      try {
        const parsed = JSON.parse(match[0]);
        return NextResponse.json({ variables: parsed });
      } catch {
        return NextResponse.json({ error: 'Failed to parse variables' }, { status: 500 });
      }
    }

    // Mode 2: Calculate with provided variable values
    if (mode === 'calculate' && variables) {
      const varList = Object.entries(variables)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

      const response = await anthropic.messages.create({
        model: MODELS.fast,
        max_tokens: 1024,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Calculate "${query}" with these values:
${varList}

Show the formula, substituted values, step-by-step calculation, and final result with units.
Include clinical interpretation of the result (e.g. normal vs abnormal, stage/severity).
Include a link to the relevant MDCalc page if applicable: [Calculator Name](https://www.mdcalc.com/calc/...)
Be concise. Use markdown.`,
        }],
      });

      const result = response.content[0].type === 'text' ? response.content[0].text : '';
      return NextResponse.json({ result });
    }

    // Mode 3: Free-form chat (plain calculator, dose calc, follow-up)
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (history && Array.isArray(history)) {
      for (const m of history) messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: 'user', content: query.trim() });

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 1024,
      temperature: 0,
      system: `You are a medical calculator assistant with access to patient data.

PATIENT DATA:
${context.join('\n')}

INSTRUCTIONS:
- Auto-fill values from patient data where possible, note as "(from patient data)"
- Show formula, inputs, calculation steps, and result
- Include MDCalc link if applicable
- For drug doses: show weight-based formula and calculated dose
- For plain math: just calculate
- Be concise, use markdown`,
      messages,
    });

    const result = response.content[0].type === 'text' ? response.content[0].text : '';
    return NextResponse.json({ result });
  } catch (err: any) {
    if (err.message?.includes('API key')) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('Calculator error:', err);
    return NextResponse.json({ error: 'Calculation failed' }, { status: 500 });
  }
}
