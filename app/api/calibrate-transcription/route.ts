import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, getPatients } from '@/lib/data-layer';
import { getAnthropicClient } from '@/lib/api-keys';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings, setUserSettings } from '@/lib/kv';
import { withApiHandler } from '@/lib/api-handler';
import { MODELS } from '@/lib/config';

export const maxDuration = 120;

const VALID_MODES = ['dictation', 'encounter'] as const;
type CalMode = typeof VALID_MODES[number];

const SETTINGS_KEY: Record<CalMode, string> = {
  dictation: 'dictationCalibration',
  encounter: 'encounterCalibration',
};

export const POST = withApiHandler({ rateLimit: { limit: 5, window: 60 } }, async (request) => {
  const { mode } = await request.json();
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json({ error: 'Mode must be "dictation" or "encounter"' }, { status: 400 });
  }

  const ctx = await getDataContext();
  const session = await getSessionFromCookies();

  // Gather transcript samples from recent patients
  const samples: { date: string; text: string; patientContext: string }[] = [];

  // Get available date sheets and scan recent ones
  const { getDateSheets } = await import('@/lib/data-layer');
  const sheets = await getDateSheets(ctx);

  for (const sheetName of sheets.slice(0, 10)) {
    try {
      const patients = await getPatients(ctx, sheetName);
      for (const p of patients) {
        // For dictation mode: look at the transcript field (physician dictation)
        // For encounter mode: look at encounterNotes field (encounter recording)
        const field = mode === 'dictation' ? p.transcript : p.encounterNotes;
        if (field && field.trim().length > 50) {
          samples.push({
            date: sheetName,
            text: field.trim().substring(0, 1000),
            patientContext: `${p.age || ''} ${p.gender || ''} — ${p.diagnosis || 'undifferentiated'}`.trim(),
          });
        }
        if (samples.length >= 15) break;
      }
    } catch {}
    if (samples.length >= 15) break;
  }

  const modeLabel = mode === 'dictation' ? 'dictations' : 'encounter recordings';
  if (samples.length < 2) {
    return NextResponse.json({
      error: `Not enough ${mode} samples found. Record more ${modeLabel} first (need at least 2, found ${samples.length}).`,
    }, { status: 400 });
  }

  const samplesText = samples.slice(0, 15).map((s, i) =>
    `--- Sample ${i + 1} (${s.date}) ---\nContext: ${s.patientContext}\n${s.text}`
  ).join('\n\n');

  // Get existing calibration to merge with
  const existingSettings = session.userId ? await getUserSettings(session.userId) : null;
  const calKey = SETTINGS_KEY[mode as CalMode];
  const existingCal = existingSettings?.[calKey] as Record<string, string> | undefined;
  const existingRulesSection = existingCal
    ? `\n\nEXISTING CALIBRATION (update and refine these — do NOT start from scratch):
Rules: ${existingCal.rules || 'None yet'}
Terminology: ${existingCal.terminology || 'None yet'}
${mode === 'dictation' ? `Style: ${existingCal.style || 'None yet'}`
  : `Speaker ID: ${existingCal.speakerLabeling || 'None yet'}`}`
    : '';

  let prompt: string;
  let jsonFormat: string;

  if (mode === 'dictation') {
    jsonFormat = `{ "rules": "...", "terminology": "...", "style": "..." }`;
    prompt = `You are updating an emergency physician's dictation calibration profile. Review these ${samples.length} NEW dictation samples and update the calibration rules. Keep rules concise (max 8-10 bullet points per section).
${existingRulesSection}

NEW DICTATION SAMPLES:
${samplesText}

Produce UPDATED calibration in EXACTLY this JSON format:
${jsonFormat}

rules: Concise bullet-pointed rules (max 10) for processing this physician's dictations. Focus on ED-specific patterns — how they document presentations, exams, and plans.
terminology: Specific terms/abbreviations. Format: 'spoken → written'. Max 15 entries.
style: Brief description (2-3 sentences) of writing style preferences.
Be specific. Only include well-supported patterns from the data.`;
  } else {
    jsonFormat = `{ "rules": "...", "terminology": "...", "speakerLabeling": "..." }`;
    prompt = `You are updating an emergency physician's encounter transcript calibration profile. Review these ${samples.length} NEW encounter transcript samples and update the calibration rules. Keep rules concise (max 8-10 bullet points per section).
${existingRulesSection}

NEW ENCOUNTER TRANSCRIPT SAMPLES:
${samplesText}

Produce UPDATED calibration in EXACTLY this JSON format:
${jsonFormat}

rules: Concise bullet-pointed rules (max 10) for processing encounters. Focus on ED triage conversations, history-taking, and exam communication.
terminology: Specific terms. Format: 'spoken → medical'. Max 15 entries.
speakerLabeling: Brief rules (2-3 sentences) for identifying speakers (physician vs patient vs nurse).
Be specific. Only include well-supported patterns from the data.`;
  }

  const client = await getAnthropicClient();
  const response = await client.messages.create({
    model: MODELS.default,
    max_tokens: 2048,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse calibration response');

  const parsed = JSON.parse(jsonMatch[0]);
  const calibration: Record<string, string> = {
    rules: parsed.rules || '',
    terminology: parsed.terminology || '',
    lastCalibrated: new Date().toISOString(),
    samplesUsed: String(samples.length),
  };
  if (mode === 'dictation') calibration.style = parsed.style || '';
  if (mode === 'encounter') calibration.speakerLabeling = parsed.speakerLabeling || '';

  // Save to user settings
  if (session.userId) {
    const existing = await getUserSettings(session.userId) || {};
    await setUserSettings(session.userId, { ...existing, [calKey]: calibration });
  }

  return NextResponse.json({ calibration, samplesAnalyzed: samples.length });
});
