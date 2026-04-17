import { PromptTemplates, DEFAULT_PROMPT_TEMPLATES } from './settings';
import { buildPHIMapping, deidentifyText, reidentifyText } from './phi-filter';
import { getAnthropicClient } from './api-keys';
import { verifyLinks } from './verify-links';
import { MODELS } from '@/lib/config';

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
  noteStyle?: 'standard' | 'comprehensive' | 'complete-exam';
  noteStyleInstructions?: string;
  customInstructions?: string;
  coreOnly?: boolean;
}

// --- Retry logic for overloaded/rate-limited errors ---

const RETRY_DELAYS = [3000, 8000, 15000];

function isRetryableError(e: any): boolean {
  const status = e?.status || e?.error?.type || '';
  return status === 529 || status === 429
    || String(status).includes('overloaded')
    || String(e?.message).includes('overloaded');
}

export async function processEncounter(
  patientData: PatientData,
  options?: ProcessOptions
): Promise<ProcessedNote> {
  let prompt = buildPrompt(patientData, options);

  // PHI protection is MANDATORY — always strip identifiers before AI calls
  const phiMapping = buildPHIMapping(patientData);
  prompt = deidentifyText(prompt, phiMapping);

  const model = options?.settings?.model || MODELS.default;
  const maxTokens = options?.settings?.maxTokens || 4096;
  const temperature = options?.settings?.temperature ?? 0.3;

  const anthropic = await getAnthropicClient();

  let lastError: any = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      });

      let text = response.content[0].type === 'text' ? response.content[0].text : '';

      // Re-identify: restore PHI in the response
      text = reidentifyText(text, phiMapping);

      // Verify links in evidence section (remove broken URLs)
      text = await verifyLinks(text);

      return parseClaudeResponse(text);
    } catch (e: any) {
      lastError = e;
      if (!isRetryableError(e) || attempt >= RETRY_DELAYS.length) throw e;
      console.warn(`[Claude API] ${e?.status || 'error'} — retrying in ${RETRY_DELAYS[attempt]}ms (attempt ${attempt + 1}/${RETRY_DELAYS.length})`);
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
  throw lastError;
}

/**
 * Stream a full encounter processing response.
 * PHI de-identification is mandatory.
 * Returns a ReadableStream for SSE-style streaming.
 */
export async function streamProcessEncounter(
  patientData: PatientData,
  options?: ProcessOptions,
  onComplete?: (fullText: string) => void,
): Promise<ReadableStream<Uint8Array>> {
  let prompt = buildPrompt(patientData, options);

  // PHI protection is MANDATORY
  const phiMapping = buildPHIMapping(patientData);
  prompt = deidentifyText(prompt, phiMapping);

  const model = options?.settings?.model || MODELS.default;
  const maxTokens = options?.settings?.maxTokens || 4096;
  const temperature = options?.settings?.temperature ?? 0.3;

  const anthropic = await getAnthropicClient();
  const encoder = new TextEncoder();
  let fullText = '';

  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            'delta' in event &&
            (event.delta as any).type === 'text_delta'
          ) {
            const text = (event.delta as any).text || '';
            fullText += text;
            controller.enqueue(encoder.encode(text));
          }
        }
        // Re-identify PHI in the final text
        fullText = reidentifyText(fullText, phiMapping);
        controller.enqueue(encoder.encode('\n\n__STREAM_DONE__'));
        controller.close();
        if (onComplete) onComplete(fullText);
      } catch (err: any) {
        controller.error(err);
      }
    },
  });
}

/**
 * Stream a generic Claude prompt (for referrals, admissions, clinical questions, etc.)
 * PHI de-identification is mandatory when patientData is provided.
 */
