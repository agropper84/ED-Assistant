export interface NamedTemplate {
  name: string;
  instructions: string;
}

export interface AppSettings {
  model: string;
  maxTokens: number;
  temperature: number;
  fastDictation: boolean;
  vchCprpId: string;
  vchSiteFacility: string;
  vchPracNumber: string;
  vchPractitionerName: string;
  noteStyleStandard: string;
  noteStyleDetailed: string;
  noteStyleCompleteExam: string;
  referralInstructions: string;
  admissionInstructions: string;
  referralTemplates?: NamedTemplate[];
  consultTemplates?: NamedTemplate[];
  audioRetentionHours: number;
  sessionTimeoutEnabled: boolean;
  sessionTimeoutMinutes: number;
  fullLoginRequired24h: boolean;
  pinEnabled: boolean;
  totpEnabled: boolean;
}

export const DEFAULT_NOTE_STYLE_STANDARD = 'Write a concise, focused note. Include only clinically relevant findings. Use brief, direct language. Omit normal findings unless pertinent to the differential.';

export const DEFAULT_NOTE_STYLE_DETAILED = 'Write a thorough, detailed note. Include all relevant clinical details, pertinent positives and negatives, complete differential reasoning, and detailed management rationale. Do not abbreviate or omit information. Err on the side of more detail.';

export const DEFAULT_NOTE_STYLE_COMPLETE_EXAM = `Write a comprehensive note documenting a COMPLETE multi-system examination. The objective/physical exam MUST include findings for ALL of the following systems, even if normal (document pertinent negatives):
1. General appearance / vitals
2. HEENT (head, eyes, ears, nose, throat)
3. Neck (lymphadenopathy, thyroid, JVP, meningismus)
4. Cardiovascular (heart sounds, rhythm, murmurs, peripheral pulses)
5. Respiratory (breath sounds, work of breathing, percussion)
6. Abdomen (inspection, palpation, bowel sounds, tenderness)
7. Musculoskeletal (relevant examination, range of motion)
8. Neurological (mental status, cranial nerves, motor, sensory, reflexes, gait)
9. Skin/integumentary (rashes, wounds, color, turgor)
10. Psychiatric (mood, affect, thought process, insight/judgment)

For each system, document specific findings — do not simply write "normal". Use clinical language.
The HPI should be detailed with pertinent positives and negatives for the differential.
The Assessment & Plan should include comprehensive reasoning and detailed management.`;

export const DEFAULT_REFERRAL_INSTRUCTIONS = `Write a professional, concise referral letter to the specified specialty. Include:
1. Patient demographics and reason for referral
2. Brief clinical summary from the encounter
3. Relevant findings and investigations
4. Specific question or request for the consultant
5. Urgency context

Use professional medical language. Be concise but thorough.`;

