'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Upload, RotateCcw, Stethoscope } from 'lucide-react';
import { getSettings, saveSettings, getSpeechAPI, getTranscribeAPI, getTranscribeWebAPI, type TranscribeAPI } from '@/lib/settings';

/** Get the API endpoint URL for a given transcription engine */
function getTranscribeEndpoint(api: TranscribeAPI | string): string {
  if (api === 'deepgram') return '/api/transcribe-deepgram';
  if (api === 'wispr') return '/api/transcribe-wispr';
  return '/api/transcribe';
}

/** Convert spoken punctuation commands to actual punctuation (client-side mirror of server function) */
function convertSpokenPunctuation(text: string): string {
  return text
    .replace(/(?<!\bmenstrual)\s*\b(?:period|full stop)\b(?!\s+of)\s*/gi, '. ')
    .replace(/\s*\bcomma\b\s*/gi, ', ')
    .replace(/\s*\b(?:question mark)\b\s*/gi, '? ')
    .replace(/\s*\b(?:exclamation (?:mark|point))\b\s*/gi, '! ')
    .replace(/\s*\bcolon\b\s*/gi, ': ')
    .replace(/\s*\bsemicolon\b\s*/gi, '; ')
    .replace(/\s*\b(?:dash|hyphen)\b\s*/gi, ' — ')
    .replace(/\s*\b(?:new line|newline|next line)\b\s*/gi, '\n')
    .replace(/\s*\b(?:new paragraph|next paragraph)\b\s*/gi, '\n\n')
    .replace(/([.!?]\s+)([a-z])/g, (_, punct, letter) => punct + letter.toUpperCase())
    .replace(/ {2,}/g, ' ')
    .trim();
}

type RecorderState = 'idle' | 'recording' | 'transcribing' | 'error';

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onRecordingStart?: () => void;
  disabled?: boolean;
  /** 'encounter' = doctor-patient conversation, 'dictation' = physician charting (default) */
  mode?: 'encounter' | 'dictation';
  /** Show upload audio file button */
  showUpload?: boolean;
}

// Streaming dictation constants
const MIN_SEGMENT_MS = 1000;    // Don't flush segments shorter than 1s
const MAX_SEGMENT_MS = 12000;   // Force flush after 12s even if still speaking
const SILENCE_FLUSH_MS = 800;   // Flush after 0.8s of silence
const NOISE_FLOOR_MULTIPLIER = 2.5;
const MIN_SILENCE_THRESHOLD = 0.015;
const DEFAULT_SILENCE_THRESHOLD = 0.04;
const CALIBRATION_MS = 500;
const RMS_SMOOTHING = 0.3;
const CHECK_INTERVAL_MS = 80;