export async function streamGenericPrompt(
  prompt: string,
  patientData: PatientData | null,
  settings?: { model?: string; maxTokens?: number; temperature?: number },
  onComplete?: (fullText: string) => void,
): Promise<ReadableStream<Uint8Array>> {
  let finalPrompt = prompt;
  const phiMapping = patientData ? buildPHIMapping(patientData) : null;
  if (phiMapping) {
    finalPrompt = deidentifyText(prompt, phiMapping);
  }

  const model = settings?.model || MODELS.default;
  const maxTokens = settings?.maxTokens || 4096;
  const temperature = settings?.temperature ?? 0.3;

  const anthropic = await getAnthropicClient();
  const encoder = new TextEncoder();
  let fullText = '';

  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: finalPrompt }],
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            'delta' in event &&
            (event.delta as any).type === 'text_delta'
          ) {
            const text = (event.delta as any).text || '';
            fullText += text;
            controller.enqueue(encoder.encode(text));
          }
        }
        if (phiMapping) {
          fullText = reidentifyText(fullText, phiMapping);
        }
        controller.enqueue(encoder.encode('\n\n__STREAM_DONE__'));
        controller.close();
        if (onComplete) onComplete(fullText);
      } catch (err: any) {
        controller.error(err);
      }
    },
  });
}

/**
 * Non-streaming generic prompt with mandatory PHI protection.
 */
export async function callWithPHIProtection(
  prompt: string,
  patientData: PatientData | null,
  settings?: { model?: string; maxTokens?: number; temperature?: number },
): Promise<string> {
  let finalPrompt = prompt;
  const phiMapping = patientData ? buildPHIMapping(patientData) : null;
  if (phiMapping) {
    finalPrompt = deidentifyText(prompt, phiMapping);
  }

  const model = settings?.model || MODELS.default;
  const maxTokens = settings?.maxTokens || 4096;
  const temperature = settings?.temperature ?? 0.3;

  const anthropic = await getAnthropicClient();

  let lastError: any = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: finalPrompt }],
      });

      let result = response.content[0].type === 'text' ? response.content[0].text : '';
      if (phiMapping) {
        result = reidentifyText(result, phiMapping);
      }
      return result;
    } catch (e: any) {
      lastError = e;
      if (!isRetryableError(e) || attempt >= RETRY_DELAYS.length) throw e;
      console.warn(`[Claude API] ${e?.status || 'error'} — retrying in ${RETRY_DELAYS[attempt]}ms`);
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
  throw lastError;
}