export const DEFAULT_ADMISSION_INSTRUCTIONS = `Write a comprehensive admission note. Include:
1. Identifying information and reason for admission
2. History of presenting illness (from encounter HPI)
3. Past medical/surgical history (if available)
4. Medications and allergies (if available)
5. Physical examination findings
6. Investigations and results
7. Assessment with differential diagnosis
8. Admission plan — orders, monitoring, consultations, disposition

Use professional medical language. Be thorough and structured.`;

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.3,
  fastDictation: false,
  vchCprpId: '',
  vchSiteFacility: '',
  vchPracNumber: '',
  vchPractitionerName: '',
  noteStyleStandard: DEFAULT_NOTE_STYLE_STANDARD,
  noteStyleDetailed: DEFAULT_NOTE_STYLE_DETAILED,
  noteStyleCompleteExam: DEFAULT_NOTE_STYLE_COMPLETE_EXAM,
  referralInstructions: DEFAULT_REFERRAL_INSTRUCTIONS,
  admissionInstructions: DEFAULT_ADMISSION_INSTRUCTIONS,
  audioRetentionHours: 12,
  sessionTimeoutEnabled: false,
  sessionTimeoutMinutes: 30,
  fullLoginRequired24h: false,
  pinEnabled: false,
  totpEnabled: false,
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
- If information for a section is not available, OMIT that section entirely — do NOT write "not documented", "not performed", "not recorded", or similar placeholder text`,
  ddx: `Provide differential diagnosis based on presentation. List most likely diagnosis first, followed by other considerations. Use narrative form.`,
  investigations: `Recommend appropriate investigations based on the presentation. Include labs, imaging, and other diagnostic tests as applicable. Use narrative form.`,
  management: `Recommend management and treatment plan based on the presentation and differential. Include medications, procedures, disposition planning, and follow-up. Use narrative form.`,
  evidence: `Cite pertinent evidence, clinical guidelines, or decision rules supporting the workup and management (e.g., Ottawa Ankle Rules, HEART score, Wells criteria). Include brief rationale for key decisions. For each guideline or study cited, include a clickable markdown hyperlink using [Guideline/Study Name](URL). ONLY use URLs you are confident are real and accurate — use PubMed links with actual PMIDs (e.g. https://pubmed.ncbi.nlm.nih.gov/12345678/), official society guideline pages, or well-known reference URLs. Do NOT guess or fabricate URLs. If unsure of the exact URL, cite the source by name without a link. Use narrative form.`,
  hpi: `Narrative summary of patient's presentation. Thoroughly document the history and features supporting the working diagnosis. Document that appropriate red flags have been ruled out. Professional, concise ED physician language.`,
  objective: `Physical examination findings ONLY. Use this format for normal exam:
"Patient appears well, NAD. AVSS."
Then include ONLY pertinent exam findings that were actually documented or mentioned. If no exam findings were documented, leave this section empty.`,
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
- If information for a section is not available, OMIT that section entirely — do NOT write "not documented", "not performed", "not recorded", or similar placeholder text`,
      ddx: `Provide a focused differential diagnosis appropriate for an urgent care presentation. Prioritize common outpatient conditions first. Flag any diagnoses that would require ED transfer or immediate escalation. Use narrative form.`,
      investigations: `Recommend investigations available in a typical urgent care setting (point-of-care testing, basic labs, plain radiographs, rapid strep/flu/COVID, UA, etc.). If advanced imaging or labs are needed, specify these as outpatient orders or reasons for ED referral. Use narrative form.`,
      management: `Recommend management appropriate for urgent care disposition. Include:
- Medications prescribed (with dose, frequency, duration)
- Procedures performed in clinic (wound care, splinting, I&D, etc.)
- Patient education and home care instructions
- Clear follow-up plan: PCP follow-up timeline, specialist referral if needed
- Explicit return precautions and criteria for ED visit
Use narrative form.`,
      evidence: `Cite clinical guidelines and decision rules relevant to the urgent care setting. Reference outpatient management guidelines, antibiotic stewardship principles, or validated tools (e.g., Centor score, Ottawa rules, CURB-65). Include rationale for treating outpatient vs. referring to ED. For each guideline or study cited, include a clickable markdown hyperlink to the primary source using the format [Guideline/Study Name](URL). Link to PubMed, journal websites, or society guideline pages. Use narrative form.`,
      hpi: `Narrative summary of the patient's urgent care presentation. Document the chief complaint, timeline, associated symptoms, and relevant history. Note pertinent negatives that support safe outpatient management. Document that red flags for conditions requiring ED care have been assessed. Professional, efficient urgent care physician language.`,
      objective: `Physical examination findings ONLY. Use this format for normal exam:
"Patient appears well, NAD. AVSS."
Then include ONLY pertinent exam findings that were actually documented or mentioned. For urgent care, include focused exam relevant to the chief complaint. If no exam findings were documented, leave this section empty.`,
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
- If information for a section is not available, OMIT that section entirely — do NOT write "not documented", "not performed", "not recorded", or similar placeholder text`,
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
      evidence: `Cite current clinical practice guidelines relevant to primary care management. Reference guidelines from USPSTF, CDA, CTFPHC, or specialty societies as applicable. Include evidence supporting screening decisions, treatment choices, and preventive measures. For each guideline or study cited, include a clickable markdown hyperlink to the primary source using the format [Guideline/Study Name](URL). Link to PubMed, journal websites, or society guideline pages. Use narrative form.`,
      hpi: `Narrative summary of the patient's presentation in a primary care context. Include the current complaint within the context of their ongoing care — relevant chronic conditions, medication history, previous visits for similar issues, and social determinants of health. Document pertinent positives and negatives. Professional, thorough primary care physician language.`,
      objective: `Physical examination findings ONLY. Use this format for normal exam:
"Patient appears well, NAD. AVSS."
Include a focused exam relevant to the chief complaint and any chronic disease monitoring (e.g., diabetic foot exam, cardiovascular exam). Document pertinent findings only. If no exam findings were documented, leave this section empty.`,
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

// --- Literature Sources ---

export interface LiteratureSourcesConfig {
  enabled: boolean;
  sources: Record<string, string>; // encounterTypeId -> comma-separated sources
}

const LIT_SOURCES_KEY = 'ed-app-literature-sources';

export const DEFAULT_LITERATURE_SOURCES: Record<string, string> = {
  er: 'UpToDate, NEJM, BMJ, The American Journal of Emergency Medicine, CJEM, Annals of Emergency Medicine, Rosen\'s Emergency Medicine, Tintinalli\'s Emergency Medicine, ACEP clinical policies, Ottawa Rules, HEART Pathway',
  'urgent-care': 'UpToDate, NEJM, BMJ, American Family Physician, JUCM (Journal of Urgent Care Medicine), IDSA guidelines, Sanford Guide, CDC treatment guidelines',
  'primary-care': 'UpToDate, NEJM, BMJ, American Family Physician, CMAJ, USPSTF recommendations, CDA guidelines, CTFPHC guidelines, Cochrane Reviews, NICE guidelines',
};

export function getLiteratureSourcesConfig(): LiteratureSourcesConfig {
  if (typeof window === 'undefined') return { enabled: false, sources: DEFAULT_LITERATURE_SOURCES };
  try {
    const stored = localStorage.getItem(LIT_SOURCES_KEY);
    if (!stored) return { enabled: false, sources: DEFAULT_LITERATURE_SOURCES };
    return JSON.parse(stored);
  } catch {
    return { enabled: false, sources: DEFAULT_LITERATURE_SOURCES };
  }
}

export function saveLiteratureSourcesConfig(config: LiteratureSourcesConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LIT_SOURCES_KEY, JSON.stringify(config));
}

