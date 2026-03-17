import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const anthropic = await getAnthropicClient();
    const { query, patient, history } = await request.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    // Build patient context
    const context: string[] = [];
    if (patient?.age) context.push(`Age: ${patient.age}`);
    if (patient?.gender) context.push(`Gender: ${patient.gender}`);
    if (patient?.weight) context.push(`Weight: ${patient.weight}`);
    if (patient?.diagnosis) context.push(`Diagnosis: ${patient.diagnosis}`);
    if (patient?.triageVitals) context.push(`Vitals/Triage: ${patient.triageVitals}`);
    if (patient?.transcript) context.push(`Encounter data: ${patient.transcript.substring(0, 500)}`);
    if (patient?.additional) context.push(`Additional: ${patient.additional.substring(0, 300)}`);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (history && Array.isArray(history)) {
      for (const m of history) {
        messages.push({ role: m.role, content: m.content });
      }
    }
    messages.push({ role: 'user', content: query.trim() });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      temperature: 0,
      system: `You are a medical calculator assistant. You have access to the patient's clinical data and should use it to auto-populate calculation inputs.

PATIENT DATA:
${context.join('\n')}

INSTRUCTIONS:
- For clinical scores/calculators (CrCl, GFR, HEART, Wells, CURB-65, etc.): auto-fill values from patient data. Show each input, its value, and the source. If a required value is missing, clearly ask for it.
- For drug dose calculations: use weight-based dosing when applicable. State the formula, the patient's weight (if known), and the calculated dose with units.
- For general math: just calculate and show the result.
- Always show: the formula used, each input value, the calculation steps, and the final result.
- Include a link to the relevant MDCalc page if applicable: [Calculator Name](https://www.mdcalc.com/calc/...)
- Be concise but thorough. Use markdown formatting.
- If you auto-populated a value from patient data, note it as "(from patient data)".
- If you assumed a value, clearly state the assumption.`,
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
