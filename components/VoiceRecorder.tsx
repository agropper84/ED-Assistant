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

async function doUploadBlob(filename: string, blob: Blob): Promise<{ url: string }> {
  console.log(`[VR] doUploadBlob: uploading ${(blob.size / 1024).toFixed(0)}KB...`);
  // Stream raw audio body to server — bypasses FormData parsing and 4.5MB limit
  // Server streams directly to Vercel Blob via put(request.body)
  const contentType = blob.type || 'audio/webm';
  const res = await fetch('/api/backup-audio', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Upload failed: ${res.status} ${err.substring(0, 100)}`);
  }
  const data = await res.json();
  console.log(`[VR] doUploadBlob: ${(blob.size / 1024).toFixed(0)}KB → ${data.url}`);
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
