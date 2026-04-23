'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Upload, Stethoscope } from 'lucide-react';
import { getSpeechAPI, getTranscribeAPI, getTranscribeWebAPI, type TranscribeAPI } from '@/lib/settings';

function getTranscribeEndpoint(api: TranscribeAPI | string): string {
  if (api === 'deepgram') return '/api/transcribe-deepgram';
  if (api === 'wispr') return '/api/transcribe-wispr';
  if (api === 'elevenlabs') return '/api/transcribe-elevenlabs';
  return '/api/transcribe';
}

function convertSpokenPunctuation(text: string): string {
  let t = text;

  // Step 1: Strip commas/periods between adjacent punctuation commands
  // iOS Web Speech inserts commas/periods during pauses and auto-punctuates
  t = t.replace(/\b(period|full stop|question mark|exclamation (?:mark|point))[.,;,\s]+(?=new (?:line|paragraph)|next (?:line|paragraph)|line break|paragraph break)/gi, '$1 ');

  // Step 2a: Compound patterns — word form (sentence-ender + line break)
  t = t.replace(/\s*(?<!\bmenstrual )\b(?:period|full stop)\b(?!\s+of)\s*\b(?:new paragraph|next paragraph|paragraph break)\b\s*/gi, '.\n\n');
  t = t.replace(/\s*(?<!\bmenstrual )\b(?:period|full stop)\b(?!\s+of)\s*\b(?:new line|newline|next line|line break)\b\s*/gi, '.\n');
  t = t.replace(/\s*\b(?:question mark)\b\s*\b(?:new paragraph|next paragraph|paragraph break)\b\s*/gi, '?\n\n');
  t = t.replace(/\s*\b(?:question mark)\b\s*\b(?:new line|newline|next line|line break)\b\s*/gi, '?\n');

  // Step 2b: Already-punctuated form — iOS converts "period" to "." automatically
  t = t.replace(/([.!?])\s*\b(?:new paragraph|next paragraph|paragraph break)\b[.!?]?\s*/gi, '$1\n\n');
  t = t.replace(/([.!?])\s*\b(?:new line|newline|next line|line break)\b[.!?]?\s*/gi, '$1\n');

  // Step 3: Individual punctuation commands
  t = t.replace(/\s*(?<!\bmenstrual )\b(?:period|full stop)\b(?!\s+of)\s*/gi, '. ');
  t = t.replace(/\s*\b(?:question mark)\b\s*/gi, '? ');
  t = t.replace(/\s*\b(?:exclamation (?:mark|point))\b\s*/gi, '! ');
  t = t.replace(/\s*\b(?:ellipsis|dot dot dot)\b\s*/gi, '... ');
  t = t.replace(/\s*\bcomma\b\s*/gi, ', ');
  t = t.replace(/\s*\bcolon\b\s*/gi, ': ');
  t = t.replace(/\s*\bsemicolon\b\s*/gi, '; ');
  t = t.replace(/\s*\b(?:dash|em dash|long dash)\b\s*/gi, ' — ');
  t = t.replace(/\s*\b(?:hyphen|short dash)\b\s*/gi, '-');
  t = t.replace(/\s*\b(?:forward slash|slash)\b\s*/gi, '/');
  t = t.replace(/\s*\b(?:open paren(?:thesis)?|left paren(?:thesis)?)\b\s*/gi, ' (');
  t = t.replace(/\s*\b(?:close paren(?:thesis)?|right paren(?:thesis)?|end paren(?:thesis)?)\b\s*/gi, ') ');
  t = t.replace(/\s*\b(?:new paragraph|next paragraph|paragraph break)\b\s*/gi, '\n\n');
  t = t.replace(/\s*\b(?:new line|newline|next line|line break)\b\s*/gi, '\n');
  t = t.replace(/\s*\b(?:bullet point|bullet)\b\s*/gi, '\n• ');
  t = t.replace(/\s*\b(?:number sign|hashtag|pound sign)\b\s*/gi, '#');
  t = t.replace(/\s*\b(?:percent sign|percent)\b(?!\s*(?:of|or|and|is|was|were|are|in|at|from))\s*/gi, '% ');
  t = t.replace(/\s*\b(?:degree|degrees)\b\s*/gi, '° ');
  // Brackets & quotes
  t = t.replace(/\s*\b(?:open bracket|left bracket)\b\s*/gi, ' [');
  t = t.replace(/\s*\b(?:close bracket|right bracket|end bracket)\b\s*/gi, '] ');
  t = t.replace(/\s*\b(?:open quote|begin quote)\b\s*/gi, ' "');
  t = t.replace(/\s*\b(?:close quote|end quote|unquote)\b\s*/gi, '" ');
  // Tab / indent
  t = t.replace(/\s*\b(?:tab|indent)\b\s*/gi, '\t');
  // Math & symbols
  t = t.replace(/\s*\b(?:at sign)\b\s*/gi, '@');
  t = t.replace(/\s*\b(?:ampersand|and sign)\b\s*/gi, ' & ');
  t = t.replace(/\s*\b(?:plus sign)\b\s*/gi, ' + ');
  t = t.replace(/\s*\b(?:minus sign)\b\s*/gi, ' - ');
  t = t.replace(/\s*\b(?:equals sign|equal sign)\b\s*/gi, ' = ');
  t = t.replace(/\s*\b(?:times sign|multiplication sign)\b\s*/gi, ' × ');
  t = t.replace(/\s*\b(?:greater than sign|greater than)\b\s*/gi, ' > ');
  t = t.replace(/\s*\b(?:less than sign|less than)\b\s*/gi, ' < ');

  // Step 4: Cleanup
  t = t.replace(/,\s*([.!?;:\n])/g, '$1');
  t = t.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());
  t = t.replace(/(\n\s*)([a-z])/g, (_, n, l) => n + l.toUpperCase());
  t = t.replace(/ {2,}/g, ' ');
  return t.trim();
}

type RecorderState = 'idle' | 'recording' | 'transcribing' | 'error';

/** Build audio constraints based on mode and sensitivity.
 * Encounter mode uses a DynamicsCompressor+Gain chain (built separately) to
 * boost quiet patient speech. Echo cancellation ON with the gain chain works
 * well — the gain compensates for any AEC attenuation. */
function buildAudioConstraints(mode: string, sensitivity: number): MediaTrackConstraints {
  // Use plain booleans (not { ideal: ... }) for Safari/iPad compatibility
  // Match Hosp Workbook's working constraints exactly
  if (mode === 'encounter') {
    return {
      autoGainControl: true,
      noiseSuppression: false,
      echoCancellation: true,
      sampleRate: 48000,
    };
  }

  // Dictation: single close speaker
  return {
    autoGainControl: sensitivity <= 2,
    noiseSuppression: sensitivity <= 2,
    echoCancellation: false,
    sampleRate: 48000,
  };
}

