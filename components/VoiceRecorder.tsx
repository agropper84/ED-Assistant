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
  // Client-side Vercel Blob upload — bypasses 4.5MB serverless body limit (up to 100MB)
  const { upload } = await import('@vercel/blob/client');
  const result = await upload(filename, blob, {
    access: 'public',
    handleUploadUrl: '/api/blob-upload-token',
  });
  console.log(`[VR] doUploadBlob: ${(blob.size / 1024).toFixed(0)}KB → ${result.url}`);
  return { url: result.url };
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
