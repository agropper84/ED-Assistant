import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getUserElevenlabsApiKey, getUserSettings } from '@/lib/kv';

export const maxDuration = 300;

// Comprehensive medical dictionary for ED/hospitalist transcription accuracy
const BASE_MEDICAL_KEYTERMS = [
  // Vitals & measurements
  'systolic', 'diastolic', 'SpO2', 'tachycardic', 'bradycardic', 'febrile', 'afebrile',
  'normotensive', 'hypotensive', 'hypertensive', 'tachypneic', 'eupneic', 'orthostatic',
  // Common ED/hospitalist conditions
  'pneumonia', 'cellulitis', 'sepsis', 'COPD', 'CHF', 'AKI', 'CKD', 'DVT', 'PE',
  'atrial fibrillation', 'hypertension', 'diabetes mellitus', 'hypothyroid', 'hyperthyroid',
  'STEMI', 'NSTEMI', 'acute coronary syndrome', 'heart failure', 'exacerbation',
  'urinary tract infection', 'pyelonephritis', 'osteomyelitis', 'endocarditis',
  'pancreatitis', 'cholecystitis', 'cholangitis', 'diverticulitis', 'appendicitis',
  'pleural effusion', 'pericardial effusion', 'ascites', 'encephalopathy',
  'delirium', 'dementia', 'syncope', 'presyncope', 'seizure', 'stroke', 'TIA',
  'pulmonary embolism', 'deep vein thrombosis', 'anemia', 'thrombocytopenia',
  'hyperkalemia', 'hypokalemia', 'hypernatremia', 'hyponatremia', 'hypoglycemia',
  'diabetic ketoacidosis', 'hyperosmolar', 'rhabdomyolysis', 'acute liver injury',
  'cirrhosis', 'hepatorenal', 'subarachnoid hemorrhage', 'subdural hematoma',
  'gastrointestinal bleed', 'melena', 'hematemesis', 'hematochezia',
  'aspiration', 'atelectasis', 'bronchospasm', 'respiratory failure', 'ARDS',
  // ED-specific
  'laceration', 'fracture', 'dislocation', 'concussion', 'contusion', 'abrasion',
  'anaphylaxis', 'angioedema', 'overdose', 'intoxication', 'withdrawal',
  'chest pain', 'shortness of breath', 'abdominal pain', 'headache', 'back pain',
  'altered mental status', 'loss of consciousness', 'fall', 'trauma', 'MVC',
  // Medications — cardiovascular
  'metoprolol', 'bisoprolol', 'carvedilol', 'atenolol', 'propranolol',
  'lisinopril', 'ramipril', 'enalapril', 'perindopril', 'captopril',
  'amlodipine', 'nifedipine', 'diltiazem', 'verapamil',
  'furosemide', 'hydrochlorothiazide', 'spironolactone', 'bumetanide',
  'apixaban', 'rivaroxaban', 'dabigatran', 'warfarin', 'heparin', 'enoxaparin',
  'clopidogrel', 'ticagrelor', 'aspirin', 'nitroglycerin', 'hydralazine',
  'amiodarone', 'digoxin', 'atorvastatin', 'rosuvastatin',
  // Medications — antibiotics
  'vancomycin', 'piperacillin-tazobactam', 'ceftriaxone', 'cefazolin', 'cefuroxime',
  'meropenem', 'ertapenem', 'amoxicillin', 'amoxicillin-clavulanate',
  'ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'metronidazole',
  'azithromycin', 'doxycycline', 'clindamycin', 'trimethoprim-sulfamethoxazole',
  'linezolid', 'daptomycin', 'fluconazole', 'micafungin',
  // Medications — GI/pain/psych/other
  'pantoprazole', 'omeprazole', 'esomeprazole', 'famotidine', 'ondansetron',
  'metoclopramide', 'lactulose', 'polyethylene glycol', 'sennosides', 'bisacodyl',
  'insulin', 'metformin', 'gliclazide', 'sitagliptin', 'empagliflozin',
  'hydromorphone', 'morphine', 'fentanyl', 'oxycodone', 'acetaminophen',
  'gabapentin', 'pregabalin', 'ketorolac', 'ibuprofen', 'naproxen',
  'quetiapine', 'olanzapine', 'haloperidol', 'lorazepam', 'midazolam',
  'trazodone', 'mirtazapine', 'sertraline', 'escitalopram', 'venlafaxine',
  'propofol', 'dexmedetomidine', 'norepinephrine', 'vasopressin', 'phenylephrine',
  'prednisone', 'methylprednisolone', 'dexamethasone', 'hydrocortisone',
  'levothyroxine', 'melatonin', 'tamsulosin', 'finasteride',
  // ED medications
  'tPA', 'tenecteplase', 'alteplase', 'tranexamic acid', 'ketamine',
  'rocuronium', 'succinylcholine', 'etomidate', 'lidocaine', 'bupivacaine',
  'epinephrine', 'atropine', 'adenosine', 'magnesium sulfate', 'calcium gluconate',
  'naloxone', 'flumazenil', 'N-acetylcysteine', 'activated charcoal',
  // Labs & investigations
  'hemoglobin', 'hematocrit', 'platelet', 'leukocyte', 'neutrophil', 'lymphocyte',
  'creatinine', 'troponin', 'procalcitonin', 'lactate', 'INR', 'PTT', 'D-dimer',
  'bilirubin', 'aminotransferase', 'alkaline phosphatase', 'lipase', 'amylase',
  'albumin', 'ferritin', 'transferrin', 'B-natriuretic peptide', 'BNP',
  'thyroid stimulating hormone', 'TSH', 'hemoglobin A1c', 'C-reactive protein', 'CRP',
  'blood culture', 'urine culture', 'urinalysis', 'cerebrospinal fluid',
  // Clinical terms
  'bilateral', 'unilateral', 'erythema', 'edema', 'consolidation', 'effusion',
  'crepitations', 'crackles', 'rhonchi', 'wheezing', 'stridor',
  'jugular venous distension', 'hepatomegaly', 'splenomegaly', 'ascites',
  'peritoneal', 'guarding', 'rebound', 'Murphy sign', 'McBurney',
  'costovertebral angle', 'suprapubic', 'pedal edema', 'sacral edema',
  'diaphoresis', 'cyanosis', 'pallor', 'jaundice', 'petechiae', 'purpura',
  'Glasgow Coma Scale', 'NIHSS', 'CURB-65', 'Wells score', 'CHA2DS2-VASc',
  // Procedures
  'intubation', 'extubation', 'thoracentesis', 'paracentesis', 'lumbar puncture',
  'central venous catheter', 'arterial line', 'Foley catheter', 'nasogastric tube',
  'chest tube', 'bronchoscopy', 'endoscopy', 'colonoscopy', 'ERCP',
  'cardioversion', 'defibrillation', 'pericardiocentesis', 'dialysis',
  'transfusion', 'packed red blood cells', 'fresh frozen plasma',
  'rapid sequence intubation', 'procedural sedation', 'nerve block',
  'wound closure', 'splinting', 'reduction', 'incision and drainage',
  // Disposition & care
  'disposition', 'discharge', 'admission', 'observation', 'transfer',
  'goals of care', 'code status', 'DNR', 'NKDA', 'most responsible physician',
  'substitute decision maker', 'SDM', 'power of attorney',
  'home care', 'physiotherapy', 'occupational therapy', 'social work',
  'neurology', 'cardiology', 'surgery', 'orthopedics', 'psychiatry',
  'gastroenterology', 'nephrology', 'infectious disease', 'hematology',
  'intensivist', 'hospitalist', 'attending', 'consulting',
];

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const apiKey = await getUserElevenlabsApiKey(session.userId) || process.env.ELEVENLABS_API_KEY || '';
    if (!apiKey) return NextResponse.json({ error: 'ElevenLabs API key not configured. Add your key in Settings.' }, { status: 400 });

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const mode = (formData.get('mode') as string) || 'dictation';
    const keytermsRaw = formData.get('keyterms') as string || '';
    const blobUrl = formData.get('blobUrl') as string || '';

    // Support both direct file upload and blob URL
    let audioBuffer: Buffer;
    let contentType = 'audio/webm';

    if (blobUrl) {
      // Fetch from Vercel Blob
      const blobRes = await fetch(blobUrl);
      if (!blobRes.ok) return NextResponse.json({ error: 'Failed to fetch audio from storage' }, { status: 500 });
      audioBuffer = Buffer.from(await blobRes.arrayBuffer());
      contentType = blobRes.headers.get('content-type') || 'audio/webm';
      // Delete blob after fetching (temporary storage)
      import('@vercel/blob').then(({ del }) => del(blobUrl).catch(() => {}));
    } else if (audioFile && audioFile instanceof File) {
      audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      contentType = audioFile.type || 'audio/webm';
    } else {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    }

    // Step 1: Audio Isolation — clean background noise before transcription
    let cleanedAudio = audioBuffer;
    try {
      const isoForm = new FormData();
      isoForm.append('audio', new Blob([new Uint8Array(audioBuffer)], { type: contentType }), 'recording.webm');
      const isoRes = await fetch('https://api.elevenlabs.io/v1/audio-isolation', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: isoForm,
      });
      if (isoRes.ok) {
        cleanedAudio = Buffer.from(await isoRes.arrayBuffer());
      } else {
        console.warn('Audio isolation failed, using original audio:', isoRes.status);
      }
    } catch (e) {
      console.warn('Audio isolation error, using original:', e);
    }

    // Step 2: Build keyterms — base medical + client-provided + user calibration
    const extraKeyterms: string[] = [];

    // Client-provided keyterms
    if (keytermsRaw) {
      try {
        const parsed = JSON.parse(keytermsRaw);
        if (Array.isArray(parsed)) extraKeyterms.push(...parsed);
      } catch {
        extraKeyterms.push(...keytermsRaw.split(',').map(t => t.trim()).filter(Boolean));
      }
    }

    // User terms from settings — calibration terms + custom medical keyterms
    try {
      const settings = await getUserSettings(session.userId);
      const encounterTerms = (settings?.encounterCustomTerms as string) || '';
      const dictationTerms = (settings?.dictationCustomTerms as string) || '';
      const userKeyterms = (settings?.medicalKeyterms as string) || '';
      const combined = `${encounterTerms}\n${dictationTerms}\n${userKeyterms}`;
      extraKeyterms.push(...combined.split(/[,\n]+/).map(t => t.trim()).filter(t => t.length > 1));
    } catch {}

    // Patient-specific terms — extract from patient data for better recognition
    const sheetName = formData.get('sheetName') as string || '';
    const rowIndex = formData.get('rowIndex') as string || '';
    if (sheetName && rowIndex) {
      try {
        const { getDataContext, getPatient } = await import('@/lib/data-layer');
        const ctx = await getDataContext();
        const patient = await ctx ? await getPatient(ctx, parseInt(rowIndex), sheetName) : null;
        if (patient) {
          // Patient name
          if (patient.name) extraKeyterms.push(patient.name);
          // Diagnosis
          if (patient.diagnosis) extraKeyterms.push(...patient.diagnosis.split(/[,;]+/).map(t => t.trim()).filter(t => t.length > 2));
          // Profile: medications, allergies, PMHx
          if (patient.profile) {
            try {
              const prof = JSON.parse(patient.profile);
              if (prof.pmhx?.length) extraKeyterms.push(...prof.pmhx);
              if (prof.medications?.length) extraKeyterms.push(...prof.medications);
              if (prof.allergies?.length) extraKeyterms.push(...prof.allergies);
            } catch {}
          }
        }
      } catch {}
    }

    const allKeyterms = Array.from(new Set([...BASE_MEDICAL_KEYTERMS, ...extraKeyterms]))
      .filter(t => t.length > 1 && t.length <= 50 && t.split(/\s+/).length <= 5)
      .slice(0, 1000);

    // Step 3: Call Scribe v2 with medical keyterms
    const fd = new FormData();
    const ext = contentType.includes('mp4') ? 'mp4' : 'webm';
    fd.append('file', new Blob([new Uint8Array(cleanedAudio)], { type: contentType }), `recording.${ext}`);
    fd.append('model_id', 'scribe_v2');
    fd.append('language_code', 'en');
    if (mode === 'encounter') {
      fd.append('diarize', 'true');
    }
    // Medical keyterms boost accuracy for clinical terminology (+20% cost)
    for (const term of allKeyterms) {
      fd.append('keyterms[]', term);
    }

    const elResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: fd,
    });

    if (!elResponse.ok) {
      const err = await elResponse.text().catch(() => 'Unknown error');
      console.error('ElevenLabs Scribe error:', elResponse.status, err);
      return NextResponse.json({ error: `ElevenLabs error: ${elResponse.status}: ${err.substring(0, 200)}` }, { status: 500 });
    }

    const data = await elResponse.json();
    let transcript = data?.text || '';

    // Build speaker-tagged transcript from word-level diarization
    if (mode === 'encounter' && data?.words?.length) {
      const lines: string[] = [];
      let currentSpeaker = -1;
      let currentLine = '';
      for (const word of data.words) {
        // Handle audio events (laughter, coughing, etc.)
        if (word.type === 'audio_event') {
          if (currentLine.trim()) {
            lines.push(`Speaker ${currentSpeaker + 1}: ${currentLine.trim()}`);
            currentLine = '';
          }
          lines.push(`[${word.text || word.audio_event || 'sound'}]`);
          continue;
        }
        const speaker = word.speaker_id ?? word.speaker ?? -1;
        if (speaker !== currentSpeaker && speaker >= 0) {
          if (currentLine.trim()) lines.push(`Speaker ${currentSpeaker + 1}: ${currentLine.trim()}`);
          currentSpeaker = speaker;
          currentLine = '';
        }
        currentLine += (word.text || word.word || word.punctuated_word || '') + ' ';
      }
      if (currentLine.trim()) lines.push(`Speaker ${currentSpeaker + 1}: ${currentLine.trim()}`);
      if (lines.length > 0) transcript = lines.join('\n');
    }

    // Extract detected entities (medications, conditions, etc.)
    const entities = data?.entities || [];

    return NextResponse.json({
      text: transcript.trim(),
      entities: entities.length > 0 ? entities : undefined,
      audioIsolated: cleanedAudio !== audioBuffer,
      keytermsUsed: allKeyterms.length,
    });
  } catch (error: any) {
    console.error('ElevenLabs transcription error:', error);
    return NextResponse.json({ error: error?.message || 'ElevenLabs transcription failed' }, { status: 500 });
  }
}
