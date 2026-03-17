import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';

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
    if (patient?.weight) context.push(`Weight: ${patient.weight}`);
    if (patient?.diagnosis) context.push(`Diagnosis: ${patient.diagnosis}`);
    if (patient?.triageVitals) context.push(`Vitals/Triage: ${patient.triageVitals}`);
    if (patient?.transcript) context.push(`Encounter data: ${patient.transcript.substring(0, 500)}`);
    if (patient?.additional) context.push(`Additional: ${patient.additional.substring(0, 300)}`);

    // Mode 1: Get required variables for a calculator
    if (mode === 'variables') {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `For the medical calculation "${query}", return a JSON object with:
- "name": the full calculator name
- "variables": an array of objects, each with:
  - "id": short camelCase identifier
  - "label": display name
  - "unit": the unit (e.g. "kg", "mg/dL", "years", "mL/min") — empty string if unitless
  - "type": "number" or "select"
  - "options": (only for type "select") array of { "label": string, "value": number } choices
  - "value": pre-filled value from patient data if available, or null if unknown
  - "source": "patient" if pre-filled from data, null otherwise
- "formula": brief description of the formula
- "mdcalcUrl": MDCalc URL if applicable, or null

PATIENT DATA:
${context.join('\n')}

Return ONLY valid JSON, no explanation.`,
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
        model: 'claude-haiku-4-5-20251001',
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
      model: 'claude-haiku-4-5-20251001',
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
