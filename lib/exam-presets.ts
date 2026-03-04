export interface ExamPreset {
  label: string;
  text: string;
}

const STORAGE_KEY = 'ed-app-exam-presets';

const DEFAULT_PRESETS: ExamPreset[] = [
  { label: 'General', text: 'General: Patient appears well, NAD. AVSS.' },
  { label: 'HEENT', text: 'HEENT: PERRL, EOMI, TMs clear bilaterally, oropharynx clear, no lymphadenopathy.' },
  { label: 'Resp', text: 'Resp: Clear to auscultation bilaterally, no wheezes/crackles, normal work of breathing.' },
  { label: 'CVS', text: 'CVS: S1S2, regular rate and rhythm, no murmurs, peripheral pulses intact.' },
  { label: 'Abdo', text: 'Abdo: Soft, non-tender, non-distended, no guarding/rigidity, BS+.' },
  { label: 'MSK', text: 'MSK: No deformity, full ROM, no tenderness, neurovascularly intact distally.' },
  { label: 'Neuro', text: 'Neuro: Alert and oriented, CN II-XII intact, normal motor/sensory, normal gait.' },
  { label: 'Skin', text: 'Skin: No rashes, warm and well-perfused, no lesions.' },
  { label: 'Psych', text: 'Psych: Calm, cooperative, normal affect, no SI/HI.' },
];

export function getExamPresets(): ExamPreset[] {
  if (typeof window === 'undefined') return DEFAULT_PRESETS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PRESETS;
    return JSON.parse(stored);
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function saveExamPresets(presets: ExamPreset[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function resetExamPresets(): ExamPreset[] {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  return DEFAULT_PRESETS;
}
