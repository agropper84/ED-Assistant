'use client';

import { VoiceRecorder as SharedVoiceRecorder, type VoiceRecorderProps as SharedProps } from '@med/voice-recorder';
import { getSpeechAPI, getTranscribeAPI, getTranscribeWebAPI } from '@/lib/settings';

const ENDPOINTS: SharedProps['endpoints'] = {
  elevenlabsToken: '/api/elevenlabs-token',
  deepgramToken: '/api/deepgram-token',
  transcribeElevenlabs: '/api/transcribe-elevenlabs',
  transcribeDeepgram: '/api/transcribe-deepgram',
  transcribeWispr: '/api/transcribe-wispr',
  transcribeDefault: '/api/transcribe',
  transcribeAsync: '/api/transcribe-server',
  medicalize: '/api/medicalize',
  uploadAudio: '/api/backup-audio',
};

// --- Local IndexedDB backup for audio safety ---

const IDB_NAME = 'ed-audio-backup';
const IDB_STORE = 'recordings';

async function saveToLocalBackup(blob: Blob, label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const key = `${label}-${Date.now()}`;
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => {
      const tx = req.result.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ blob, timestamp: Date.now(), label }, key);
      tx.oncomplete = () => { console.log(`[VR] Local backup saved: ${key} (${(blob.size/1024).toFixed(0)}KB)`); resolve(key); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function removeLocalBackup(key: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => {
      const tx = req.result.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // non-critical
    };
    req.onerror = () => resolve();
  });
}

async function doUploadBlob(filename: string, blob: Blob): Promise<{ url: string }> {
  const sizeKB = (blob.size / 1024).toFixed(0);
  console.log(`[VR] doUploadBlob: uploading ${sizeKB}KB...`);

  // Save local backup FIRST — before any network call
  let localKey = '';
  try {
    localKey = await saveToLocalBackup(blob, filename.split('/').pop() || 'recording');
  } catch (e) {
    console.warn('[VR] Local backup failed (continuing with upload):', e);
  }

  // Upload via FormData to /api/backup-audio (Pro plan supports up to 100MB body)
  const formData = new FormData();
  const ext = filename.split('.').pop() || 'webm';
  const contentType = blob.type || 'audio/webm';
  formData.append('audio', new File([blob], `${filename.replace(/\//g, '-')}-${Date.now()}.${ext}`, { type: contentType }));

  const res = await fetch('/api/backup-audio', { method: 'POST', body: formData });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[VR] doUploadBlob FAILED: ${res.status} ${errText.substring(0, 200)}`);
    // DON'T remove local backup on failure — keep it as safety net
    throw new Error(`Upload failed: ${res.status}`);
  }

  const data = await res.json();
  console.log(`[VR] doUploadBlob: ${sizeKB}KB → ${data.url}`);

  // Upload succeeded — remove local backup (it's in Vercel Blob now)
  if (localKey) removeLocalBackup(localKey).catch(() => {});

  return { url: data.url };
}

type VoiceRecorderProps = Omit<SharedProps, 'endpoints' | 'getSpeechEngine' | 'getTranscribeEngine' | 'getEncounterEngine' | 'nativeBridge' | 'uploadBlob'>;

export function VoiceRecorder(props: VoiceRecorderProps) {
  return (
    <SharedVoiceRecorder
      {...props}
      endpoints={ENDPOINTS}
      getSpeechEngine={getSpeechAPI}
      getTranscribeEngine={getTranscribeAPI}
      getEncounterEngine={getTranscribeWebAPI}
      uploadBlob={doUploadBlob}
    />
  );
}
