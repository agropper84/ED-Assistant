'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Upload, RotateCcw, Stethoscope } from 'lucide-react';
import { getSettings, saveSettings } from '@/lib/settings';

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
    };
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

  /** Send a blob to /api/transcribe and accumulate the result (with retry) */
  const processSegmentBlob = useCallback(async (blob: Blob) => {
    pendingCountRef.current++;
    try {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // Recreate FormData on each attempt (fetch consumes the body)
          const formData = new FormData();
          formData.append('audio', blob, `segment.${getFileExtension(mimeTypeRef.current)}`);
          formData.append('mode', 'dictation');
          // Context carry-forward
          if (accumulatedTextRef.current) {
            formData.append('context', accumulatedTextRef.current);
          }
          // Skip medicalization when toggle is off
          if (!medicalizeRef.current) {
            formData.append('skipMedicalize', 'true');
          }
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          if (res.ok) {
            const { text } = await res.json();
            if (text?.trim()) {
              const trimmed = text.trim();
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
  }, []);

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
    if (blob.size > 1000) {
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

      if (useStreaming) {
        // --- Streaming dictation mode ---
        accumulatedTextRef.current = '';
        segmentTextsRef.current = [];
        setCanUndo(false);
        stoppingRef.current = false;
        startSegment();

        setState('recording');

        // Start adaptive silence detection (also sets up analyserRef)
        startSilenceDetection(stream);

        // Start audio level visualization using the analyser from silence detection
        setTimeout(() => {
          if (analyserRef.current) startAudioLevelViz(analyserRef.current);
        }, 50);
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
            const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: 'Transcription failed' }));
              throw new Error(err.error || `Failed (${res.status})`);
            }
            const { text } = await res.json();
            if (text?.trim()) onTranscript(text.trim());
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
  }, [onTranscript, onInterimTranscript, onRecordingStart, mode, useStreaming, startSegment, startSilenceDetection, startAudioLevelViz, stopAudioLevelViz]);

  const stopRecording = useCallback(async () => {
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

      setState('transcribing');

      // Stop current recorder and process final segment
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
      // With interim updates, the field is already correct — calling onTranscript would duplicate.
      if (accumulatedTextRef.current.trim() && !onInterimRef.current) {
        onTranscriptRef.current(accumulatedTextRef.current.trim());
      }
      accumulatedTextRef.current = '';
      segmentTextsRef.current = [];
      setCanUndo(false);
      setState('idle');
    } else {
      // --- Single-shot stop ---
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
  }, [useStreaming, processSegmentBlob, stopAudioLevelViz]);

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
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
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
    <span className="inline-flex items-center gap-0.5">
      {/* Mic + medicalize as a single visual unit */}
      <span className="inline-flex items-center">
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          disabled={disabled || state === 'transcribing'}
          className={`p-1 rounded-full select-none touch-none flex items-center justify-center ${
            state === 'recording'
              ? 'text-red-500' /* red mic icon, glow via inline style */
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
          <Mic className="w-3.5 h-3.5" />
        </button>
        {mode === 'dictation' && state !== 'transcribing' && (
          <button
            type="button"
            onClick={toggleMedicalize}
            className={`-ml-0.5 transition-colors ${
              medicalize
                ? 'text-blue-500/40 dark:text-blue-400/40 hover:text-blue-500 dark:hover:text-blue-400'
                : 'text-[var(--text-muted)] opacity-25 hover:opacity-50'
            }`}
            title={medicalize ? 'Medicalize Dictation ON' : 'Medicalize Dictation OFF'}
          >
            <Stethoscope className="w-2.5 h-2.5" />
          </button>
        )}
      </span>
      {canUndo && state === 'recording' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); undoLastSegment(); }}
          className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded transition-colors"
          title="Undo last segment"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
      {showUpload && state === 'idle' && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-50"
            title="Upload audio file"
          >
            <Upload className="w-3 h-3" />
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
