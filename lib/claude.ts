import { PromptTemplates, DEFAULT_PROMPT_TEMPLATES } from './settings';
import { buildPHIMapping, deidentifyText, reidentifyText } from './phi-filter';
import { getAnthropicClient } from './api-keys';
import { verifyLinks } from './verify-links';

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
  styleExamples?: Record<string, string[]>;
  customGuidance?: string;
  settings?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  };
  promptTemplates?: PromptTemplates;
  phiProtection?: boolean;
}

export async function processEncounter(
  patientData: PatientData,
  options?: ProcessOptions
): Promise<ProcessedNote> {
  let prompt = buildPrompt(patientData, options);

  // PHI protection: strip identifying info before sending to AI
  const phiMapping = options?.phiProtection
    ? buildPHIMapping(patientData)
    : null;
  if (phiMapping) {
    prompt = deidentifyText(prompt, phiMapping);
  }

  const model = options?.settings?.model || 'claude-sonnet-4-20250514';
  const maxTokens = options?.settings?.maxTokens || 4096;
  const temperature = options?.settings?.temperature ?? 0.3;

  const anthropic = await getAnthropicClient();
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  });

  let text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Re-identify: restore PHI in the response
  if (phiMapping) {
    text = reidentifyText(text, phiMapping);
  }

  // Verify links in evidence section (remove broken URLs)
  text = await verifyLinks(text);

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
  const hasStyleExamples = options?.styleExamples && Object.values(options.styleExamples).some(arr => arr.length > 0);
  if (options?.styleGuidance || hasStyleExamples) {
    styleSection = `
CRITICAL — STYLE MATCHING (this overrides default formatting instructions):
You MUST write HPI, Objective, and Assessment & Plan in the EXACT style shown in the examples below. These examples are real notes written by this physician. Your output must read as if the same physician wrote it. Match:
- Exact sentence structure (fragments vs. complete, short vs. long)
- Abbreviation patterns (if they write "NAD" not "no acute distress", you write "NAD")
- Paragraph structure (single block vs. broken into paragraphs)
- Opening/closing patterns verbatim
- Level of detail (if examples are brief, be brief; if detailed, be detailed)
- Tone and voice
- How negatives are listed
- Punctuation style

Do NOT add extra detail, formality, or structure beyond what the examples show. Less is more — match the examples exactly.
${options.customGuidance ? `\nPhysician's charting preferences:\n${options.customGuidance}\n` : ''}
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
[${pt.hpi}${(() => {
    const ex = options?.styleExamples?.hpi;
    if (ex && ex.length > 0) {
      return `\n\nYou MUST write the HPI in the same style as these examples from this physician:\n${ex.map((e, i) => `--- Example ${i + 1} ---\n${e}`).join('\n\n')}\n\nWrite the HPI as if you ARE this physician. Match their exact style, length, structure, and tone.`;
    }
    return options?.styleGuidance ? ' Match the physician\'s charting style.' : '';
  })()}]

===OBJECTIVE===
[${pt.objective}${(() => {
    const ex = options?.styleExamples?.objective;
    if (ex && ex.length > 0) {
      return `\n\nYou MUST write the Objective in the same style as these examples:\n${ex.map((e, i) => `--- Example ${i + 1} ---\n${e}`).join('\n\n')}\n\nMatch this physician's exact formatting, abbreviation use, and level of detail.`;
    }
    return options?.styleGuidance ? ' Match the physician\'s charting style.' : '';
  })()}]

===ASSESSMENT_PLAN===
[${pt.assessmentPlan}${(() => {
    const ex = options?.styleExamples?.assessmentPlan;
    if (ex && ex.length > 0) {
      return `\n\nYou MUST write the Assessment & Plan in the same style as these examples:\n${ex.map((e, i) => `--- Example ${i + 1} ---\n${e}`).join('\n\n')}\n\nMatch this physician's exact structure, phrasing patterns, and level of detail. Write as if you ARE this physician.`;
    }
    return options?.styleGuidance ? ' Match the physician\'s charting style.' : '';
  })()}]

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
  referralInfo: { specialty: string; urgency: string; reason: string },
  referralExamples?: string[],
): Promise<string> {
  const anthropic = await getAnthropicClient();

  let styleBlock = '';
  if (referralExamples && referralExamples.length > 0) {
    styleBlock = `
CRITICAL — STYLE MATCHING:
You MUST write this referral letter in the EXACT style of these examples from this physician. Match their format, tone, length, salutation, sign-off, and level of detail precisely.

${referralExamples.map((e, i) => `--- Example ${i + 1} ---\n${e}`).join('\n\n')}

Write as if you ARE this physician. Do not add formality or structure beyond what the examples show.
`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    temperature: 0.3,
    messages: [{
      role: 'user',
      content: `You are an AI assistant helping a physician write a referral letter.

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
${styleBlock}
Write a professional, concise referral letter to the specified specialty. Include:
1. Patient demographics and reason for referral
2. Brief clinical summary from the encounter
3. Relevant findings and investigations
4. Specific question or request for the consultant
5. Urgency context

Use professional medical language. Be concise but thorough.`
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

export async function lookupICDCodes(diagnosisText: string): Promise<{
  diagnosis: string;
  icd9: string;
  icd10: string;
}> {
  const anthropic = await getAnthropicClient();
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