/** Sensitivity → audio processing settings for the compressor/gain chain.
 * Gentle settings to boost quiet voices WITHOUT destroying dynamic range.
 * Max compression ratio 4:1 (broadcast standard) — never higher. */
function sensitivitySettings(sensitivity: number): { gain: number; threshold: number; ratio: number; knee: number; release: number } {
  // Continuous 0.5-4x range — interpolate linearly
  const t = Math.max(0, Math.min(1, (sensitivity - 0.5) / 3.5)); // 0-1 normalized
  return {
    gain: 0.5 + t * 2.0,         // 0.5x → 2.5x
    threshold: -35 - t * 20,      // -35 → -55 dB
    ratio: 1.5 + t * 2.5,         // 1.5:1 → 4:1
    knee: 40 - t * 10,            // 40 → 30
    release: 0.3 - t * 0.15,      // 0.3 → 0.15
  };
}

/** Create a gain-boosted audio stream for recording.
 * DynamicsCompressor amplifies quiet speech (patient at distance) while
 * preventing loud speech (physician close to mic) from clipping. */
function createBoostedStream(stream: MediaStream, sensitivity: number): {
  boostedStream: MediaStream; ctx: AudioContext; gainNode: GainNode; compressor: DynamicsCompressorNode;
} {
  const settings = sensitivitySettings(sensitivity);
  // Match Hosp Workbook's working AudioContext setup for Safari/iPad
  const ctx = new AudioContext({ sampleRate: 48000 });
  const source = ctx.createMediaStreamSource(stream);

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -50;
  compressor.knee.value = 40;
  compressor.ratio.value = 12;
  compressor.attack.value = 0;
  compressor.release.value = 0.25;

  const gainNode = ctx.createGain();
  gainNode.gain.value = sensitivity;

  source.connect(compressor);
  compressor.connect(gainNode);

  const dest = ctx.createMediaStreamDestination();
  gainNode.connect(dest);

  return { boostedStream: dest.stream, ctx, gainNode, compressor };
}

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  /** Called with true when raw STT text is shown (being refined), false when final text arrives */
  onProcessingChange?: (processing: boolean) => void;
  /** Called with audio data during recording for external visualization.
   * level: 0-1 overall volume. lowFreq/highFreq: 0-1 energy in low/high bands.
   * speakerHint: 'near' (loud, likely physician) | 'far' (quiet, likely patient) | 'silent' */
  onAudioLevel?: (data: { level: number; lowFreq: number; highFreq: number; speakerHint: 'near' | 'far' | 'silent' }) => void;
  disabled?: boolean;
  mode?: 'encounter' | 'dictation';
  showUpload?: boolean;
  /** Mic sensitivity: 1=low (close speaker), 2=medium (default), 3=high (room-wide), 4=max */
  sensitivity?: number;
  /** Called when user enters medicalize mode (hold > 500ms) */
  onMedicalizeStart?: () => void;
  /** Base64 encryption key for blob backup. If provided, encrypts audio before uploading. */
  encryptionKey?: string;
  /** Called with blob URL after successful backup upload */
  onBlobBackup?: (blobUrl: string, iv: string, contentType: string) => void;
}

/** Encrypt binary data with AES-256-GCM using Web Crypto API (browser-native) */
async function encryptAudioBlob(audioBlob: Blob, keyBase64: string): Promise<{ encrypted: Blob; ivBase64: string }> {
  const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new Uint8Array(await audioBlob.arrayBuffer());
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  // Pack: ciphertext + authTag (last 16 bytes are the tag in Web Crypto)
  const encrypted = new Blob([new Uint8Array(ciphertext)], { type: 'application/octet-stream' });
  const ivBase64 = btoa(Array.from(iv).map(b => String.fromCharCode(b)).join(''));
  return { encrypted, ivBase64 };
}

