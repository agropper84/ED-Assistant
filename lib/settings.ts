export interface AppSettings {
  model: string;
  maxTokens: number;
  temperature: number;
  fastDictation: boolean;
  vchCprpId: string;
  vchSiteFacility: string;
  vchPracNumber: string;
  vchPractitionerName: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.3,
  fastDictation: false,
  vchCprpId: '',
  vchSiteFacility: '',
  vchPracNumber: '',
  vchPractitionerName: '',
};

const STORAGE_KEY = 'ed-app-settings';

export function getSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// --- Prompt Templates ---

export interface PromptTemplates {
  generalRules: string;
  ddx: string;
  investigations: string;
  management: string;
  evidence: string;
  hpi: string;
  objective: string;
  assessmentPlan: string;
  diagnosis: string;
  editExpand: string;
  editShorten: string;
}

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplates = {
  generalRules: `- Do NOT assume, infer, or make up information not explicitly stated in the provided data
- Use appropriate evidence-based medicine and guidelines
- Use professional yet concise language as a busy emergency physician would
- Abbreviations are acceptable without explanation
- Truncated sentences are acceptable
- Use narrative/paragraph form, NOT bullet points or numbered lists
- If information for a section is not available, write "Information not documented" or "Insufficient data"`,
  ddx: `Provide differential diagnosis based on presentation. List most likely diagnosis first, followed by other considerations. Use narrative form.`,
  investigations: `Recommend appropriate investigations based on the presentation. Include labs, imaging, and other diagnostic tests as applicable. Use narrative form.`,
  management: `Recommend management and treatment plan based on the presentation and differential. Include medications, procedures, disposition planning, and follow-up. Use narrative form.`,
  evidence: `Cite pertinent evidence, clinical guidelines, or decision rules supporting the workup and management (e.g., Ottawa Ankle Rules, HEART score, Wells criteria). Include brief rationale for key decisions. Use narrative form.`,
  hpi: `Narrative summary of patient's presentation. Thoroughly document the history and features supporting the working diagnosis. Document that appropriate red flags have been ruled out. Professional, concise ED physician language.`,
  objective: `Physical examination findings ONLY. Use this format for normal exam:
"Patient appears well, NAD. AVSS."
Then include ONLY pertinent exam findings that were actually documented or mentioned. If no exam documented, state "Physical examination not documented."`,
  assessmentPlan: `Do NOT start with the diagnosis name (it is displayed separately above).
Begin directly with the clinical rationale and assessment supporting the diagnosis.
Include differential if applicable.
Document management plan: investigations ordered, treatments given.
Document that appropriate red flags were ruled out.
Include return to ED instructions.
Use paragraph/narrative form only. No bullet points.`,
  diagnosis: `Primary diagnosis only - use common, general terms`,
  editExpand: `Rewrite ONLY the selected text with more detail incorporated. Keep the same clinical voice and style. Do not add information that wouldn't be known from the context. Output ONLY the rewritten text, nothing else.`,
  editShorten: `Make this more concise while preserving all clinically important information. Remove unnecessary words and redundancy. Keep the same professional tone. Output ONLY the shortened text, nothing else.`,
};

const PROMPTS_STORAGE_KEY = 'ed-app-prompts';

export function getPromptTemplates(): PromptTemplates {
  if (typeof window === 'undefined') return DEFAULT_PROMPT_TEMPLATES;
  try {
    const stored = localStorage.getItem(PROMPTS_STORAGE_KEY);
    if (!stored) return DEFAULT_PROMPT_TEMPLATES;
    return { ...DEFAULT_PROMPT_TEMPLATES, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_PROMPT_TEMPLATES;
  }
}

export function savePromptTemplates(templates: PromptTemplates): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(templates));
}

// --- Encounter Types ---

export interface EncounterType {
  id: string;
  label: string;
  prompts: Partial<PromptTemplates>; // overrides for this encounter type
}

const ENCOUNTER_TYPE_KEY = 'ed-app-encounter-type';
const ENCOUNTER_TYPES_KEY = 'ed-app-encounter-types';

