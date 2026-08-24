/** Sensitivity → audio processing settings for the compressor/gain chain.
 * 4 tuned presets covering close-speaker to room-wide pickup. */
export function sensitivitySettings(sensitivity: number): { gain: number; threshold: number; ratio: number; knee: number; release: number } {
  if (sensitivity <= 1) return { gain: 1.0, threshold: -40, ratio: 2, knee: 40, release: 0.3 };
  if (sensitivity === 2) return { gain: 1.5, threshold: -45, ratio: 3, knee: 40, release: 0.25 };
  if (sensitivity === 3) return { gain: 2.0, threshold: -50, ratio: 3.5, knee: 35, release: 0.2 };
  return { gain: 2.5, threshold: -55, ratio: 4, knee: 30, release: 0.15 };
}

/** Build audio constraints based on mode, sensitivity, and pocket mode. */
export function buildAudioConstraints(mode: string, sensitivity: number, pocketMode?: boolean): MediaStreamConstraints {
  if (pocketMode) {
    return { audio: { sampleRate: { ideal: 48000 }, channelCount: { ideal: 1 }, autoGainControl: true, noiseSuppression: true, echoCancellation: false } };
  }
  if (mode === 'encounter') {
    return { audio: { sampleRate: { ideal: 48000 }, channelCount: { ideal: 1 }, autoGainControl: { ideal: false }, noiseSuppression: { ideal: false }, echoCancellation: { ideal: false } } };
  }
  return { audio: { sampleRate: { ideal: 48000 }, channelCount: { ideal: 1 }, echoCancellation: { ideal: false }, noiseSuppression: sensitivity <= 2, autoGainControl: sensitivity <= 2 } };
}

export function getMimeType(): string {
  if (typeof MediaRecorder !== 'undefined') {
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  }
  return 'audio/webm';
}

export function getFileExtension(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}