export function VoiceRecorder({
  onTranscript, onInterimTranscript, onRecordingStart, onRecordingStop, onProcessingChange, onAudioLevel,
  onMedicalizeStart, disabled, mode = 'dictation', showUpload, sensitivity = 2, encryptionKey, onBlobBackup,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const stateRef = useRef<RecorderState>('idle');
  const setRecState = (s: RecorderState) => { stateRef.current = s; setState(s); };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const boostCtxRef = useRef<AudioContext | null>(null); // Encounter gain-boost AudioContext
  const boostGainRef = useRef<GainNode | null>(null);  // Live-adjustable gain node
  const boostCompressorRef = useRef<DynamicsCompressorNode | null>(null);
  const pressActiveRef = useRef(false);      // true from pointerDown to pointerUp
  const toggleModeRef = useRef(false);       // true when in click-to-stop non-medicalize mode
  const mimeTypeRef = useRef('');
  const accumulatedTextRef = useRef('');
  const stoppingRef = useRef(false);

  // Periodic refinement refs
  const refineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refinedTextRef = useRef('');          // Deepgram-refined text accumulated so far
  const segmentStartRef = useRef(0);          // When current segment started
  const refineCountRef = useRef(0);           // Number of segments refined
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null); // Detects speech pause
  const lastSpeechRef = useRef(0);            // Timestamp of last speech event

  // Deepgram WebSocket streaming refs
  const dgSocketRef = useRef<WebSocket | null>(null);
  const dgProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const dgContextRef = useRef<AudioContext | null>(null);

  // ElevenLabs WebSocket streaming refs
  const elWsRef = useRef<WebSocket | null>(null);
  const elProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const [isHolding, setIsHolding] = useState(false);
  const isHoldingRef = useRef(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Audio level visualization
  const [audioLevel, setAudioLevel] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // iOS keepalive
  const keepaliveAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stable callback refs
  const onInterimRef = useRef(onInterimTranscript);
  onInterimRef.current = onInterimTranscript;
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onProcessingRef = useRef(onProcessingChange);
  onProcessingRef.current = onProcessingChange;
  const onAudioLevelRef = useRef(onAudioLevel);
  onAudioLevelRef.current = onAudioLevel;
  const onRecordingStopRef = useRef(onRecordingStop);
  onRecordingStopRef.current = onRecordingStop;
  const onMedicalizeStartRef = useRef(onMedicalizeStart);
  onMedicalizeStartRef.current = onMedicalizeStart;

  const useStreaming = mode === 'dictation' && !!onInterimTranscript;

  // Live-update boost gain/compressor when sensitivity slider changes mid-recording
  useEffect(() => {
    if (boostGainRef.current && boostCompressorRef.current && state === 'recording') {
      const settings = sensitivitySettings(sensitivity);
      boostGainRef.current.gain.setTargetAtTime(settings.gain, boostGainRef.current.context.currentTime, 0.05);
      boostCompressorRef.current.threshold.setTargetAtTime(settings.threshold, boostCompressorRef.current.context.currentTime, 0.05);
      boostCompressorRef.current.ratio.setTargetAtTime(settings.ratio, boostCompressorRef.current.context.currentTime, 0.05);
      boostCompressorRef.current.knee.setTargetAtTime(settings.knee, boostCompressorRef.current.context.currentTime, 0.05);
    }
  }, [sensitivity, state]);

  useEffect(() => {
    if (state === 'error') {
      const t = setTimeout(() => setRecState('idle'), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (refineTimerRef.current) clearInterval(refineTimerRef.current);
      if (dgSocketRef.current) { try { dgSocketRef.current.close(); } catch {} }
      if (dgProcessorRef.current) { try { dgProcessorRef.current.disconnect(); } catch {} }
      if (dgContextRef.current) { try { dgContextRef.current.close(); } catch {} }
      if (elWsRef.current) { try { elWsRef.current.close(); } catch {} }
      if (elProcessorRef.current) { try { elProcessorRef.current.disconnect(); } catch {} }
      if (keepaliveAudioRef.current) { keepaliveAudioRef.current.pause(); keepaliveAudioRef.current = null; }
    };
  }, []);

  // --- iOS keepalive ---
  const startKeepalive = useCallback(() => {
    try {
      if (keepaliveAudioRef.current) return;
      const sampleRate = 8000, numSamples = sampleRate;
      const buffer = new ArrayBuffer(44 + numSamples);
      const view = new DataView(buffer);
      const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); view.setUint32(4, 36 + numSamples, true); w(8, 'WAVE');
      w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate, true);
      view.setUint16(32, 1, true); view.setUint16(34, 8, true); w(36, 'data'); view.setUint32(40, numSamples, true);
      for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128);
      const audio = new Audio(URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })));
      audio.loop = true; audio.volume = 0.01; audio.play().catch(() => {});
      keepaliveAudioRef.current = audio;
    } catch {}
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveAudioRef.current) { keepaliveAudioRef.current.pause(); keepaliveAudioRef.current.src = ''; keepaliveAudioRef.current = null; }
  }, []);

  const getMimeType = (): string => {
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    }
    return 'audio/webm';
  };

  const getFileExtension = (mime: string): string => mime.includes('mp4') ? 'mp4' : 'webm';

  // --- Audio level viz with frequency analysis for speaker detection ---
  const startAudioLevelViz = useCallback((analyser: AnalyserNode) => {
    const timeData = new Float32Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    // Track baseline volume to distinguish near/far speakers
    let baselineLevel = 0;
    let sampleCount = 0;

    const tick = () => {
      // Time domain for overall level
      analyser.getFloatTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
      const rms = Math.sqrt(sum / timeData.length);
      const level = Math.min(1, rms / 0.25);
      setAudioLevel(level);

      // Frequency data (kept for future use)
      analyser.getByteFrequencyData(freqData);
      const binCount = freqData.length;
      const lowEnd = Math.floor(binCount * 0.15);
      const highStart = Math.floor(binCount * 0.4);
      const highEnd = Math.floor(binCount * 0.7);

      let lowSum = 0, highSum = 0;
      for (let i = 0; i < lowEnd; i++) lowSum += freqData[i];
      for (let i = highStart; i < highEnd; i++) highSum += freqData[i];
      const lowFreq = Math.min(1, (lowSum / lowEnd) / 100);
      const highFreq = Math.min(1, (highSum / (highEnd - highStart)) / 100);

      // Speaker hint: just voice vs silence (reliable diarization
      // isn't possible from a single mono mic in real-time)
      const speakerHint: 'near' | 'far' | 'silent' = level > 0.03 ? 'near' : 'silent';

      onAudioLevelRef.current?.({ level, lowFreq, highFreq, speakerHint });
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAudioLevelViz = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    setAudioLevel(0);
  }, []);

  // --- Stop Web Speech ---
  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
  }, []);

  // --- Stop Deepgram WebSocket streaming ---
  const stopDeepgramStream = useCallback(() => {
    if (dgProcessorRef.current) { try { dgProcessorRef.current.disconnect(); } catch {} dgProcessorRef.current = null; }
    if (dgContextRef.current) { try { dgContextRef.current.close(); } catch {} dgContextRef.current = null; }
    if (dgSocketRef.current) {
      try {
        if (dgSocketRef.current.readyState === WebSocket.OPEN) {
          dgSocketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        }
        dgSocketRef.current.close();
      } catch {}
      dgSocketRef.current = null;
    }
  }, []);

  // --- Start Deepgram WebSocket streaming for real-time live text ---
  const startDeepgramStream = useCallback(async (audioStream: MediaStream, isEncounterMode: boolean) => {
    try {
      // Get API key from server
      const tokenRes = await fetch('/api/deepgram-token');
      if (!tokenRes.ok) return false;
      const { key } = await tokenRes.json();
      if (!key) return false;

      // Build WebSocket URL with params
      const params = new URLSearchParams({
        model: 'nova-3-medical',
        language: 'en',
        smart_format: 'true',
        punctuate: 'true',
        interim_results: 'true',
        filler_words: 'false',
        vad_events: 'true',
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
      });
      if (isEncounterMode) {
        params.set('diarize', 'true');
      }

      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['token', key]);
      dgSocketRef.current = ws;

      let finalTranscript = '';

      ws.onmessage = (event) => {
        if (isHoldingRef.current) return; // suppress during medicalize hold

        try {
          const data = JSON.parse(event.data);
          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];
            const text = alt.transcript || '';
            const isFinal = data.is_final;

            if (isFinal && text) {
              finalTranscript += (finalTranscript ? ' ' : '') + text;
              // Convert spoken punctuation commands ("period" → ".", "comma" → ",", etc.)
              const converted = convertSpokenPunctuation(finalTranscript);
              accumulatedTextRef.current = converted;
              onInterimRef.current?.(converted);
              onProcessingRef.current?.(false);
            } else if (text) {
              // Interim result — show converted final + raw interim tail
              const convertedFinal = finalTranscript ? convertSpokenPunctuation(finalTranscript) : '';
              const display = convertedFinal ? `${convertedFinal} ${text}` : text;
              accumulatedTextRef.current = display;
              onInterimRef.current?.(display);
              onProcessingRef.current?.(true);
            }
          }
        } catch {}
      };

      ws.onerror = () => {};
      ws.onclose = () => { dgSocketRef.current = null; };

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        const timeout = setTimeout(() => reject(new Error('WS timeout')), 5000);
        const origClose = ws.onclose;
        ws.onclose = (e) => { clearTimeout(timeout); reject(new Error('WS closed')); if (origClose) (origClose as any)(e); };
      });

      // Create AudioContext to convert mic stream to 16-bit PCM for Deepgram
      const ctx = new AudioContext({ sampleRate: 16000 });
      dgContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(audioStream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      dgProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        // Convert Float32 to Int16 PCM
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        ws.send(int16.buffer);
      };

      source.connect(processor);
      processor.connect(ctx.destination); // required for processing to run

      return true;
    } catch {
      stopDeepgramStream();
      return false;
    }
  }, [stopDeepgramStream]);

  // --- Stop ElevenLabs WebSocket streaming ---
  const stopElevenLabsStream = useCallback(() => {
    if (elWsRef.current) {
      try {
        if (elWsRef.current.readyState === WebSocket.OPEN) {
          // Send commit to flush final transcript
          elWsRef.current.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: 16000 }));
        }
        elWsRef.current.close();
      } catch {}
      elWsRef.current = null;
    }
    if (elProcessorRef.current) { try { elProcessorRef.current.disconnect(); } catch {} elProcessorRef.current = null; }
  }, []);

  // --- Start ElevenLabs WebSocket streaming for real-time live text ---
  const startElevenLabsStream = useCallback(async (audioStream: MediaStream): Promise<boolean> => {
    let retryCount = 0;
    const MAX_RETRIES = 1;

    const connect = (): Promise<boolean> => new Promise(async (resolve) => {
      try {
        const tokenRes = await fetch('/api/elevenlabs-token');
        if (!tokenRes.ok) { resolve(false); return; }
        const tokenData = await tokenRes.json();
        const token = tokenData.token;
        if (!token) { resolve(false); return; }

        const wsParams = new URLSearchParams({
          model_id: 'scribe_v2_realtime',
          language_code: 'en',
          token,
        });
        const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${wsParams}`;

        const ws = new WebSocket(wsUrl);
        elWsRef.current = ws;
        let fullTranscript = '';
        let elAudioCtx: AudioContext | null = null;
        let resolved = false;

        ws.onmessage = (event) => {
          if (isHoldingRef.current) return;
          try {
            const msg = JSON.parse(event.data);
            const msgType = msg.message_type || msg.type;
            if (msgType === 'partial_transcript') {
              const text = msg.text || '';
              const full = convertSpokenPunctuation((fullTranscript + text).trim());
              accumulatedTextRef.current = full;
              onInterimRef.current?.(full);
            } else if (msgType === 'committed_transcript' || msgType === 'committed_transcript_with_timestamps') {
              const text = msg.text || '';
              fullTranscript += text + ' ';
              const full = convertSpokenPunctuation(fullTranscript.trim());
              accumulatedTextRef.current = full;
              onInterimRef.current?.(full);
            } else if (msgType === 'session_started') {
              console.log('ElevenLabs realtime session started');
            } else if (msgType === 'error') {
              console.error('ElevenLabs realtime error:', msg);
            }
          } catch {}
        };

        ws.onopen = () => {
          retryCount = 0;
          if (!audioStream.active) return;
          // Capture audio at 16kHz, convert to PCM16, send as base64 JSON chunks
          elAudioCtx = new AudioContext({ sampleRate: 16000 });
          const source = elAudioCtx.createMediaStreamSource(audioStream);
          const processor = elAudioCtx.createScriptProcessor(4096, 1, 1);
          elProcessorRef.current = processor;
          processor.onaudioprocess = (e) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const input = e.inputBuffer.getChannelData(0);
            const pcm = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) {
              pcm[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
            }
            const bytes = new Uint8Array(pcm.buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const base64 = btoa(binary);
            ws.send(JSON.stringify({
              message_type: 'input_audio_chunk',
              audio_base_64: base64,
              sample_rate: 16000,
              commit: false,
            }));
          };
          source.connect(processor);
          processor.connect(elAudioCtx.destination);
          if (!resolved) { resolved = true; resolve(true); }
        };

        ws.onerror = () => { console.warn('ElevenLabs WebSocket error'); };

        ws.onclose = (e) => {
          console.warn('ElevenLabs WebSocket closed:', e.code, e.reason);
          elWsRef.current = null;
          if (elAudioCtx) { try { elAudioCtx.close(); } catch {} }
          if (!resolved) { resolved = true; resolve(false); }
          // Reconnect if still recording
          if (stateRef.current === 'recording' && audioStream.active && retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`ElevenLabs WebSocket reconnecting (attempt ${retryCount})...`);
            setTimeout(() => connect(), 1000);
          }
        };

        // Timeout if WebSocket doesn't connect
        setTimeout(() => { if (!resolved) { resolved = true; resolve(false); } }, 5000);
      } catch {
        resolve(false);
      }
    });

    return connect();
  }, []);

  // --- Start Web Speech (suppresses output when isHoldingRef is true) ---
  const startWebSpeech = useCallback(() => {
    const SpeechAPI = typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
    if (!SpeechAPI) return;
    try {
      const recognition = new SpeechAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      let finalTranscript = '';
      recognition.onresult = (event: any) => {
        // Suppress output during hold (medicalize mode)
        if (isHoldingRef.current) return;

        let interim = '';
        let hasNewFinal = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) { finalTranscript += event.results[i][0].transcript + ' '; hasNewFinal = true; }
          else { interim += event.results[i][0].transcript; }
        }
        const full = convertSpokenPunctuation((finalTranscript + interim).trim());
        accumulatedTextRef.current = full;
        lastSpeechRef.current = Date.now();

        // If we have refined text from Deepgram, show refined + any new unrefined tail
        if (refinedTextRef.current && full.length > refinedTextRef.current.length) {
          onInterimRef.current?.(refinedTextRef.current + ' ' + full.slice(refinedTextRef.current.length).trim());
          onProcessingRef.current?.(true); // new unrefined text → grey
        } else if (refinedTextRef.current) {
          onInterimRef.current?.(refinedTextRef.current);
        } else {
          onInterimRef.current?.(full);
          // Show as grey while interim results are coming in
          if (!hasNewFinal || interim) {
            onProcessingRef.current?.(true);
          }
        }

        // Pause detection: after 1.5s of no new speech, mark text as settled
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        if (hasNewFinal && !interim) {
          // Final result with no pending interim — text is settled now
          onProcessingRef.current?.(false);
        } else {
          pauseTimerRef.current = setTimeout(() => {
            // 1.5s silence — treat current text as final/settled
            if (stateRef.current === 'recording' && !stoppingRef.current) {
              onProcessingRef.current?.(false);
            }
          }, 1500);
        }
      };
      recognition.onerror = () => {};
      recognition.onend = () => {
        if (stateRef.current === 'recording' && streamRef.current && !isHoldingRef.current) {
          try { recognition.start(); } catch {}
        }
      };
      recognition.start();
      recognitionRef.current = recognition;
    } catch {}
  }, []);

  // --- Clean up mic/audio resources ---
  const cleanupResources = useCallback(() => {
    stoppingRef.current = true;
    stopAudioLevelViz();
    stopKeepalive();
    stopWebSpeech();
    stopDeepgramStream();
    stopElevenLabsStream();
    if (refineTimerRef.current) { clearInterval(refineTimerRef.current); refineTimerRef.current = null; }
    if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
    if (boostCtxRef.current) { try { boostCtxRef.current.close(); } catch {} boostCtxRef.current = null; }
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, [stopAudioLevelViz, stopKeepalive, stopWebSpeech, stopElevenLabsStream]);

  // --- Collect audio blob from MediaRecorder ---
  const collectAudioBlob = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;
    return new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
      recorder.stop();
    });
  }, []);

  // --- Backup dictation audio to server (fire-and-forget) ---
  const backupDictationAudio = useCallback((blob: Blob, label: string) => {
    if (!blob || blob.size < 2000) return;
    const ext = getFileExtension(mimeTypeRef.current);
    const formData = new FormData();
    formData.append('audio', blob, `${label}-${Date.now()}.${ext}`);
    formData.append('mode', label);
    fetch('/api/backup-audio', { method: 'POST', body: formData }).catch(() => {});
  }, []);

  // --- Flush current audio segment to Deepgram for refinement ---
  const flushSegmentForRefinement = useCallback(async () => {
    if (stoppingRef.current) return;
    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    if (!recorder || recorder.state !== 'recording' || !stream) return;
    if (Date.now() - segmentStartRef.current < 2000) return; // too short

    // Stop current recorder and collect blob
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
      recorder.stop();
    });

    // Start a new segment immediately (mic stream is still open)
    if (!stoppingRef.current && stream.active) {
      const newRecorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
      mediaRecorderRef.current = newRecorder;
      chunksRef.current = [];
      newRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      newRecorder.start();
      segmentStartRef.current = Date.now();
    }

    // Send blob for Deepgram/Wispr STT refinement only (no medicalize on segments —
    // fragments are too short for Claude to process accurately. Medicalize runs once on final stop.)
    if (blob.size > 2000) {
      try {
        const transcribeEngine = getTranscribeAPI();
        const useExternal = transcribeEngine === 'deepgram' || transcribeEngine === 'wispr';
        if (!useExternal) return;

        const formData = new FormData();
        formData.append('audio', blob, `segment.${getFileExtension(mimeTypeRef.current)}`);
        formData.append('mode', 'dictation');
        formData.append('skipMedicalize', 'true'); // Non-medicalize: verbatim STT only
        // Pass previous text as context so STT can resolve mid-sentence boundaries
        if (refinedTextRef.current) {
          formData.append('context', refinedTextRef.current.split(/\s+/).slice(-50).join(' '));
        }
        const res = await fetch(getTranscribeEndpoint(transcribeEngine), { method: 'POST', body: formData });
        if (res.ok && !stoppingRef.current) {
          const { text } = await res.json();
          if (text?.trim()) {
            refinedTextRef.current = refinedTextRef.current
              ? `${refinedTextRef.current} ${text.trim()}`
              : text.trim();
            refineCountRef.current++;
            if (!stoppingRef.current) {
              // Only update display if refined text is at least as long as Web Speech
              // Prevents replacing good content with truncated STT
              const wsLen = accumulatedTextRef.current?.length || 0;
              if (refinedTextRef.current.length >= wsLen * 0.6) {
                onInterimRef.current?.(refinedTextRef.current);
                onProcessingRef.current?.(false);
              }
            }
          }
        }
      } catch {}
    }
  }, []);

  // =================================================================
  // DICTATION MODE: Start recording (mic + MediaRecorder + Web Speech)
  // Web Speech starts immediately for instant text, but its output is
  // suppressed if the user holds past 500ms (medicalize mode).
  // Periodic refinement: every 8s, flush audio to Deepgram for cleanup.
  // =================================================================
  const startDictationRecording = useCallback(async () => {
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraints(mode, sensitivity) });
      streamRef.current = rawStream;
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;

      onRecordingStart?.();
      startKeepalive();
      stoppingRef.current = false;

      // Gain-boost dictation audio (sensitivity controls compression + gain level)
      const { boostedStream, ctx: boostCtx, gainNode, compressor } = createBoostedStream(rawStream, 2);
      boostCtxRef.current = boostCtx;

      // Record from boosted stream for better Deepgram recognition
      const recorder = new MediaRecorder(boostedStream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(3000); // 3s timeslice for near-real-time Deepgram live text
      segmentStartRef.current = Date.now();

      accumulatedTextRef.current = '';
      refinedTextRef.current = '';
      refineCountRef.current = 0;
      setRecState('recording');

      // Try real-time WebSocket streaming for live text
      const speechEngine = getSpeechAPI();
      let streamSuccess = false;

      if (speechEngine === 'elevenlabs') {
        // ElevenLabs Scribe v2 realtime WebSocket
        streamSuccess = await startElevenLabsStream(rawStream);
      }

      if (!streamSuccess && speechEngine !== 'elevenlabs') {
        // Deepgram WebSocket streaming (~300ms latency, medical model)
        streamSuccess = await startDeepgramStream(rawStream, false);
      }

      if (!streamSuccess) {
        // Fallback: Web Speech for instant text + periodic REST refinement
        startWebSpeech();
        if (refineTimerRef.current) clearInterval(refineTimerRef.current);
        refineTimerRef.current = setInterval(() => {
          if (!stoppingRef.current && !isHoldingRef.current) flushSegmentForRefinement();
        }, 3000);
      }

      // Audio level visualization
      try {
        const vizCtx = new AudioContext();
        const vizSource = vizCtx.createMediaStreamSource(rawStream);
        const vizAnalyser = vizCtx.createAnalyser();
        vizAnalyser.fftSize = 2048;
        vizSource.connect(vizAnalyser);
        audioContextRef.current = vizCtx;
        analyserRef.current = vizAnalyser;
        startAudioLevelViz(vizAnalyser);
      } catch {}
    } catch {
      setRecState('error');
    }
  }, [onRecordingStart, startKeepalive, startWebSpeech, startDeepgramStream, startElevenLabsStream, startAudioLevelViz, flushSegmentForRefinement]);

  // --- Stop non-medicalize (toggle mode) ---
  const stopNonMedicalize = useCallback(async () => {
    // Stop refinement timer first
    if (refineTimerRef.current) { clearInterval(refineTimerRef.current); refineTimerRef.current = null; }

    const speechEngine = getSpeechAPI();
    const transcribeEngine = getTranscribeAPI();
    const useDeepgramCleanup = transcribeEngine === 'deepgram' || transcribeEngine === 'wispr';

    // Collect final audio segment before cleanup
    const recorder = mediaRecorderRef.current;
    let finalBlob: Blob | null = null;
    if (recorder && recorder.state === 'recording') {
      finalBlob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
        recorder.stop();
      });
    }

    const webSpeechText = accumulatedTextRef.current || '';

    cleanupResources();

    // Backup dictation audio (fire-and-forget)
    if (finalBlob) backupDictationAudio(finalBlob, 'dictation');

    // ElevenLabs realtime: show live text immediately, then re-transcribe
    // with medical keyterms in background for improved accuracy
    if (speechEngine === 'elevenlabs' && webSpeechText.length > 0) {
      // Commit final text via onTranscript
      onTranscriptRef.current(webSpeechText);
      onInterimRef.current?.('');

      // Background: re-transcribe with medical keyterms via batch endpoint
      if (finalBlob && finalBlob.size > 2000) {
        (async () => {
          try {
            const fd = new FormData();
            fd.append('audio', finalBlob!, `recording.${getFileExtension(mimeTypeRef.current)}`);
            fd.append('mode', 'dictation');
            const res = await fetch('/api/transcribe-elevenlabs', { method: 'POST', body: fd });
            if (res.ok) {
              const { text } = await res.json();
              if (text?.trim() && text.trim() !== webSpeechText.trim()) {
                onTranscriptRef.current(text.trim());
              }
            }
          } catch {}
        })();
      }

      onProcessingRef.current?.(false);
      accumulatedTextRef.current = '';
      refinedTextRef.current = '';
      refineCountRef.current = 0;
      setRecState('idle');
      return;
    }

    // STT-refine the final audio segment — verbatim only, no AI medicalize
    if (useDeepgramCleanup && finalBlob && finalBlob.size > 2000) {
      setRecState('transcribing');
      onProcessingRef.current?.(true);
      try {
        const formData = new FormData();
        formData.append('audio', finalBlob, `segment.${getFileExtension(mimeTypeRef.current)}`);
        formData.append('mode', 'dictation');
        formData.append('skipMedicalize', 'true'); // Non-medicalize: verbatim STT only
        const res = await fetch(getTranscribeEndpoint(transcribeEngine), { method: 'POST', body: formData });
        if (res.ok) {
          const { text } = await res.json();
          if (text?.trim()) {
            refinedTextRef.current = refinedTextRef.current
              ? `${refinedTextRef.current} ${text.trim()}`
              : text.trim();
          }
        }
      } catch {}
    }

    // Determine best final text and commit via onTranscript
    const dgWsText = accumulatedTextRef.current?.trim() || '';
    const refined = refinedTextRef.current?.trim() || '';
    const finalText = (refined && refined.length > dgWsText.length * 0.9) ? refined : dgWsText;

    if (finalText) {
      onTranscriptRef.current(finalText);
      onInterimRef.current?.('');
    }

    onProcessingRef.current?.(false);
    accumulatedTextRef.current = '';
    refinedTextRef.current = '';
    refineCountRef.current = 0;
    setRecState('idle');
  }, [cleanupResources]);

  // --- Stop medicalize (hold release) → single-shot transcribe + medicalize ---
  const stopMedicalizeHold = useCallback(async () => {
    cleanupResources();
    setRecState('transcribing');

    const blob = await collectAudioBlob();

    // Backup medicalize audio (fire-and-forget)
    if (blob) backupDictationAudio(blob, 'medicalize');

    if (blob && blob.size > 2000) {
      try {
        const formData = new FormData();
        formData.append('audio', blob, `recording.${getFileExtension(mimeTypeRef.current)}`);
        formData.append('mode', 'dictation');

        const transcribeEngine = getTranscribeAPI();
        const useExternalSTT = transcribeEngine === 'deepgram' || transcribeEngine === 'wispr' || transcribeEngine === 'elevenlabs';

        let finalText = '';
        if (useExternalSTT) {
          const sttRes = await fetch(getTranscribeEndpoint(transcribeEngine), { method: 'POST', body: formData });
          if (sttRes.ok) {
            const { text: sttText } = await sttRes.json();
            if (sttText?.trim()) {
              const medRes = await fetch('/api/medicalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: sttText.trim(), mode: 'dictation' }),
              });
              if (medRes.ok) {
                const { text: medText } = await medRes.json();
                finalText = (medText?.trim()) || sttText.trim();
              } else {
                finalText = sttText.trim();
              }
            }
          }
        } else {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          if (res.ok) {
            const { text } = await res.json();
            if (text?.trim()) finalText = text.trim();
          }
        }

        // Commit final medicalized text via onTranscript
        if (finalText) {
          onTranscriptRef.current(finalText);
          onInterimRef.current?.('');
        }
      } catch {}
    }

    onProcessingRef.current?.(false);
    setRecState('idle');
  }, [cleanupResources, collectAudioBlob, backupDictationAudio]);

  // =================================================================
  // ENCOUNTER MODE: Simple click toggle
  // =================================================================
  const startEncounterRecording = useCallback(async () => {
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraints(mode, sensitivity) });
      streamRef.current = rawStream;
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;

      onRecordingStart?.();
      startKeepalive();

      // Create gain-boosted stream for encounter recording.
      // Falls back to raw stream if AudioContext chain fails (Safari compatibility).
      let recordStream = rawStream;
      try {
        const { boostedStream, ctx: boostCtx, gainNode, compressor } = createBoostedStream(rawStream, sensitivity);
        boostCtxRef.current = boostCtx;
        boostGainRef.current = gainNode;
        boostCompressorRef.current = compressor;
        recordStream = boostedStream;
      } catch (e) {
        console.warn('[Encounter] Boost chain failed, recording raw stream:', e);
      }

      // Record from boosted stream (or raw if boost failed).
      const recorderOptions: MediaRecorderOptions = { mimeType };
      if (mimeType.includes('webm')) {
        recorderOptions.audioBitsPerSecond = 128000; // 128kbps for speech clarity
      }
      console.log(`[Encounter] Recording from ${recordStream === rawStream ? 'RAW' : 'BOOSTED'} stream, mime=${mimeType}`);
      const recorder = new MediaRecorder(recordStream, recorderOptions);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stopAudioLevelViz(); stopKeepalive(); stopWebSpeech();
        if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
        if (boostCtxRef.current) { try { boostCtxRef.current.close(); } catch {} boostCtxRef.current = null; }
        analyserRef.current = null;
        rawStream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        // Signal recording stopped BEFORE transcription starts —
        // so the UI can show "Transcribing..." instead of the waveform
        onRecordingStopRef.current?.();

        const allChunks = chunksRef.current;
        console.log(`[Encounter] Recording stopped. ${allChunks.length} chunks collected.`);
        if (allChunks.length === 0) { setRecState('idle'); onProcessingRef.current?.(false); return; }

        setRecState('transcribing');
        onProcessingRef.current?.(true);

        try {
          const fullBlob = new Blob(allChunks, { type: mimeType });
          console.log(`[Encounter] Raw audio: ${(fullBlob.size / 1024).toFixed(1)}KB, type=${mimeType}`);

          if (fullBlob.size < 1000) {
            console.warn('[Encounter] Audio too small, skipping');
            setRecState('idle');
            onProcessingRef.current?.(false);
            onRecordingStopRef.current?.();
            return;
          }

          const sizeMB = (fullBlob.size / (1024 * 1024)).toFixed(2);
          const MAX_DIRECT = 4 * 1024 * 1024; // 4MB — Vercel serverless body limit
          const isLarge = fullBlob.size >= MAX_DIRECT;
          let transcript = '';
          let blobUrl = '';

          // Step 1: Backup to Blob (server-side upload, non-blocking for small files)
          if (encryptionKey && !isLarge) {
            // Fire-and-forget backup for small files
            try {
              encryptAudioBlob(fullBlob, encryptionKey).then(({ encrypted, ivBase64 }) => {
                const formData = new FormData();
                formData.append('audio', encrypted, `encounter-${Date.now()}.enc`);
                fetch('/api/backup-audio', { method: 'POST', body: formData })
                  .then(r => r.ok ? r.json() : null)
                  .then(data => {
                    if (data?.url) {
                      blobUrl = data.url;
                      console.log(`[Encounter] Blob backup: ${blobUrl}`);
                      onBlobBackup?.(blobUrl, ivBase64, mimeType);
                    }
                  }).catch(() => {});
              }).catch(() => {});
            } catch {}
          }

          // Step 2: For large files, encrypt + upload + server transcribe
          if (isLarge && encryptionKey) {
            try {
              console.log(`[Encounter] Large file (${sizeMB}MB) — encrypting for server transcription...`);
              const { encrypted, ivBase64 } = await encryptAudioBlob(fullBlob, encryptionKey);

              // Upload via server-side backup endpoint
              const formData = new FormData();
              formData.append('audio', encrypted, `encounter-${Date.now()}.enc`);
              const uploadRes = await fetch('/api/backup-audio', { method: 'POST', body: formData });

              if (uploadRes.ok) {
                const { url } = await uploadRes.json();
                blobUrl = url;
                onBlobBackup?.(blobUrl, ivBase64, mimeType);

                // Server-side transcription from blob
                const res = await fetch('/api/transcribe-server', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ blobUrl: url, iv: ivBase64, contentType: mimeType }),
                });
                if (res.ok) {
                  const data = await res.json();
                  transcript = data.text?.trim() || '';
                  console.log(`[Encounter] Server transcript: ${transcript.length} chars`);
                } else {
                  console.warn(`[Encounter] Server transcription failed, falling back to segments`);
                }
              }
            } catch (e) {
              console.warn('[Encounter] Large file server path failed:', e);
            }
          }

          // Step 3: Direct transcription (short files, or fallback for large files)
          if (!transcript) {
            const webEngine = getTranscribeWebAPI();
            console.log(`[Encounter] Direct transcription ${sizeMB}MB via ${webEngine}...`);

            if (isLarge && !blobUrl) {
              // Large file, no blob — split into segments
              const CHUNKS_PER_SEG = Math.floor(allChunks.length * MAX_DIRECT / fullBlob.size);
              const segments: Blob[] = [];
              for (let i = 0; i < allChunks.length; i += Math.max(1, CHUNKS_PER_SEG)) {
                segments.push(new Blob(allChunks.slice(i, i + CHUNKS_PER_SEG), { type: mimeType }));
              }
              const results: string[] = [];
              for (let idx = 0; idx < segments.length; idx++) {
                if (segments[idx].size < 500) continue;
                try {
                  const formData = new FormData();
                  formData.append('audio', segments[idx], `encounter-${idx}.${getFileExtension(mimeType)}`);
                  formData.append('mode', 'encounter');
                  const res = await fetch(getTranscribeEndpoint(webEngine), { method: 'POST', body: formData });
                  if (res.ok) {
                    const data = await res.json();
                    if (data.text?.trim()) results.push(data.text.trim());
                  }
                } catch {}
              }
              transcript = results.join('\n');
            } else {
              // Short file — single upload
              const formData = new FormData();
              formData.append('audio', fullBlob, `encounter.${getFileExtension(mimeType)}`);
              formData.append('mode', 'encounter');
              try {
                const res = await fetch(getTranscribeEndpoint(webEngine), { method: 'POST', body: formData });
                if (res.ok) {
                  const data = await res.json();
                  transcript = data.text?.trim() || '';
                  console.log(`[Encounter] Direct transcript: ${transcript.length} chars`);
                }
              } catch (e) {
                console.error('[Encounter] Direct transcription error:', e);
              }
            }
          }

          // Last resort: Web Speech
          if (!transcript && accumulatedTextRef.current?.trim()) {
            transcript = accumulatedTextRef.current.trim();
          }

          if (transcript) {
            console.log(`[Encounter] Final: ${transcript.length} chars`);
            onTranscript(transcript);
          } else {
            onTranscript('[Transcription failed — please try again or use Live Text mode]');
          }

          onProcessingRef.current?.(false);
        } catch (err: any) {
          onProcessingRef.current?.(false);
          console.error('[Encounter] Error:', err);
          if (accumulatedTextRef.current?.trim()) {
            onTranscript(accumulatedTextRef.current.trim());
          } else {
            onTranscript('[Transcription error — please try again]');
          }
        }
        onAudioLevelRef.current?.({ level: 0, lowFreq: 0, highFreq: 0, speakerHint: 'silent' });
        setRecState('idle');
      };

      // 10-second timeslice: gives Deepgram meaningful audio context per chunk
      // (1-second chunks were too small for reliable STT)
      recorder.start(10000);
      setRecState('recording');

      // Visualize the BOOSTED stream (not raw) so quiet voices are visible
      try {
        const vizCtx = new AudioContext();
        const vizSource = vizCtx.createMediaStreamSource(recordStream);
        const vizAnalyser = vizCtx.createAnalyser();
        vizAnalyser.fftSize = 2048;
        vizAnalyser.smoothingTimeConstant = 0.3;
        vizSource.connect(vizAnalyser);
        audioContextRef.current = vizCtx;
        analyserRef.current = vizAnalyser;
        startAudioLevelViz(vizAnalyser);
      } catch {}

      // Real-time WebSocket streaming for live text during encounter
      // Falls back to Web Speech if WS fails
      if (onInterimTranscript) {
        const webEngine = getTranscribeWebAPI();
        let streamOk = false;
        if (webEngine === 'elevenlabs') {
          streamOk = await startElevenLabsStream(rawStream);
        }
        if (!streamOk && webEngine !== 'elevenlabs') {
          streamOk = await startDeepgramStream(rawStream, true);
        }
        if (!streamOk) {
          // Fallback: Web Speech
          const SpeechRecognitionAPI = typeof window !== 'undefined'
            ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            : null;
          if (SpeechRecognitionAPI) {
            try {
              const recognition = new SpeechRecognitionAPI();
              recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
              let finalTranscript = '';
              recognition.onresult = (event: any) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                  if (event.results[i].isFinal) { finalTranscript += event.results[i][0].transcript + ' '; }
                  else { interim += event.results[i][0].transcript; }
                }
                const full = (finalTranscript + interim).trim();
                accumulatedTextRef.current = full;
                onInterimTranscript(full);
              };
              recognition.onerror = () => {};
              recognition.onend = () => { if (mediaRecorderRef.current?.state === 'recording') { try { recognition.start(); } catch {} } };
              recognition.start();
              recognitionRef.current = recognition;
            } catch {}
          }
        }
      }
    } catch {
      setRecState('error');
    }
  }, [onTranscript, onInterimTranscript, onRecordingStart, mode, startKeepalive, stopKeepalive, startAudioLevelViz, stopAudioLevelViz, stopWebSpeech, startDeepgramStream, startElevenLabsStream]);

  // =================================================================
  // POINTER HANDLERS
  // =================================================================

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (stateRef.current === 'transcribing') return;

    // --- Encounter mode: simple toggle ---
    if (mode === 'encounter') {
      if (stateRef.current === 'recording') {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          // Flush any pending audio data before stopping
          try { mediaRecorderRef.current.requestData(); } catch {}
          mediaRecorderRef.current.stop();
        }
      } else {
        startEncounterRecording();
      }
      return;
    }

    // --- Dictation mode ---

    // If already recording in toggle mode → stop
    if (stateRef.current === 'recording' && toggleModeRef.current) {
      toggleModeRef.current = false;
      stopNonMedicalize();
      return;
    }

    // Only start if idle/error
    if (stateRef.current !== 'idle' && stateRef.current !== 'error') return;

    pressActiveRef.current = true;
    toggleModeRef.current = false;
    isHoldingRef.current = false;
    setIsHolding(false);

    // Start recording + Web Speech immediately
    // (Web Speech output is suppressed when isHoldingRef becomes true)
    startDictationRecording();

    // Hold timer: if still pressing after 500ms → medicalize mode
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      if (pressActiveRef.current) {
        isHoldingRef.current = true;
        setIsHolding(true);
        // Stop Web Speech — we don't want any text during hold
        stopWebSpeech();
        // Clear any text that Web Speech may have shown in the brief window
        accumulatedTextRef.current = '';
        onInterimRef.current?.('');
        onMedicalizeStartRef.current?.();
      }
    }, 500);
  }, [mode, startEncounterRecording, startDictationRecording, stopNonMedicalize, stopWebSpeech]);

  const handlePointerUp = useCallback(() => {
    if (mode === 'encounter') return;

    pressActiveRef.current = false;
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }

    if (stateRef.current !== 'recording') return;

    if (isHoldingRef.current) {
      // Was holding → medicalize: stop and process full audio
      setIsHolding(false);
      isHoldingRef.current = false;
      stopMedicalizeHold();
    } else {
      // Short tap → non-medicalize toggle mode
      // Deepgram live text already running (started in startDictationRecording).
      // Recording continues — user clicks again to stop.
      toggleModeRef.current = true;
    }
  }, [mode, stopMedicalizeHold, flushSegmentForRefinement]);

  // --- File upload ---
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setRecState('transcribing');
    try {
      const formData = new FormData();
      formData.append('audio', file, file.name);
      formData.append('mode', mode);
      const res = await fetch(getTranscribeEndpoint(getTranscribeWebAPI()), { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Transcription failed');
      const { text } = await res.json();
      if (text?.trim()) onTranscript(text.trim());
      setRecState('idle');
    } catch {
      setRecState('error');
    }
  }, [onTranscript, mode]);

  // --- Render ---

  const recordingStyle = state === 'recording' ? (() => {
    const v = Math.pow(audioLevel, 0.6);
    const r = Math.round(40 + v * 10);
    const g = Math.round(140 + v * 80);
    const b = Math.round(220 - v * 40);
    const c = `${r}, ${g}, ${b}`;
    return {
      backgroundColor: `rgba(${c}, ${0.10 + v * 0.08})`,
      boxShadow: [
        `0 0 0 ${1 + v * 2.5}px rgba(${c}, ${0.22 + v * 0.23})`,
        `0 0 ${3 + v * 8}px rgba(${c}, ${0.06 + v * 0.14})`,
        `0 0 ${6 + v * 14}px rgba(${c}, ${0.02 + v * 0.06})`,
      ].join(', '),
      transform: `scale(${1 + v * 0.05})`,
      transition: 'all 0.12s cubic-bezier(0.4, 0, 0.2, 1)',
    };
  })() : undefined;

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={disabled || state === 'transcribing'}
        className={`p-2.5 min-w-[44px] min-h-[44px] rounded-full select-none touch-none flex items-center justify-center ${
          state === 'recording'
            ? 'text-red-500'
            : state === 'transcribing'
            ? 'text-blue-500 animate-pulse'
            : state === 'error'
            ? 'text-red-400'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
        } disabled:opacity-50`}
        style={recordingStyle}
        title={
          state === 'recording'
            ? (isHolding ? 'Release to medicalize' : 'Click to stop')
          : state === 'transcribing' ? 'Processing...'
          : mode === 'encounter'
            ? 'Click to record encounter'
            : 'Tap to dictate. Hold for AI medicalize.'
        }
      >
        {isHolding
          ? <Stethoscope className="w-5 h-5" />
          : <Mic className="w-5 h-5" />
        }
      </button>
      {showUpload && state === 'idle' && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-50"
            title="Upload audio file"
          >
            <Upload className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
        </>
      )}
    </span>
  );
}