export const DEFAULT_ENCOUNTER_TYPES: EncounterType[] = [
  {
    id: 'er',
    label: 'ER',
    prompts: {}, // uses default prompts as-is (already tuned for ER)
  },
  {
    id: 'urgent-care',
    label: 'Urgent Care',
    prompts: {
      generalRules: `- Do NOT assume, infer, or make up information not explicitly stated in the provided data
- Use evidence-based medicine appropriate for an urgent care walk-in setting
- Write as a concise, experienced urgent care physician — professional but efficient
- Abbreviations are acceptable without explanation
- Truncated sentences are acceptable
- Use narrative/paragraph form, NOT bullet points or numbered lists
- Urgent care sees lower-acuity presentations — tailor language accordingly
- Always consider whether the patient needs ED referral or can be safely managed outpatient
- If information for a section is not available, write "Information not documented" or "Insufficient data"`,
      ddx: `Provide a focused differential diagnosis appropriate for an urgent care presentation. Prioritize common outpatient conditions first. Flag any diagnoses that would require ED transfer or immediate escalation. Use narrative form.`,
      investigations: `Recommend investigations available in a typical urgent care setting (point-of-care testing, basic labs, plain radiographs, rapid strep/flu/COVID, UA, etc.). If advanced imaging or labs are needed, specify these as outpatient orders or reasons for ED referral. Use narrative form.`,
      management: `Recommend management appropriate for urgent care disposition. Include:
- Medications prescribed (with dose, frequency, duration)
- Procedures performed in clinic (wound care, splinting, I&D, etc.)
- Patient education and home care instructions
- Clear follow-up plan: PCP follow-up timeline, specialist referral if needed
- Explicit return precautions and criteria for ED visit
Use narrative form.`,
      evidence: `Cite clinical guidelines and decision rules relevant to the urgent care setting. Reference outpatient management guidelines, antibiotic stewardship principles, or validated tools (e.g., Centor score, Ottawa rules, CURB-65). Include rationale for treating outpatient vs. referring to ED. Use narrative form.`,
      hpi: `Narrative summary of the patient's urgent care presentation. Document the chief complaint, timeline, associated symptoms, and relevant history. Note pertinent negatives that support safe outpatient management. Document that red flags for conditions requiring ED care have been assessed. Professional, efficient urgent care physician language.`,
      objective: `Physical examination findings ONLY. Use this format for normal exam:
"Patient appears well, NAD. AVSS."
Then include ONLY pertinent exam findings that were actually documented or mentioned. For urgent care, include focused exam relevant to the chief complaint. If no exam documented, state "Physical examination not documented."`,
      assessmentPlan: `Do NOT start with the diagnosis name (it is displayed separately above).
Begin with clinical reasoning supporting the working diagnosis in an urgent care context.
Address why the patient can be safely managed outpatient (or why ED referral is needed).
Document treatments provided in clinic and prescriptions given.
Include specific follow-up plan: PCP within X days, specialist referral, imaging follow-up.
Document return precautions discussed with the patient.
Use paragraph/narrative form only. No bullet points.`,
      diagnosis: `Primary diagnosis only — use common clinical terms appropriate for an urgent care encounter`,
    },
  },
  {
    id: 'primary-care',
    label: 'Primary Care',
    prompts: {
      generalRules: `- Do NOT assume, infer, or make up information not explicitly stated in the provided data
- Use evidence-based medicine and current clinical practice guidelines
- Write as a thorough primary care physician — professional, patient-centered language
- Abbreviations are acceptable without explanation
- Use narrative/paragraph form, NOT bullet points or numbered lists
- Consider the patient's full medical context: chronic conditions, medications, preventive health
- Frame acute complaints within the context of longitudinal care
- If information for a section is not available, write "Information not documented" or "Insufficient data"`,
      ddx: `Provide a differential diagnosis considering both acute and chronic primary care conditions. Include common outpatient diagnoses first. Consider how existing comorbidities may influence the differential. Note any red flags that would change management urgency. Use narrative form.`,
      investigations: `Recommend investigations appropriate for the primary care setting. Include:
- Routine labs and screening tests (guided by age, sex, risk factors)
- Diagnostic workup for the current complaint
- Chronic disease monitoring labs if due (A1c, lipids, TSH, etc.)
- Imaging as outpatient orders when indicated
- Referral for specialized testing if beyond primary care scope
Use narrative form.`,
      management: `Recommend a comprehensive primary care management plan. Include:
- Medications: new prescriptions, dose adjustments, refills (with rationale)
- Lifestyle modifications: diet, exercise, smoking cessation, stress management
- Chronic disease optimization and medication reconciliation
- Preventive care: vaccinations due, cancer screening, health maintenance
- Referrals to specialists or allied health (physio, dietitian, mental health)
- Follow-up timeline based on clinical urgency
Use narrative form.`,
      evidence: `Cite current clinical practice guidelines relevant to primary care management. Reference guidelines from USPSTF, CDA, CTFPHC, or specialty societies as applicable. Include evidence supporting screening decisions, treatment choices, and preventive measures. Use narrative form.`,
      hpi: `Narrative summary of the patient's presentation in a primary care context. Include the current complaint within the context of their ongoing care — relevant chronic conditions, medication history, previous visits for similar issues, and social determinants of health. Document pertinent positives and negatives. Professional, thorough primary care physician language.`,
      objective: `Physical examination findings ONLY. Use this format for normal exam:
"Patient appears well, NAD. AVSS."
Include a focused exam relevant to the chief complaint and any chronic disease monitoring (e.g., diabetic foot exam, cardiovascular exam). Document pertinent findings only. If no exam documented, state "Physical examination not documented."`,
      assessmentPlan: `Do NOT start with the diagnosis name (it is displayed separately above).
Begin with clinical reasoning and assessment of the current complaint.
Integrate the acute issue with the patient's chronic disease management plan.
Address each active problem discussed during the visit.
Document medication changes with rationale.
Include preventive health measures addressed or deferred.
Provide a clear follow-up plan with timeline and contingency instructions.
Use paragraph/narrative form only. No bullet points.`,
      diagnosis: `Primary diagnosis for this visit — use standard clinical terminology appropriate for a primary care encounter`,
    },
  },
  {
    id: 'specialist-consult',
    label: 'Specialist Consult',
    prompts: {
      generalRules: `- Do NOT assume, infer, or make up information not explicitly stated in the provided data
- Use evidence-based medicine with emphasis on specialty-specific guidelines and literature
- Write as a specialist consultant — detailed, precise, authoritative language
- Abbreviations are acceptable without explanation
- Use narrative/paragraph form, NOT bullet points or numbered lists
- The note serves as a formal consultation response to the referring physician
- Provide clear, actionable recommendations that the referring physician can implement
- If information for a section is not available, write "Information not documented" or "Insufficient data"`,
      ddx: `Provide a detailed differential diagnosis from the specialist's perspective. Include conditions that may have been missed or under-evaluated by the referring physician. Rank by likelihood with specialist-level reasoning. Discuss atypical presentations or rare diagnoses within your specialty that should be considered. Use narrative form.`,
      investigations: `Recommend a specialty-specific diagnostic workup. Include:
- Advanced or specialized laboratory testing
- Specialty-specific imaging (with specific protocols/sequences if applicable)
- Diagnostic procedures (biopsy, endoscopy, EMG, cardiac cath, etc.)
- Functional testing or specialized assessments
- Indicate urgency and sequencing of investigations
Use narrative form.`,
      management: `Provide detailed specialist management recommendations. Include:
- Specialty-specific treatments and therapies (with evidence basis)
- Procedural interventions recommended or planned
- Medication recommendations with specific doses and monitoring parameters
- Clear delineation of what the specialist will manage vs. what the referring physician should manage
- Criteria for re-referral, escalation, or urgent reassessment
- Expected clinical trajectory and milestones
Use narrative form.`,
      evidence: `Cite specialty-specific evidence, guidelines, and current literature supporting the assessment and recommendations. Reference society guidelines (e.g., AHA/ACC, ACG, ACR, ASCO), landmark trials, or meta-analyses as applicable. Provide evidence level where possible. Include rationale for recommendations that deviate from standard protocols. Use narrative form.`,
      hpi: `Comprehensive consultation history. Document:
- Reason for referral and referring physician
- Detailed chronological history of the presenting complaint
- Prior workup already completed (labs, imaging, procedures) with results
- Previous treatments tried and their outcomes
- Relevant past medical, surgical, family, and social history from the specialty perspective
Use detailed, formal consultation language.`,
      objective: `Physical examination findings ONLY. Perform and document a specialty-focused examination in addition to the general assessment. Use this format for normal general exam:
"Patient appears well, NAD. AVSS."
Then document the detailed specialty-specific examination findings. If no exam documented, state "Physical examination not documented."`,
      assessmentPlan: `Do NOT start with the diagnosis name (it is displayed separately above).
Begin with the specialist's clinical impression and reasoning.
Synthesize the referral question with the specialist assessment.
Provide a clear diagnostic formulation from the specialty perspective.
Detail the recommended investigation and management plan with rationale.
Communicate specific recommendations back to the referring physician.
Outline the follow-up plan: specialist follow-up timeline, criteria for re-referral, discharge back to referring physician criteria.
Use paragraph/narrative form only. No bullet points.`,
      diagnosis: `Specialist diagnosis or diagnostic impression — use precise specialty-specific terminology`,
    },
  },
];