/** Get effective prompt templates for a given encounter type */
export function getEffectivePromptTemplates(encounterTypeId?: string): PromptTemplates {
  const base = getPromptTemplates(); // user's global customizations
  const typeId = encounterTypeId || getEncounterType();

  const types = getEncounterTypes();
  const encounterType = types.find(t => t.id === typeId);
  let merged = encounterType && typeId !== 'er'
    ? { ...base, ...encounterType.prompts }
    : base;

  // Append literature source constraints if enabled
  const litConfig = getLiteratureSourcesConfig();
  if (litConfig.enabled) {
    const sources = litConfig.sources[typeId] || litConfig.sources['er'] || '';
    if (sources.trim()) {
      const constraint = `\nIMPORTANT: Prioritize and cite from the following sources: ${sources}. Use other sources only if these do not address the topic.`;
      merged = {
        ...merged,
        investigations: merged.investigations + constraint,
        management: merged.management + constraint,
        evidence: merged.evidence + constraint,
      };
    }
  }

  return merged;
}

// --- Speech API selection ---

export type SpeechAPI = 'webspeech' | 'deepgram' | 'wispr' | 'elevenlabs';
export type TranscribeAPI = 'whisper' | 'deepgram' | 'wispr' | 'elevenlabs';

const SPEECH_API_KEY = 'ed-app-speech-api';
const TRANSCRIBE_API_KEY = 'ed-app-transcribe-api';

export function getSpeechAPI(): SpeechAPI {
  if (typeof window === 'undefined') return 'elevenlabs';
  return (localStorage.getItem(SPEECH_API_KEY) as SpeechAPI) || 'elevenlabs';
}

