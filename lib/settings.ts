export interface AppSettings {
  model: string;
  maxTokens: number;
  temperature: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.3,
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
  assessmentPlan: `Diagnosis or working diagnosis (e.g., Appendicitis, Otitis Media, Abdo Pain NYD).
Summarize assessment leading to diagnosis. Include differential if applicable.
Document management plan: investigations ordered, treatments given.
Document that appropriate red flags were ruled out.
Include return to ED instructions.
Use paragraph/narrative form only. No bullet points.`,
  diagnosis: `Primary diagnosis only - use common, general terms`,
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
