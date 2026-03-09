import Anthropic from '@anthropic-ai/sdk';
import { PromptTemplates, DEFAULT_PROMPT_TEMPLATES } from './settings';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export interface ProcessedNote {
  ddx: string;
  investigations: string;
  management: string;
  evidence: string;
  hpi: string;
  objective: string;
  assessmentPlan: string;
  diagnosis: string;
  icd9: string;
  icd10: string;
}

export interface PatientData {
  name: string;
  age: string;
  gender: string;
  birthday: string;
  triageVitals: string;
  transcript: string;
  additional: string;
  pastDocs?: string;
}

export interface ProcessOptions {
  modifications?: string;
  existingOutput?: ProcessedNote;
  styleGuidance?: string;
  settings?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  };
  promptTemplates?: PromptTemplates;
}

export async function processEncounter(
  patientData: PatientData,
  options?: ProcessOptions
): Promise<ProcessedNote> {
  const prompt = buildPrompt(patientData, options);

  const model = options?.settings?.model || 'claude-sonnet-4-20250514';
  const maxTokens = options?.settings?.maxTokens || 4096;
  const temperature = options?.settings?.temperature ?? 0.3;

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseClaudeResponse(text);
}

function buildPrompt(patientData: PatientData, options?: ProcessOptions): string {
  let dataSection = '';

  if (patientData.triageVitals) {
    dataSection += `TRIAGE NOTE AND VITALS:\n${patientData.triageVitals}\n\n`;
  }

  if (patientData.transcript) {
    dataSection += `TRANSCRIPT OF ENCOUNTER:\n${patientData.transcript}\n\n`;
  }

  if (patientData.additional) {
    dataSection += `ADDITIONAL FINDINGS (exam, investigations, plan):\n${patientData.additional}\n\n`;
  }

  if (patientData.pastDocs) {
    dataSection += `PAST DOCUMENTATION / PREVIOUS VISITS:\n${patientData.pastDocs}\n\n`;
  }

  // If modifying existing output, include it
  let modificationSection = '';
  if (options?.modifications && options?.existingOutput) {
    modificationSection = `
---

EXISTING DOCUMENTATION (to be modified):

===DDX===
${options.existingOutput.ddx}

===INVESTIGATIONS===
${options.existingOutput.investigations}

===MANAGEMENT===
${options.existingOutput.management}

===EVIDENCE===
${options.existingOutput.evidence}

===HPI===
${options.existingOutput.hpi}

===OBJECTIVE===
${options.existingOutput.objective}

===ASSESSMENT_PLAN===
${options.existingOutput.assessmentPlan}

===DIAGNOSIS===
${options.existingOutput.diagnosis}

---

MODIFICATION INSTRUCTIONS:
${options.modifications}

Please regenerate the documentation incorporating these modifications. Preserve the existing content where not affected by the modifications.

`;
  }

  // Style guidance section
  let styleSection = '';
  if (options?.styleGuidance) {
    styleSection = `
STYLE GUIDANCE:
Closely match the tone, structure, and phrasing from the style examples first. Use the key features only to fill in gaps.
${options.styleGuidance}

`;
  }

  const baseInstruction = options?.modifications
    ? 'Based on the available information and the modification instructions above, regenerate the ED documentation.'
    : 'Based on the available information, generate comprehensive ED documentation.';

  const pt = options?.promptTemplates ?? DEFAULT_PROMPT_TEMPLATES;

  return `You are an AI assistant helping an emergency department physician create encounter documentation.

PATIENT INFORMATION:
- Name: ${patientData.name || 'Not provided'}
- Age: ${patientData.age || 'Not provided'}
- Gender: ${patientData.gender || 'Not provided'}
- Date of Birth: ${patientData.birthday || 'Not provided'}

${dataSection}
${modificationSection}${styleSection}---

${baseInstruction} You must provide ALL seven sections below.

IMPORTANT RULES:
${pt.generalRules}

Respond in EXACTLY this format with these exact headers:

===DDX===
[${pt.ddx}]

===INVESTIGATIONS===
[${pt.investigations}]

===MANAGEMENT===
[${pt.management}]

===EVIDENCE===
[${pt.evidence}]

===HPI===
[${pt.hpi}]

===OBJECTIVE===
[${pt.objective}]

===ASSESSMENT_PLAN===
[${pt.assessmentPlan}]

===DIAGNOSIS===
[${pt.diagnosis}]

===ICD9===
[ICD-9 code for the primary diagnosis. Prefer general/unspecified codes unless the clinical description clearly specifies a more precise diagnosis. Code only, no description]

===ICD10===
[ICD-10 code for the primary diagnosis. Prefer general/unspecified codes unless the clinical description clearly specifies a more precise diagnosis (e.g., prefer J02.9 over J02.0 unless the organism is explicitly named). Code only, no description]`;
}

