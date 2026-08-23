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
  transcribeAsync: '/api/transcribe-async',
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
      tx.onerror = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

const FORMDATA_LIMIT = 4 * 1024 * 1024; // 4MB — stay under Vercel Hobby 4.5MB limit

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

  let url = '';

  if (blob.size > FORMDATA_LIMIT) {
    // Large files: client-side Vercel Blob upload (bypasses serverless body limit)
    console.log(`[VR] doUploadBlob: using client-side upload (${sizeKB}KB > 4MB limit)`);
    const { upload } = await import('@vercel/blob/client');
    const result = await upload(filename, blob, {
      access: 'public',
      handleUploadUrl: '/api/blob-upload-token',
    });
    url = result.url;
  } else {
    // Small files: FormData to serverless function (simpler, no CORS)
    const formData = new FormData();
    const ext = filename.split('.').pop() || 'webm';
    const contentType = blob.type || 'audio/webm';
    formData.append('audio', new File([blob], `recording-${Date.now()}.${ext}`, { type: contentType }));
    const res = await fetch('/api/backup-audio', { method: 'POST', body: formData });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[VR] doUploadBlob server FAILED: ${res.status} ${errText.substring(0, 200)}`);
      throw new Error(`Upload failed: ${res.status}`);
    }
    const data = await res.json();
    url = data.url;
  }

  console.log(`[VR] doUploadBlob: ${sizeKB}KB → ${url}`);
  if (localKey) removeLocalBackup(localKey).catch(() => {});
  return { url };
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