/** Get the active encounter type ID */
export function getEncounterType(): string {
  if (typeof window === 'undefined') return 'er';
  return localStorage.getItem(ENCOUNTER_TYPE_KEY) || 'er';
}

/** Save the active encounter type ID */
export function saveEncounterType(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ENCOUNTER_TYPE_KEY, id);
}

/** Get all encounter types (defaults + custom) */
export function getEncounterTypes(): EncounterType[] {
  if (typeof window === 'undefined') return DEFAULT_ENCOUNTER_TYPES;
  try {
    const stored = localStorage.getItem(ENCOUNTER_TYPES_KEY);
    if (!stored) return DEFAULT_ENCOUNTER_TYPES;
    return JSON.parse(stored);
  } catch {
    return DEFAULT_ENCOUNTER_TYPES;
  }
}

/** Save all encounter types */
export function saveEncounterTypes(types: EncounterType[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ENCOUNTER_TYPES_KEY, JSON.stringify(types));
}

/** Get effective prompt templates for a given encounter type */
export function getEffectivePromptTemplates(encounterTypeId?: string): PromptTemplates {
  const base = getPromptTemplates(); // user's global customizations
  const typeId = encounterTypeId || getEncounterType();
  if (typeId === 'er') return base; // ER uses base prompts

  const types = getEncounterTypes();
  const encounterType = types.find(t => t.id === typeId);
  if (!encounterType) return base;

  // Merge: defaults -> user customizations -> encounter type overrides
  return { ...base, ...encounterType.prompts };
}