export function saveSpeechAPI(api: SpeechAPI): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SPEECH_API_KEY, api);
}

export function getTranscribeAPI(): TranscribeAPI {
  if (typeof window === 'undefined') return 'elevenlabs';
  return (localStorage.getItem(TRANSCRIBE_API_KEY) as TranscribeAPI) || 'elevenlabs';
}

export function saveTranscribeAPI(api: TranscribeAPI): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TRANSCRIBE_API_KEY, api);
}

// --- Transcription engine (encounter recording / watch) ---

const TRANSCRIBE_WEB_KEY = 'ed-app-transcribe-web';
const TRANSCRIBE_WATCH_KEY = 'ed-app-transcribe-watch';

export function getTranscribeWebAPI(): TranscribeAPI {
  if (typeof window === 'undefined') return 'elevenlabs';
  return (localStorage.getItem(TRANSCRIBE_WEB_KEY) as TranscribeAPI) || 'elevenlabs';
}

export function saveTranscribeWebAPI(api: TranscribeAPI): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TRANSCRIBE_WEB_KEY, api);
}

export function getTranscribeWatchAPI(): TranscribeAPI {
  if (typeof window === 'undefined') return 'elevenlabs';
  return (localStorage.getItem(TRANSCRIBE_WATCH_KEY) as TranscribeAPI) || 'elevenlabs';
}

export function saveTranscribeWatchAPI(api: TranscribeAPI): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TRANSCRIBE_WATCH_KEY, api);
}

// --- Medicalize dictation mode ---

export type MedicalizeDictationMode = 'hold' | 'toggle';
const MED_DICTATION_MODE_KEY = 'ed-app-med-dictation-mode';

export function getMedicalizeDictationMode(): MedicalizeDictationMode {
  if (typeof window === 'undefined') return 'hold';
  return (localStorage.getItem(MED_DICTATION_MODE_KEY) as MedicalizeDictationMode) || 'hold';
}

export function saveMedicalizeDictationMode(mode: MedicalizeDictationMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MED_DICTATION_MODE_KEY, mode);
}

// --- Auto-generate analysis ---

const AUTO_ANALYSIS_KEY = 'ed-app-auto-analysis';

export function getAutoAnalysis(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(AUTO_ANALYSIS_KEY);
  return stored === null ? false : stored === 'true';
}

export function saveAutoAnalysis(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTO_ANALYSIS_KEY, String(enabled));
}

// --- Education Mode ---

export interface EducationConfig {
  enabled: boolean;
  sources: string; // comma-separated sources to narrow scope (empty = not narrowed)
}

const EDUCATION_KEY = 'ed-app-education';

export const DEFAULT_EDUCATION_CONFIG: EducationConfig = {
  enabled: false,
  sources: '',
};

export function getEducationConfig(): EducationConfig {
  if (typeof window === 'undefined') return DEFAULT_EDUCATION_CONFIG;
  try {
    const stored = localStorage.getItem(EDUCATION_KEY);
    if (!stored) return DEFAULT_EDUCATION_CONFIG;
    return { ...DEFAULT_EDUCATION_CONFIG, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_EDUCATION_CONFIG;
  }
}

export function saveEducationConfig(config: EducationConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(EDUCATION_KEY, JSON.stringify(config));
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

export const INPUT_HEALTH_PARSE_RULES: ParseRules = {
  formatName: 'Input Health EMR',
  ageDobPattern: '([A-Za-z]{3}/\\d{1,2}/\\d{4})\\s*\\((\\d+)\\s*yr\\)',
  hcnPattern: 'BC:\\s*\\n?\\s*(\\d{10})',
  mrnPattern: 'MRN#\\s*([A-Z0-9]+)',
  nameCleanup: '(Primary)',
};

export const BUILT_IN_FORMATS: Record<string, ParseRules> = {
  'Meditech': DEFAULT_PARSE_RULES,
  'Input Health EMR': INPUT_HEALTH_PARSE_RULES,
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
