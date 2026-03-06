import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSheetsContext, getPatient, updatePatientFields } from '@/lib/google-sheets';

export const maxDuration = 30;

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// POST /api/analysis - Generate DDx, management, and evidence from patient data
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { rowIndex, sheetName } = await request.json();

    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build context from all available data (processed or raw)
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

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: `You are an experienced emergency medicine physician. Based on the following patient data, generate a differential diagnosis, recommended management plan, and pertinent evidence-based references.

Patient: ${patient.name || 'Unknown'}, ${patient.age || '?'} ${patient.gender || ''}

${parts.join('\n\n')}

Respond in EXACTLY this format with these section headers:

===DDX===
List the differential diagnoses ranked by likelihood. Include brief reasoning.

===INVESTIGATIONS===
List recommended investigations/workup.

===MANAGEMENT===
Provide recommended management steps including disposition planning.

===EVIDENCE===
Cite pertinent evidence, guidelines, or clinical decision rules relevant to this presentation.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse sections from response
    const getSection = (key: string): string => {
      const regex = new RegExp(`===${key}===\\s*([\\s\\S]*?)(?====\\w|$)`);
      const match = text.match(regex);
      return match ? match[1].trim() : '';
    };

    const fields: Record<string, string> = {};
    const ddx = getSection('DDX');
    const investigations = getSection('INVESTIGATIONS');
    const management = getSection('MANAGEMENT');
    const evidence = getSection('EVIDENCE');

    if (ddx) fields.ddx = ddx;
    if (investigations) fields.investigations = investigations;
    if (management) fields.management = management;
    if (evidence) fields.evidence = evidence;

    if (Object.keys(fields).length > 0) {
      await updatePatientFields(ctx, rowIndex, fields, sheetName);
    }

    return NextResponse.json({ success: true, ...fields });
  } catch (error: any) {
    console.error('Error generating analysis:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to generate analysis', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
