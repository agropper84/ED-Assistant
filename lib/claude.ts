import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export interface ProcessedNote {
  ddx: string;
  investigations: string;
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
}

export async function processEncounter(patientData: PatientData): Promise<ProcessedNote> {
  const prompt = buildPrompt(patientData);
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseClaudeResponse(text);
}

function buildPrompt(patientData: PatientData): string {
  let dataSection = '';
  
  if (patientData.triageVitals) {
    dataSection += `TRIAGE NOTE AND VITALS:\n${patientData.triageVitals}\n\n`;
  }
  
  if (patientData.transcript) {
    dataSection += `TRANSCRIPT OF ENCOUNTER:\n${patientData.transcript}\n\n`;
  }
  
  if (patientData.additional) {
    dataSection += `ADDITIONAL FINDINGS (exam, investigations, plan):\n${patientData.additional}`;
  }

  return `You are an AI assistant helping an emergency department physician create encounter documentation.

PATIENT INFORMATION:
- Name: ${patientData.name || 'Not provided'}
- Age: ${patientData.age || 'Not provided'}
- Gender: ${patientData.gender || 'Not provided'}
- Date of Birth: ${patientData.birthday || 'Not provided'}

${dataSection}

---

Based on the available information, generate comprehensive ED documentation. You must provide ALL five sections below.

IMPORTANT RULES:
- Do NOT assume, infer, or make up information not explicitly stated in the provided data
- Use appropriate evidence-based medicine and guidelines
- Use professional yet concise language as a busy emergency physician would
- Abbreviations are acceptable without explanation
- Truncated sentences are acceptable
- Use narrative/paragraph form, NOT bullet points or numbered lists
- If information for a section is not available, write "Information not documented" or "Insufficient data"

Respond in EXACTLY this format with these exact headers:

===DDX===
[Provide differential diagnosis based on presentation. List most likely diagnosis first, followed by other considerations. Use narrative form.]

===INVESTIGATIONS===
[Recommend appropriate investigations and management considerations based on the presentation. Include labs, imaging, treatments as applicable. Use narrative form.]

===HPI===
[Narrative summary of patient's presentation. Thoroughly document the history and features supporting the working diagnosis. Document that appropriate red flags have been ruled out. Professional, concise ED physician language.]

===OBJECTIVE===
[Physical examination findings ONLY. Use this format for normal exam:
"Patient appears well, NAD. AVSS."
Then include ONLY pertinent exam findings that were actually documented or mentioned. If no exam documented, state "Physical examination not documented."]

===ASSESSMENT_PLAN===
[Diagnosis or working diagnosis (e.g., Appendicitis, Otitis Media, Abdo Pain NYD).
Summarize assessment leading to diagnosis. Include differential if applicable.
Document management plan: investigations ordered, treatments given.
Document that appropriate red flags were ruled out.
Include return to ED instructions.
Use paragraph/narrative form only. No bullet points.]

===DIAGNOSIS===
[Primary diagnosis only - use common, general terms]

===ICD9===
[ICD-9 code for the primary diagnosis. Code only, no description]

===ICD10===
[ICD-10 code for the primary diagnosis. Code only, no description]`;
}

function parseClaudeResponse(response: string): ProcessedNote {
  const sections: ProcessedNote = {
    ddx: '',
    investigations: '',
    hpi: '',
    objective: '',
    assessmentPlan: '',
    diagnosis: '',
    icd9: '',
    icd10: '',
  };

  const ddxMatch = response.match(/===DDX===\s*([\s\S]*?)(?====|$)/);
  const invMatch = response.match(/===INVESTIGATIONS===\s*([\s\S]*?)(?====|$)/);
  const hpiMatch = response.match(/===HPI===\s*([\s\S]*?)(?====|$)/);
  const objMatch = response.match(/===OBJECTIVE===\s*([\s\S]*?)(?====|$)/);
  const apMatch = response.match(/===ASSESSMENT_PLAN===\s*([\s\S]*?)(?====|$)/);
  const diagMatch = response.match(/===DIAGNOSIS===\s*([\s\S]*?)(?====|$)/);
  const icd9Match = response.match(/===ICD9===\s*([\s\S]*?)(?====|$)/);
  const icd10Match = response.match(/===ICD10===\s*([\s\S]*?)(?====|$)/);

  if (ddxMatch) sections.ddx = ddxMatch[1].trim();
  if (invMatch) sections.investigations = invMatch[1].trim();
  if (hpiMatch) sections.hpi = hpiMatch[1].trim();
  if (objMatch) sections.objective = objMatch[1].trim();
  if (apMatch) sections.assessmentPlan = apMatch[1].trim();
  if (diagMatch) sections.diagnosis = diagMatch[1].trim();
  if (icd9Match) sections.icd9 = icd9Match[1].trim();
  if (icd10Match) sections.icd10 = icd10Match[1].trim();

  return sections;
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