export function VoiceRecorder({
  onTranscript, onInterimTranscript, onRecordingStart,
  disabled, mode = 'dictation', showUpload,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pressStartRef = useRef(0);
  const toggleModeRef = useRef(false);

  // Streaming dictation refs
  const mimeTypeRef = useRef('');
  const accumulatedTextRef = useRef('');
  const segmentStartRef = useRef(0);
  const isFlushingRef = useRef(false);
  const pendingCountRef = useRef(0);
  const silenceCheckRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const stoppingRef = useRef(false);

  // Audio level visualization
  const [audioLevel, setAudioLevel] = useState(0);
  const animFrameRef = useRef<number | null>(null);

  // Undo last segment
  const segmentTextsRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  // Silent audio keepalive for iOS background/lock screen recording
  const keepaliveAudioRef = useRef<HTMLAudioElement | null>(null);

  // Medicalize toggle (default ON, persisted via fastDictation setting inverted)
  const [medicalize, setMedicalize] = useState(true);
  const medicalizeRef = useRef(true);

  // Stable callback refs for use inside streaming closures
  const onInterimRef = useRef(onInterimTranscript);
  onInterimRef.current = onInterimTranscript;
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Use streaming when dictation mode + caller wants interim updates
  const useStreaming = mode === 'dictation' && !!onInterimTranscript;

  // Load medicalize setting on mount
  useEffect(() => {
    const val = !getSettings().fastDictation;
    setMedicalize(val);
    medicalizeRef.current = val;
  }, []);

  // Toggle medicalize and persist
  const toggleMedicalize = useCallback(() => {
    setMedicalize(prev => {
      const next = !prev;
      medicalizeRef.current = next;
      const s = getSettings();
      saveSettings({ ...s, fastDictation: !next });
      return next;
    });
  }, []);

  // Clear error after 3 seconds
  useEffect(() => {
    if (state === 'error') {
      const t = setTimeout(() => setState('idle'), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceCheckRef.current) clearInterval(silenceCheckRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      if (keepaliveAudioRef.current) {
        keepaliveAudioRef.current.pause();
        keepaliveAudioRef.current = null;
      }
    };
  }, []);

  // --- iOS background keepalive via silent audio ---
  // iOS suspends JS when screen locks. Playing silent audio keeps the page alive.
  const startKeepalive = useCallback(() => {
    try {
      if (keepaliveAudioRef.current) return;
      // Generate a tiny silent WAV (44 bytes header + 1 second of silence at 8kHz mono 8-bit)
      const sampleRate = 8000;
      const duration = 1; // 1 second loop
      const numSamples = sampleRate * duration;
      const buffer = new ArrayBuffer(44 + numSamples);
      const view = new DataView(buffer);
      // WAV header
      const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + numSamples, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true); // chunk size
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, 1, true); // mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate, true); // byte rate
      view.setUint16(32, 1, true); // block align
      view.setUint16(34, 8, true); // bits per sample
      writeStr(36, 'data');
      view.setUint32(40, numSamples, true);
      // Fill with silence (128 = zero for 8-bit unsigned PCM)
      for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128);

      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.01; // near-silent but not zero (iOS may optimize away zero volume)
      audio.play().catch(() => {});
      keepaliveAudioRef.current = audio;
    } catch {}
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveAudioRef.current) {
      keepaliveAudioRef.current.pause();
      keepaliveAudioRef.current.src = '';
      keepaliveAudioRef.current = null;
    }
  }, []);

  const getMimeType = (): string => {
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    }
    return 'audio/webm';
  };

  const getFileExtension = (mime: string): string => {
    return mime.includes('mp4') ? 'mp4' : 'webm';
  };

  // --- Audio level visualization ---

  const startAudioLevelViz = useCallback((analyser: AnalyserNode) => {
    const dataArray = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sum / dataArray.length);
      // Normalize: typical speech RMS 0.01-0.15 → 0-1
      setAudioLevel(Math.min(1, rms / 0.12));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAudioLevelViz = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // --- Undo last segment ---

  const undoLastSegment = useCallback(() => {
    if (segmentTextsRef.current.length === 0) return;
    segmentTextsRef.current.pop();
    accumulatedTextRef.current = segmentTextsRef.current.join(' ');
    setCanUndo(segmentTextsRef.current.length > 0);
    onInterimRef.current?.(accumulatedTextRef.current);
  }, []);

  // --- Streaming dictation helpers ---

  /** Start a new MediaRecorder segment on the existing stream */
  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    segmentStartRef.current = Date.now();
  }, []);

  /** Check if new text is a duplicate/repetition of recent accumulated text */
  const isDuplicateSegment = useCallback((newText: string): boolean => {
    const accumulated = accumulatedTextRef.current;
    if (!accumulated) return false;

    const normalizedNew = newText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!normalizedNew || normalizedNew.length < 5) return true; // too short = noise

    // Check if the new text is substantially contained in the last part of accumulated text
    const accLower = accumulated.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const lastChunk = accLower.slice(-normalizedNew.length * 2); // look at last 2x the new text length

    // Exact or near-exact duplicate of tail
    if (lastChunk.includes(normalizedNew)) return true;

    // Check against last 2 segments for repetition
    const recentSegments = segmentTextsRef.current.slice(-2);
    for (const seg of recentSegments) {
      const normalizedSeg = seg.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      // If >80% similar to a recent segment, it's a repeat
      if (normalizedNew === normalizedSeg) return true;
      // Check if one contains the other
      if (normalizedNew.length > 10 && normalizedSeg.length > 10) {
        if (normalizedSeg.includes(normalizedNew) || normalizedNew.includes(normalizedSeg)) return true;
      }
    }

    return false;
  }, []);

  /** Send a blob to transcription API and accumulate the result (with retry) */
  const processSegmentBlob = useCallback(async (blob: Blob) => {
    pendingCountRef.current++;
    try {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const formData = new FormData();
          formData.append('audio', blob, `segment.${getFileExtension(mimeTypeRef.current)}`);
          formData.append('mode', 'dictation');
          if (accumulatedTextRef.current) {
            formData.append('context', accumulatedTextRef.current);
          }
          if (!medicalizeRef.current) {
            formData.append('skipMedicalize', 'true');
          }
          // Choose transcription API
          const transcribeEngine = getTranscribeAPI();
          const useExternalSTT = transcribeEngine === 'deepgram' || transcribeEngine === 'wispr';
          let res: Response;
          if (useExternalSTT) {
            // External STT (Deepgram/Wispr) for transcription
            const dgRes = await fetch(getTranscribeEndpoint(transcribeEngine), { method: 'POST', body: formData });
            if (dgRes.ok && medicalizeRef.current) {
              const { text: dgText } = await dgRes.json();
              if (dgText?.trim()) {
                // Then Claude for medicalization
                const medRes = await fetch('/api/medicalize', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: dgText.trim(), context: accumulatedTextRef.current || '' }),
                });
                res = medRes.ok ? medRes : new Response(JSON.stringify({ text: dgText.trim() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              } else {
                res = dgRes;
              }
            } else {
              res = dgRes;
            }
          } else {
            // Whisper (+Claude medicalize built-in)
            res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          }
          if (res.ok) {
            const { text } = await res.json();
            if (text?.trim()) {
              const trimmed = text.trim();
              // Skip if Whisper hallucinated a repeat of recent text
              if (isDuplicateSegment(trimmed)) {
                return;
              }
              accumulatedTextRef.current = accumulatedTextRef.current
                ? `${accumulatedTextRef.current} ${trimmed}`
                : trimmed;
              segmentTextsRef.current.push(trimmed);
              setCanUndo(true);
              onInterimRef.current?.(accumulatedTextRef.current);
            }
          }
          return; // success — exit retry loop
        } catch (err) {
          lastError = err;
          if (attempt === 0) await new Promise(r => setTimeout(r, 500));
        }
      }
      console.error('Segment transcription error after retries:', lastError);
    } finally {
      pendingCountRef.current--;
    }
  }, [isDuplicateSegment]);

  /** Stop current recorder, get its blob, start a new segment, process the blob */
  const flushSegment = useCallback(async () => {
    if (isFlushingRef.current || stoppingRef.current) return;
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    if (Date.now() - segmentStartRef.current < MIN_SEGMENT_MS) return;

    isFlushingRef.current = true;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
      };
      recorder.stop();
    });

    // Start new segment immediately (mic stream is still open)
    if (!stoppingRef.current) {
      startSegment();
    }
    isFlushingRef.current = false;

    // Process blob in background (skip tiny blobs — likely just silence)
    if (blob.size > 2000) {
      processSegmentBlob(blob);
    }
  }, [startSegment, processSegmentBlob]);

  /** Adaptive silence detection using Web Audio API */
  const startSilenceDetection = useCallback((stream: MediaStream) => {
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      let silentSince: number | null = null;
      let smoothedRms = 0;
      let silenceThreshold = DEFAULT_SILENCE_THRESHOLD;
      const dataArray = new Float32Array(analyser.fftSize);
      const startTime = Date.now();
      const calibrationSamples: number[] = [];

      silenceCheckRef.current = setInterval(() => {
        if (!analyserRef.current || stoppingRef.current) return;
        analyserRef.current.getFloatTimeDomainData(dataArray);

        // Calculate raw RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rawRms = Math.sqrt(sum / dataArray.length);

        // Exponential moving average
        smoothedRms = smoothedRms === 0
          ? rawRms
          : RMS_SMOOTHING * rawRms + (1 - RMS_SMOOTHING) * smoothedRms;

        // Calibration phase
        const elapsed = Date.now() - startTime;
        if (elapsed < CALIBRATION_MS) {
          calibrationSamples.push(rawRms);
          return;
        }

        // Compute adaptive threshold after calibration
        if (calibrationSamples.length > 0) {
          calibrationSamples.sort((a, b) => a - b);
          const median = calibrationSamples[Math.floor(calibrationSamples.length / 2)];
          silenceThreshold = Math.max(MIN_SILENCE_THRESHOLD, median * NOISE_FLOOR_MULTIPLIER);
          calibrationSamples.length = 0;
        }

        const segmentAge = Date.now() - segmentStartRef.current;

        if (smoothedRms < silenceThreshold) {
          if (!silentSince) silentSince = Date.now();
          const silenceDuration = Date.now() - silentSince;
          if (silenceDuration >= SILENCE_FLUSH_MS && segmentAge >= MIN_SEGMENT_MS) {
            silentSince = null;
            flushSegment();
          }
        } else {
          silentSince = null;
        }

        // Force flush if segment is too long
        if (segmentAge >= MAX_SEGMENT_MS) {
          flushSegment();
        }
      }, CHECK_INTERVAL_MS);
    } catch {
      // Fallback: timer-based flushing
      silenceCheckRef.current = setInterval(() => {
        if (stoppingRef.current) return;
        if (Date.now() - segmentStartRef.current >= MAX_SEGMENT_MS) {
          flushSegment();
        }
      }, 1000);
    }
  }, [flushSegment]);

  // --- Main recording controls ---

  const startRecording = useCallback(async () => {
    try {
      // Reload medicalize setting each recording
      const val = !getSettings().fastDictation;
      medicalizeRef.current = val;
      setMedicalize(val);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;

      onRecordingStart?.();
      startKeepalive(); // Keep iOS alive when screen locks

      if (useStreaming) {
        // --- Streaming dictation mode ---
        accumulatedTextRef.current = '';
        segmentTextsRef.current = [];
        setCanUndo(false);
        stoppingRef.current = false;

        setState('recording');

        if (!medicalizeRef.current) {
          // --- Fast mode: Web Speech API instant display ---
          // When Deepgram is selected, also record audio for cleanup on stop
          const speechEng = getSpeechAPI();
          const useSttFast = speechEng === 'deepgram' || speechEng === 'wispr';

          // Web Speech API for instant text (always, regardless of engine choice)
          const SpeechAPI = typeof window !== 'undefined'
            ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            : null;
          if (SpeechAPI) {
            try {
              const recognition = new SpeechAPI();
              recognition.continuous = true;
              recognition.interimResults = true;
              recognition.lang = 'en-US';
              let finalTranscript = '';
              recognition.onresult = (event: any) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                  if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                  } else {
                    interim += event.results[i][0].transcript;
                  }
                }
                const raw = (finalTranscript + interim).trim();
                const full = convertSpokenPunctuation(raw);
                accumulatedTextRef.current = full;
                onInterimRef.current?.(full);
              };
              recognition.onerror = () => {};
              recognition.onend = () => {
                if (!stoppingRef.current && streamRef.current) {
                  try { recognition.start(); } catch {}
                }
              };
              recognition.start();
              recognitionRef.current = recognition;
            } catch {}
          }

          // If Deepgram selected, also record full audio in background for cleanup on stop
          if (useSttFast) {
            const bgRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = bgRecorder;
            chunksRef.current = [];
            bgRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            bgRecorder.start();
          }

          // Audio level visualization
          try {
            const vizCtx = new AudioContext();
            const vizSource = vizCtx.createMediaStreamSource(stream);
            const vizAnalyser = vizCtx.createAnalyser();
            vizAnalyser.fftSize = 2048;
            vizSource.connect(vizAnalyser);
            audioContextRef.current = vizCtx;
            analyserRef.current = vizAnalyser;
            startAudioLevelViz(vizAnalyser);
          } catch {}
        } else {
          // --- Medicalize mode: Web Speech for instant display + transcription pipeline for quality ---

          // Web Speech API for instant interim text
          const SpeechAPI = typeof window !== 'undefined'
            ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            : null;
          if (SpeechAPI) {
            try {
              const recognition = new SpeechAPI();
              recognition.continuous = true;
              recognition.interimResults = true;
              recognition.lang = 'en-US';
              let finalTranscript = '';
              recognition.onresult = (event: any) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                  if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                  } else {
                    interim += event.results[i][0].transcript;
                  }
                }
                const raw = (finalTranscript + interim).trim();
                const speechText = convertSpokenPunctuation(raw);
                // Only show Web Speech text if Whisper+Claude hasn't produced anything yet
                if (!accumulatedTextRef.current || accumulatedTextRef.current.length < speechText.length * 0.5) {
                  onInterimRef.current?.(speechText);
                }
              };
              recognition.onerror = () => {};
              recognition.onend = () => {
                if (!stoppingRef.current && streamRef.current) {
                  try { recognition.start(); } catch {}
                }
              };
              recognition.start();
              recognitionRef.current = recognition;
            } catch {}
          }

          // Whisper+Claude segment pipeline (runs in parallel, replaces Web Speech text as segments complete)
          startSegment();
          startSilenceDetection(stream);

          setTimeout(() => {
            if (analyserRef.current) startAudioLevelViz(analyserRef.current);
          }, 50);
        }
      } else {
        // --- Single-shot mode (encounter recording) ---
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          // Stop audio viz
          stopAudioLevelViz();
          if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
          analyserRef.current = null;

          stream.getTracks().forEach(t => t.stop());
          streamRef.current = null;

          if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch {}
            recognitionRef.current = null;
          }

          const blob = new Blob(chunksRef.current, { type: mimeType });
          if (blob.size === 0) { setState('idle'); return; }

          setState('transcribing');
          try {
            const formData = new FormData();
            formData.append('audio', blob, `recording.${getFileExtension(mimeType)}`);
            formData.append('mode', mode);
            if (!medicalizeRef.current) formData.append('skipMedicalize', 'true');

            // Encounter recording uses the web/phone transcribe engine
            const webEngine = getTranscribeWebAPI();
            const useExternalSTT = webEngine === 'deepgram' || webEngine === 'wispr';
            let endpoint = getTranscribeEndpoint(webEngine);
            let res = await fetch(endpoint, { method: 'POST', body: formData });

            // If Deepgram succeeded and medicalize is on, run Claude medicalize
            if (useExternalSTT && res.ok && medicalizeRef.current) {
              const { text: dgText } = await res.json();
              if (dgText?.trim()) {
                const medRes = await fetch('/api/medicalize', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: dgText.trim() }),
                });
                if (medRes.ok) {
                  const { text } = await medRes.json();
                  if (text?.trim()) onTranscript(text.trim());
                } else {
                  onTranscript(dgText.trim());
                }
              }
            } else if (res.ok) {
              const { text } = await res.json();
              if (text?.trim()) onTranscript(text.trim());
            } else {
              const err = await res.json().catch(() => ({ error: 'Transcription failed' }));
              throw new Error(err.error || `Failed (${res.status})`);
            }
          } catch (err: any) {
            console.error('Transcription error:', err);
          }
          setState('idle');
        };

        recorder.start();
        setState('recording');

        // Audio level visualization for encounter mode
        try {
          const vizCtx = new AudioContext();
          const vizSource = vizCtx.createMediaStreamSource(stream);
          const vizAnalyser = vizCtx.createAnalyser();
          vizAnalyser.fftSize = 2048;
          vizSource.connect(vizAnalyser);
          audioContextRef.current = vizCtx;
          analyserRef.current = vizAnalyser;
          startAudioLevelViz(vizAnalyser);
        } catch {}

        // Web Speech API for live text in encounter mode
        const SpeechRecognitionAPI = typeof window !== 'undefined'
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;
        if (SpeechRecognitionAPI && onInterimTranscript) {
          try {
            const recognition = new SpeechRecognitionAPI();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            let finalTranscript = '';
            recognition.onresult = (event: any) => {
              let interim = '';
              for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                  finalTranscript += event.results[i][0].transcript + ' ';
                } else {
                  interim += event.results[i][0].transcript;
                }
              }
              onInterimTranscript((finalTranscript + interim).trim());
            };
            recognition.onerror = () => {};
            recognition.onend = () => {
              if (mediaRecorderRef.current?.state === 'recording') {
                try { recognition.start(); } catch {}
              }
            };
            recognition.start();
            recognitionRef.current = recognition;
          } catch {}
        }
      }
    } catch (err: any) {
      setState('error');
    }
  }, [onTranscript, onInterimTranscript, onRecordingStart, mode, useStreaming, startSegment, startSilenceDetection, startAudioLevelViz, stopAudioLevelViz, startKeepalive]);

  const stopRecording = useCallback(async () => {
    stopKeepalive(); // Stop iOS background keepalive

    // Stop Web Speech API (encounter mode)
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    if (useStreaming) {
      // --- Streaming stop ---
      stoppingRef.current = true;

      // Stop audio visualization
      stopAudioLevelViz();

      // Stop silence detection
      if (silenceCheckRef.current) { clearInterval(silenceCheckRef.current); silenceCheckRef.current = null; }
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
      analyserRef.current = null;

      if (!medicalizeRef.current) {
        // --- Fast mode stop ---
        const speechEngine = getSpeechAPI();
        const useSttCleanup = speechEngine === 'deepgram' || speechEngine === 'wispr';

        if (useSttCleanup) {
          // Snapshot what Web Speech produced before stopping
          const webSpeechText = accumulatedTextRef.current || '';

          setState('transcribing');

          // Stop background recorder
          const bgRecorder = mediaRecorderRef.current;
          let audioBlob: Blob | null = null;
          if (bgRecorder && bgRecorder.state !== 'inactive') {
            audioBlob = await new Promise<Blob>((resolve) => {
              bgRecorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
              bgRecorder.stop();
            });
          }

          streamRef.current?.getTracks().forEach(t => t.stop());
          streamRef.current = null;

          // Only run Deepgram cleanup if the user hasn't manually cleared/edited the text
          // (if field is now empty or much shorter than what Web Speech produced, user deleted it)
          if (audioBlob && audioBlob.size > 2000 && webSpeechText.length > 5) {
            try {
              const formData = new FormData();
              formData.append('audio', audioBlob, `recording.${getFileExtension(mimeTypeRef.current)}`);
              formData.append('mode', 'dictation');
              const res = await fetch(getTranscribeEndpoint(speechEngine), { method: 'POST', body: formData });
              if (res.ok) {
                const { text } = await res.json();
                if (text?.trim() && text.trim().length > 5) {
                  onInterimRef.current?.(text.trim());
                }
              }
            } catch {}
          }

          accumulatedTextRef.current = '';
          segmentTextsRef.current = [];
          setCanUndo(false);
          setState('idle');
        } else {
          // Web Speech only — text is final
          streamRef.current?.getTracks().forEach(t => t.stop());
          streamRef.current = null;

          accumulatedTextRef.current = '';
          segmentTextsRef.current = [];
          setCanUndo(false);
          setState('idle');
        }
      } else {
        // --- Segment pipeline stop (Medicalize OR Deepgram fast) ---
        setState('transcribing');

        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state === 'recording') {
          const blob = await new Promise<Blob>((resolve) => {
            recorder.onstop = () => {
              resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
            };
            recorder.stop();
          });

          if (blob.size > 0) {
            await processSegmentBlob(blob);
          }
        }

        // Release microphone
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        // Wait for any in-flight segment transcriptions
        while (pendingCountRef.current > 0) {
          await new Promise(r => setTimeout(r, 100));
        }

        // Final delivery: onInterimTranscript already has the full text in the field,
        // so only call onTranscript if there was NO interim handler (non-streaming callers).
        if (accumulatedTextRef.current.trim() && !onInterimRef.current) {
          onTranscriptRef.current(accumulatedTextRef.current.trim());
        }
        accumulatedTextRef.current = '';
        segmentTextsRef.current = [];
        setCanUndo(false);
        setState('idle');
      }
    } else {
      // --- Single-shot stop ---
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
  }, [useStreaming, processSegmentBlob, stopAudioLevelViz, stopKeepalive]);

  // --- Click-to-toggle / hold-to-talk ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (state === 'transcribing') return;

    if (state === 'recording' && toggleModeRef.current) {
      stopRecording();
      return;
    }
    if (state === 'idle' || state === 'error') {
      pressStartRef.current = Date.now();
      toggleModeRef.current = false;
      startRecording();
    }
  }, [state, startRecording, stopRecording]);

  const handlePointerUp = useCallback(() => {
    if (state === 'recording' && !toggleModeRef.current) {
      if (Date.now() - pressStartRef.current > 400) {
        stopRecording();
      } else {
        toggleModeRef.current = true;
      }
    }
  }, [state, stopRecording]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setState('transcribing');
    try {
      const formData = new FormData();
      formData.append('audio', file, file.name);
      formData.append('mode', mode);
      if (!medicalizeRef.current) formData.append('skipMedicalize', 'true');
      const endpoint = getTranscribeEndpoint(getTranscribeWebAPI());
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Transcription failed' }));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      const { text } = await res.json();
      if (text?.trim()) onTranscript(text.trim());
      setState('idle');
    } catch (err: any) {
      setState('error');
    }
  }, [onTranscript, mode]);

  // Dynamic recording style: blue/green glow that intensifies with voice, red mic icon
  const recordingStyle = state === 'recording' ? (() => {
    const l = audioLevel;
    // Power curve: boost quiet-speech visibility while keeping loud speech controlled
    const v = Math.pow(l, 0.6);
    // Blue → teal/green shift with voice level
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
      {/* Mic + medicalize as a single visual unit */}
      <span className="inline-flex items-center">
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
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
            state === 'recording' ? 'Click to stop'
            : state === 'transcribing' ? 'Processing...'
            : 'Click to dictate, or hold to talk'
          }
        >
          <Mic className="w-5 h-5" />
        </button>
        {mode === 'dictation' && state !== 'transcribing' && (
          <button
            type="button"
            onClick={toggleMedicalize}
            className={`-ml-1 p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full transition-colors ${
              medicalize
                ? 'text-blue-500/40 dark:text-blue-400/40 hover:text-blue-500 dark:hover:text-blue-400'
                : 'text-[var(--text-muted)] opacity-25 hover:opacity-50'
            }`}
            title={medicalize ? 'Medicalize Dictation ON' : 'Medicalize Dictation OFF'}
          >
            <Stethoscope className="w-3 h-3" />
          </button>
        )}
      </span>
      {canUndo && state === 'recording' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); undoLastSegment(); }}
          className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-full transition-colors"
          title="Undo last segment"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
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
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </>
      )}
    </span>
  );
}