function parseClaudeResponse(response: string): ProcessedNote {
  const sections: ProcessedNote = {
    ddx: '',
    investigations: '',
    management: '',
    evidence: '',
    hpi: '',
    objective: '',
    assessmentPlan: '',
    diagnosis: '',
    icd9: '',
    icd10: '',
  };

  const ddxMatch = response.match(/===DDX===\s*([\s\S]*?)(?====|$)/);
  const invMatch = response.match(/===INVESTIGATIONS===\s*([\s\S]*?)(?====|$)/);
  const mgmtMatch = response.match(/===MANAGEMENT===\s*([\s\S]*?)(?====|$)/);
  const evidMatch = response.match(/===EVIDENCE===\s*([\s\S]*?)(?====|$)/);
  const hpiMatch = response.match(/===HPI===\s*([\s\S]*?)(?====|$)/);
  const objMatch = response.match(/===OBJECTIVE===\s*([\s\S]*?)(?====|$)/);
  const apMatch = response.match(/===ASSESSMENT_PLAN===\s*([\s\S]*?)(?====|$)/);
  const diagMatch = response.match(/===DIAGNOSIS===\s*([\s\S]*?)(?====|$)/);
  const icd9Match = response.match(/===ICD9===\s*([\s\S]*?)(?====|$)/);
  const icd10Match = response.match(/===ICD10===\s*([\s\S]*?)(?====|$)/);

  if (ddxMatch) sections.ddx = ddxMatch[1].trim();
  if (invMatch) sections.investigations = invMatch[1].trim();
  if (mgmtMatch) sections.management = mgmtMatch[1].trim();
  if (evidMatch) sections.evidence = evidMatch[1].trim();
  if (hpiMatch) sections.hpi = hpiMatch[1].trim();
  if (objMatch) sections.objective = objMatch[1].trim();
  if (apMatch) sections.assessmentPlan = apMatch[1].trim();
  if (diagMatch) sections.diagnosis = diagMatch[1].trim();
  if (icd9Match) sections.icd9 = icd9Match[1].trim();
  if (icd10Match) sections.icd10 = icd10Match[1].trim();

  return sections;
}

export async function generateReferral(
  patientData: PatientData,
  encounterNote: ProcessedNote,
  referralInfo: { specialty: string; urgency: string; reason: string }
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    temperature: 0.3,
    messages: [{
      role: 'user',
      content: `You are an AI assistant helping an emergency department physician write a referral letter.

PATIENT INFORMATION:
- Name: ${patientData.name || 'Not provided'}
- Age: ${patientData.age || 'Not provided'}
- Gender: ${patientData.gender || 'Not provided'}
- Date of Birth: ${patientData.birthday || 'Not provided'}

ENCOUNTER SUMMARY:
HPI: ${encounterNote.hpi}
Objective: ${encounterNote.objective}
Assessment & Plan: ${encounterNote.assessmentPlan}
Diagnosis: ${encounterNote.diagnosis}

REFERRAL DETAILS:
- Specialty: ${referralInfo.specialty}
- Urgency: ${referralInfo.urgency}
- Reason: ${referralInfo.reason}

Write a professional, concise referral letter to the specified specialty. Include:
1. Patient demographics and reason for referral
2. Brief clinical summary from the ED encounter
3. Relevant findings and investigations
4. Specific question or request for the consultant
5. Urgency context

Use professional medical language. Be concise but thorough. Write in paragraph form.`
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function lookupICDCodes(diagnosisText: string): Promise<{
  diagnosis: string;
  icd9: string;
  icd10: string;
}> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    temperature: 0.1,
    messages: [{
      role: 'user',
      content: `You are a medical coding assistant. Given the following diagnosis or clinical description, provide:
1. A clean, standard diagnosis name (use common/general terms)
2. The most appropriate ICD-9 code
3. The most appropriate ICD-10 code

IMPORTANT: Prefer general/unspecified ICD codes unless the clinical description clearly specifies a more precise diagnosis. For example, prefer J02.9 (Pharyngitis, unspecified) over J02.0 (Streptococcal pharyngitis) unless the diagnosis explicitly names the organism or specific variant.

Diagnosis/Description: ${diagnosisText}

Respond in EXACTLY this format (no extra text):
DIAGNOSIS: [clean diagnosis name]
ICD9: [code only, no description]
ICD10: [code only, no description]`
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  const diagMatch = text.match(/DIAGNOSIS:\s*(.+)/i);
  const icd9Match = text.match(/ICD9:\s*([A-Z0-9.]+)/i);
  const icd10Match = text.match(/ICD10:\s*([A-Z0-9.]+)/i);

  return {
    diagnosis: diagMatch ? diagMatch[1].trim() : diagnosisText,
    icd9: icd9Match ? icd9Match[1].trim() : '',
    icd10: icd10Match ? icd10Match[1].trim() : '',
  };
}
