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
    prompts: {}, // uses default prompts as-is
  },
  {
    id: 'urgent-care',
    label: 'Urgent Care',
    prompts: {
      generalRules: `- Do NOT assume, infer, or make up information not explicitly stated in the provided data
- Use appropriate evidence-based medicine and guidelines
- Use professional yet concise language appropriate for an urgent care setting
- Abbreviations are acceptable without explanation
- Truncated sentences are acceptable
- Use narrative/paragraph form, NOT bullet points or numbered lists
- If information for a section is not available, write "Information not documented" or "Insufficient data"`,
      hpi: `Narrative summary of patient's presentation in an urgent care context. Document the history and features supporting the working diagnosis. Note any red flags that would warrant ED referral. Professional, concise language.`,
      assessmentPlan: `Do NOT start with the diagnosis name (it is displayed separately above).
Begin directly with the clinical rationale and assessment.
Include differential if applicable.
Document management plan: investigations, treatments, prescriptions.
Include follow-up plan with primary care or specialist if needed.
Document any red flags discussed and return precautions.
Use paragraph/narrative form only. No bullet points.`,
      management: `Recommend management and treatment plan appropriate for urgent care. Include medications, procedures, referrals, and follow-up planning. Note any conditions requiring ED transfer. Use narrative form.`,
    },
  },
  {
    id: 'primary-care',
    label: 'Primary Care',
    prompts: {
      generalRules: `- Do NOT assume, infer, or make up information not explicitly stated in the provided data
- Use appropriate evidence-based medicine and guidelines
- Use professional language appropriate for a primary care encounter
- Abbreviations are acceptable without explanation
- Use narrative/paragraph form, NOT bullet points or numbered lists
- Consider chronic disease management and preventive care context
- If information for a section is not available, write "Information not documented" or "Insufficient data"`,
      hpi: `Narrative summary of patient's presentation in a primary care context. Include relevant past medical history, chronic conditions, and how current complaint relates to ongoing care. Professional language.`,
      assessmentPlan: `Do NOT start with the diagnosis name (it is displayed separately above).
Begin with clinical reasoning supporting the diagnosis.
Address both acute and chronic issues as applicable.
Document management plan including medications, lifestyle modifications, referrals.
Include follow-up timeline and preventive care considerations.
Use paragraph/narrative form only. No bullet points.`,
      management: `Recommend management plan appropriate for primary care. Include medications, lifestyle modifications, referrals to specialists if needed, screening/preventive care recommendations, and follow-up timeline. Use narrative form.`,
      investigations: `Recommend appropriate investigations for a primary care setting. Include labs, imaging, and screening tests as applicable. Consider preventive care guidelines. Use narrative form.`,
    },
  },
  {
    id: 'specialist-consult',
    label: 'Specialist Consult',
    prompts: {
      generalRules: `- Do NOT assume, infer, or make up information not explicitly stated in the provided data
- Use appropriate evidence-based medicine and specialty-specific guidelines
- Use professional, detailed language appropriate for a specialist consultation
- Abbreviations are acceptable without explanation
- Use narrative/paragraph form, NOT bullet points or numbered lists
- If information for a section is not available, write "Information not documented" or "Insufficient data"`,
      hpi: `Comprehensive narrative of the patient's presentation as referred for specialist consultation. Include reason for referral, relevant history, prior workup, and treatments tried. Detailed, professional language.`,
      assessmentPlan: `Do NOT start with the diagnosis name (it is displayed separately above).
Begin with specialist assessment and clinical reasoning.
Provide detailed differential diagnosis from specialty perspective.
Document recommended specialist-specific investigations and management.
Include recommendations back to referring physician.
Document follow-up plan and criteria for re-referral.
Use paragraph/narrative form only. No bullet points.`,
      management: `Provide specialist-level management recommendations. Include specialty-specific treatments, procedures, and follow-up plan. Document recommendations to the referring physician. Use narrative form.`,
      investigations: `Recommend specialty-specific investigations. Include advanced labs, specialized imaging, and diagnostic procedures as applicable. Use narrative form.`,
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
