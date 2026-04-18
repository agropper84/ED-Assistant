import { NextRequest, NextResponse } from 'next/server';
import { getDeepgramApiKey } from '@/lib/api-keys';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSettings } from '@/lib/kv';

/**
 * Fix common medical STT errors that speech engines consistently get wrong.
 * These are fast regex replacements — no API call needed.
 */
function fixCommonMedicalErrors(text: string): string {
  return text
    // Phonetic misheard medical terms
    .replace(/\bnew monya\b/gi, 'pneumonia')
    .replace(/\bnew monia\b/gi, 'pneumonia')
    .replace(/\bneumonia\b/gi, 'pneumonia')
    .replace(/\bsee ?pa\b/gi, 'CVA')
    .replace(/\bsee ?va\b/gi, 'CVA')
    .replace(/\btendered\b/gi, 'tender')
    .replace(/\btenderness\b/gi, 'tenderness') // keep correct
    .replace(/\bby pap\b/gi, 'BiPAP')
    .replace(/\bbe pap\b/gi, 'BiPAP')
    .replace(/\bsee pap\b/gi, 'CPAP')
    .replace(/\bgerd\b/gi, 'GERD')
    .replace(/\becho\b/g, (m, offset, str) => {
      // Only capitalize if likely medical context (not "echo" as in sound)
      const before = str.substring(Math.max(0, offset - 20), offset).toLowerCase();
      return before.includes('ordered') || before.includes('get') || before.includes('stat') || before.includes('bedside') ? 'ECHO' : m;
    })
    // Common abbreviation fixes
    .replace(/\bsp ?02\b/gi, 'SpO2')
    .replace(/\bsp ?oh ?2\b/gi, 'SpO2')
    .replace(/\bsats\b/gi, 'sats')
    .replace(/\bg ?c ?s\b/gi, 'GCS')
    .replace(/\be ?k ?g\b/gi, 'EKG')
    .replace(/\be ?c ?g\b/gi, 'ECG')
    .replace(/\bb ?p\b/g, (m, offset, str) => {
      const before = str.substring(Math.max(0, offset - 5), offset);
      return /[\d\s,.]$/.test(before) || offset === 0 ? 'BP' : m;
    })
    .replace(/\bh ?r\b/g, (m, offset, str) => {
      const after = str.substring(offset + m.length, offset + m.length + 5);
      return /^\s*\d/.test(after) ? 'HR' : m;
    })
    // Drug name fixes
    .replace(/\btylenol\b/gi, 'Tylenol')
    .replace(/\badvil\b/gi, 'Advil')
    .replace(/\bmotrin\b/gi, 'Motrin')
    .replace(/\bgravel\b/gi, 'Gravol')
    .replace(/\bnarcan\b/gi, 'Narcan')
    .replace(/\bventolin\b/gi, 'Ventolin')
    .replace(/\bativan\b/gi, 'Ativan')
    .replace(/\bdilaudid\b/gi, 'Dilaudid')
    .replace(/\btoradol\b/gi, 'Toradol')
    .replace(/\bzofran\b/gi, 'Zofran')
    .replace(/\bmaxeran\b/gi, 'Maxeran')
    .replace(/\bgravol\b/gi, 'Gravol')
    .replace(/\bkeflex\b/gi, 'Keflex')
    .replace(/\baugmentin\b/gi, 'Augmentin')
    .replace(/\bcipro\b/gi, 'Cipro')
    // Units and measurements
    .replace(/\bmils\b/gi, 'mLs')
    .replace(/\bmigs\b/gi, 'mg')
    .replace(/\bmikes\b/gi, 'mcg')
    .trim();
}

export const maxDuration = 60;

/** Extract calibration terminology as keyword boost list */
async function getCalibrationKeywords(mode: string): Promise<string[]> {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return [];
    const settings = await getUserSettings(session.userId);
    const calKey = mode === 'dictation' ? 'dictationCalibration' : 'encounterCalibration';
    const cal = settings?.[calKey] as Record<string, string> | undefined;
    if (!cal?.terminology) return [];
    // Parse "spoken → written" pairs into keyword list
    return cal.terminology
      .split('\n')
      .map(line => {
        const arrow = line.indexOf('→');
        return arrow >= 0 ? line.substring(arrow + 1).trim() : line.trim();
      })
      .filter(k => k.length > 1)
      .slice(0, 50);
  } catch {
    return [];
  }
}

/**
 * Format a diarized Deepgram response into speaker-labeled transcript.
 * Uses word-level speaker IDs to group speech into labeled turns.
 */
function formatDiarizedTranscript(data: any): string {
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words;
  if (!Array.isArray(words) || words.length === 0) {
    return data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  }

  const turns: { speaker: number; text: string }[] = [];
  let currentSpeaker = -1;

  for (const word of words) {
    const speaker = word.speaker ?? 0;
    if (speaker !== currentSpeaker) {
      turns.push({ speaker, text: word.punctuated_word || word.word });
      currentSpeaker = speaker;
    } else {
      turns[turns.length - 1].text += ' ' + (word.punctuated_word || word.word);
    }
  }

  // Label speakers — in a 2-person encounter, lower speaker ID is typically the physician
  return turns
    .map(t => `Speaker ${t.speaker + 1}: ${t.text}`)
    .join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = await getDeepgramApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured. Add your key in Settings > Privacy.' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const mode = (formData.get('mode') as string) || 'dictation';
    const context = (formData.get('context') as string) || '';

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const isEncounter = mode === 'encounter';

    // Build Deepgram query params
    const params = new URLSearchParams({
      model: 'nova-3-medical',
      smart_format: isEncounter ? 'false' : 'true', // OFF for encounters — prevents hallucinated formatting
      punctuate: 'true',
      language: 'en',
      filler_words: 'true', // Keep all words — medical terms can sound like fillers
      ...(isEncounter ? {
        diarize: 'true',
        utterances: 'true',
        paragraphs: 'true',
      } : {}),
    });

    // Add calibration keywords for term boosting
    const keywords = await getCalibrationKeywords(mode);
    for (const kw of keywords) {
      params.append('keywords', `${kw}:2`);
    }

    // Extract key medical terms from context for keyword boosting across segments
    if (context) {
      const contextTerms = context
        .split(/\s+/)
        .filter(w => w.length > 3 && /^[A-Z]/.test(w)) // capitalized words likely medical terms
        .slice(-10);
      for (const term of Array.from(new Set(contextTerms))) {
        params.append('keywords', `${term}:1`);
      }
    }

    const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': audioFile.type || 'audio/webm',
      },
      body: buffer,
    });

    if (!dgRes.ok) {
      const err = await dgRes.text();
      console.error('Deepgram API error:', dgRes.status, err);
      return NextResponse.json({ error: `Deepgram error: ${dgRes.status}` }, { status: 500 });
    }

    const data = await dgRes.json();

    // For encounters with diarization, format with speaker labels
    const rawTranscript = isEncounter
      ? formatDiarizedTranscript(data)
      : (data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '');

    // Apply common medical STT corrections
    const transcript = fixCommonMedicalErrors(rawTranscript);

    return NextResponse.json({ text: transcript.trim() });
  } catch (error: any) {
    console.error('Deepgram transcription error:', error);
    return NextResponse.json(
      { error: error?.message || 'Deepgram transcription failed' },
      { status: 500 }
    );
  }
}