function buildPrompt(patientData: PatientData, options?: ProcessOptions): string {
  let dataSection = '';

  if (patientData.triageVitals) {
    dataSection += `TRIAGE NOTE AND VITALS:\n${patientData.triageVitals}\n\n`;
  }

  if (patientData.transcript) {
    dataSection += `TRANSCRIPT OF ENCOUNTER:\n${patientData.transcript}\n\n`;
  }

  // Extract verbatim exam findings (from toggle buttons) vs free-text
  let verbatimExamFindings: string[] = [];
  let additionalText = patientData.additional || '';
  if (additionalText) {
    const verbatimRegex = /\[VERBATIM_EXAM\]([\s\S]*?)\[\/VERBATIM_EXAM\]/g;
    let match;
    while ((match = verbatimRegex.exec(additionalText)) !== null) {
      verbatimExamFindings.push(match[1].trim());
    }
    // Remove markers for the data section (Claude sees clean text)
    additionalText = additionalText
      .replace(/\[VERBATIM_EXAM\]/g, '')
      .replace(/\[\/VERBATIM_EXAM\]/g, '')
      .trim();
  }
  if (additionalText) {
    dataSection += `ADDITIONAL FINDINGS (exam, investigations, plan):\n${additionalText}\n\n`;
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
${options?.customGuidance ? `\nPhysician's charting preferences:\n${options.customGuidance}\n` : ''}
`;
  }

  const baseInstruction = options?.modifications
    ? 'Based on the available information and the modification instructions above, regenerate the ED documentation.'
    : 'Based on the available information, generate comprehensive ED documentation.';

  // Note style modifiers
  let styleInstruction = '';
  if (options?.noteStyle === 'standard' && options?.noteStyleInstructions) {
    styleInstruction = `\nNOTE STYLE: STANDARD\n${options.noteStyleInstructions}\n`;
  } else if (options?.noteStyle === 'comprehensive') {
    const instructions = options?.noteStyleInstructions || 'Write a thorough, detailed note. Include all relevant clinical details, pertinent positives and negatives, complete differential reasoning, and detailed management rationale. Do not abbreviate or omit information.';
    styleInstruction = `\nNOTE STYLE: DETAILED\n${instructions}\n`;
  } else if (options?.noteStyle === 'complete-exam') {
    const instructions = options?.noteStyleInstructions || 'Write a comprehensive note documenting a COMPLETE multi-system examination with all body systems documented.';
    styleInstruction = `\nNOTE STYLE: COMPLETE EXAMINATION\n${instructions}\n`;
  }
  if (options?.customInstructions) {
    styleInstruction += `
PHYSICIAN INSTRUCTIONS FOR THIS NOTE:
${options.customInstructions}
`;
  }

  const pt = options?.promptTemplates ?? DEFAULT_PROMPT_TEMPLATES;

  return `You are an AI assistant helping an emergency department physician create encounter documentation.

PATIENT INFORMATION:
- Name: ${patientData.name || 'Not provided'}
- Age: ${patientData.age || 'Not provided'}
- Gender: ${patientData.gender || 'Not provided'}
- Date of Birth: ${patientData.birthday || 'Not provided'}

${dataSection}
${modificationSection}${styleSection}${styleInstruction}---

${baseInstruction} You must provide ALL sections below.

IMPORTANT RULES:
${pt.generalRules}

Respond in EXACTLY this format with these exact headers:
${options?.coreOnly ? '' : `
===DDX===
[${pt.ddx}]

===INVESTIGATIONS===
[${pt.investigations}]

===MANAGEMENT===
[${pt.management}]

===EVIDENCE===
[${pt.evidence}]
`}
===HPI===
[${pt.hpi}${(() => {
    const ex = options?.styleExamples?.hpi;
    if (ex && ex.length > 0) {
      return `\n\nYou MUST write the HPI in the same style as these examples from this physician:\n${ex.map((e, i) => `--- Example ${i + 1} ---\n${e}`).join('\n\n')}\n\nWrite the HPI as if you ARE this physician. Match their exact style, length, structure, and tone.`;
    }
    return options?.styleGuidance ? ' Match the physician\'s charting style.' : '';
  })()}]

===OBJECTIVE===
[${pt.objective}${verbatimExamFindings.length > 0 ? `\n\nCRITICAL — VERBATIM EXAM FINDINGS: The following exam findings were entered by the physician using standardized buttons and MUST be included word-for-word in the Objective section. Do NOT rephrase, summarize, or alter these findings:\n${verbatimExamFindings.join('\n')}` : ''}${(() => {
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

export function parseClaudeResponse(response: string): ProcessedNote {
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
  customInstructions?: string,
): Promise<string> {
  let styleBlock = '';
  if (referralExamples && referralExamples.length > 0) {
    styleBlock = `
CRITICAL — STYLE MATCHING:
You MUST write this referral letter in the EXACT style of these examples from this physician. Match their format, tone, length, salutation, sign-off, and level of detail precisely.

${referralExamples.map((e, i) => `--- Example ${i + 1} ---\n${e}`).join('\n\n')}

Write as if you ARE this physician. Do not add formality or structure beyond what the examples show.
`;
  }

  const prompt = `You are an AI assistant helping a physician write a referral letter.

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
${customInstructions || `Write a professional, concise referral letter to the specified specialty. Include:
1. Patient demographics and reason for referral
2. Brief clinical summary from the encounter
3. Relevant findings and investigations
4. Specific question or request for the consultant
5. Urgency context

Use professional medical language. Be concise but thorough.`}`;

  return callWithPHIProtection(prompt, patientData);
}

export async function generateAdmission(
  patientData: PatientData,
  encounterNote: ProcessedNote,
  admissionInfo: { service: string; reason: string; acuity: string },
  admissionExamples?: string[],
  customInstructions?: string,
): Promise<string> {
  let styleBlock = '';
  if (admissionExamples && admissionExamples.length > 0) {
    styleBlock = `
CRITICAL — STYLE MATCHING:
You MUST write this admission note in the EXACT style of these examples from this physician. Match their format, structure, tone, length, and level of detail precisely.

${admissionExamples.map((e, i) => `--- Example ${i + 1} ---\n${e}`).join('\n\n')}

Write as if you ARE this physician. Do not add formality or structure beyond what the examples show.
`;
  }

  const prompt = `You are an AI assistant helping a physician write a hospital admission note.

PATIENT INFORMATION:
- Name: ${patientData.name || 'Not provided'}
- Age: ${patientData.age || 'Not provided'}
- Gender: ${patientData.gender || 'Not provided'}
- Date of Birth: ${patientData.birthday || 'Not provided'}

ENCOUNTER SUMMARY:
HPI: ${encounterNote.hpi}
Objective / Physical Exam: ${encounterNote.objective}
Assessment & Plan: ${encounterNote.assessmentPlan}
Diagnosis: ${encounterNote.diagnosis}
Differential Diagnosis: ${encounterNote.ddx || 'Not provided'}
Investigations: ${encounterNote.investigations || 'Not provided'}

${patientData.triageVitals ? `TRIAGE / VITALS:\n${patientData.triageVitals}\n` : ''}${patientData.additional ? `ADDITIONAL FINDINGS:\n${patientData.additional}\n` : ''}${patientData.pastDocs ? `PAST DOCUMENTATION:\n${patientData.pastDocs}\n` : ''}
ADMISSION DETAILS:
- Admitting Service: ${admissionInfo.service}
- Reason for Admission: ${admissionInfo.reason}
- Acuity: ${admissionInfo.acuity}
${styleBlock}
${customInstructions || `Write a comprehensive admission note. Include:
1. Identifying information and reason for admission
2. History of presenting illness (from encounter HPI)
3. Past medical/surgical history (if available)
4. Medications and allergies (if available)
5. Physical examination findings
6. Investigations and results
7. Assessment with differential diagnosis
8. Admission plan — orders, monitoring, consultations, disposition

Use professional medical language. Be thorough and structured.`}`;

  return callWithPHIProtection(prompt, patientData);
}

export async function lookupICDCodes(diagnosisText: string): Promise<{
  diagnosis: string;
  icd9: string;
  icd10: string;
}> {
  // ICD lookup has no PHI — just diagnosis text
  const result = await callWithPHIProtection(
    `You are a medical coding assistant. Given the following diagnosis or clinical description, provide:
1. A clean, standard diagnosis name (use common/general terms)
2. The most appropriate ICD-9 code
3. The most appropriate ICD-10 code

IMPORTANT: Prefer general/unspecified ICD codes unless the clinical description clearly specifies a more precise diagnosis. For example, prefer J02.9 (Pharyngitis, unspecified) over J02.0 (Streptococcal pharyngitis) unless the diagnosis explicitly names the organism or specific variant.

Diagnosis/Description: ${diagnosisText}

Respond in EXACTLY this format (no extra text):
DIAGNOSIS: [clean diagnosis name]
ICD9: [code only, no description]
ICD10: [code only, no description]`,
    null,
    { model: MODELS.default, maxTokens: 200, temperature: 0.1 },
  );

  const diagMatch = result.match(/DIAGNOSIS:\s*(.+)/i);
  const icd9Match = result.match(/ICD9:\s*([A-Z0-9.]+)/i);
  const icd10Match = result.match(/ICD10:\s*([A-Z0-9.]+)/i);

  return {
    diagnosis: diagMatch ? diagMatch[1].trim() : diagnosisText,
    icd9: icd9Match ? icd9Match[1].trim() : '',
    icd10: icd10Match ? icd10Match[1].trim() : '',
  };
}
