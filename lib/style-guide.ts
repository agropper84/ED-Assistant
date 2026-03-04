export interface StyleGuide {
  examples: {
    hpi: string[];
    objective: string[];
    assessmentPlan: string[];
  };
  computedFeatures: string;
}

const STORAGE_KEY = 'ed-app-style-guide';

function getDefault(): StyleGuide {
  return {
    examples: { hpi: [], objective: [], assessmentPlan: [] },
    computedFeatures: '',
  };
}

export function getStyleGuide(): StyleGuide {
  if (typeof window === 'undefined') return getDefault();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return getDefault();
    return JSON.parse(stored);
  } catch {
    return getDefault();
  }
}

export function saveStyleGuide(guide: StyleGuide): void {
  if (typeof window === 'undefined') return;
  guide.computedFeatures = computeFeatures(guide);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guide));
}

export function addExample(section: 'hpi' | 'objective' | 'assessmentPlan', example: string): void {
  const guide = getStyleGuide();
  if (!guide.examples[section].includes(example)) {
    guide.examples[section].push(example);
    saveStyleGuide(guide);
  }
}

export function removeExample(section: 'hpi' | 'objective' | 'assessmentPlan', index: number): void {
  const guide = getStyleGuide();
  guide.examples[section].splice(index, 1);
  saveStyleGuide(guide);
}

function computeFeatures(guide: StyleGuide): string {
  const features: string[] = [];
  const allExamples = [
    ...guide.examples.hpi,
    ...guide.examples.objective,
    ...guide.examples.assessmentPlan,
  ];

  if (allExamples.length === 0) return '';

  // Check format preferences
  const hasBullets = allExamples.some(e => /^[\s]*[-*•]/.test(e) || /\n[\s]*[-*•]/.test(e));
  const hasParagraphs = allExamples.some(e => !(/^[\s]*[-*•]/.test(e)) && e.length > 100);

  if (hasParagraphs && !hasBullets) features.push('paragraph form preferred');
  if (hasBullets && !hasParagraphs) features.push('bullet points preferred');
  if (hasBullets && hasParagraphs) features.push('mixed format (paragraphs and bullets)');

  // Check abbreviation usage
  const commonAbbrevs = ['pt', 'hx', 'dx', 'tx', 'rx', 'sx', 'c/o', 'w/', 'b/l', 'NAD', 'AVSS', 'WNL'];
  const abbrevCount = allExamples.reduce((count, e) => {
    return count + commonAbbrevs.filter(a => e.toLowerCase().includes(a.toLowerCase())).length;
  }, 0);
  if (abbrevCount > allExamples.length * 2) features.push('heavy abbreviation use');
  else if (abbrevCount > 0) features.push('moderate abbreviation use');

  // Check detail level
  const avgLength = allExamples.reduce((sum, e) => sum + e.length, 0) / allExamples.length;
  if (avgLength > 500) features.push('high detail level');
  else if (avgLength > 200) features.push('moderate detail level');
  else features.push('concise/brief style');

  return features.join(', ');
}