// --- Parse Rules ---

export interface ParseRules {
  formatName: string;          // e.g. "Meditech", "EPIC", "Custom"
  ageDobPattern: string;       // regex: group1=age, group2=gender, group3=dob
  hcnPattern: string;          // regex: group1=HCN
  mrnPattern: string;          // regex: group1=MRN
  nameCleanup: string;         // comma-separated markers to strip (e.g. "ED")
}

export const DEFAULT_PARSE_RULES: ParseRules = {
  formatName: 'Meditech',
  ageDobPattern: '(\\d+(?:y\\s*\\d+m)?),?\\s*([MF])\\s*(\\d{1,2}\\/\\d{1,2}\\/\\d{4})',
  hcnPattern: 'HCN#\\s*(\\d+)',
  mrnPattern: 'MRN#\\s*([A-Z0-9]+)',
  nameCleanup: 'ED',
};

const PARSE_RULES_STORAGE_KEY = 'ed-app-parse-rules';

export function getParseRules(): ParseRules {
  if (typeof window === 'undefined') return DEFAULT_PARSE_RULES;
  try {
    const stored = localStorage.getItem(PARSE_RULES_STORAGE_KEY);
    if (!stored) return DEFAULT_PARSE_RULES;
    return { ...DEFAULT_PARSE_RULES, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_PARSE_RULES;
  }
}

export function saveParseRules(rules: ParseRules): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PARSE_RULES_STORAGE_KEY, JSON.stringify(rules));
}
