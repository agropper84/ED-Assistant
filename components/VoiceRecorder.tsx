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
  // ED-Assistant uses server-side blob upload via FormData POST
  const formData = new FormData();
  const ext = filename.split('.').pop() || 'webm';
  formData.append('audio', blob, `recording-${Date.now()}.${ext}`);
  const res = await fetch('/api/backup-audio', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Backup upload failed');
  const data = await res.json();
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
