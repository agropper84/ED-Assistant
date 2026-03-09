'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Loader2, Upload } from 'lucide-react';

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
const MIN_SEGMENT_MS = 1500;    // Don't flush segments shorter than 1.5s
const MAX_SEGMENT_MS = 15000;   // Force flush after 15s even if still speaking
const SILENCE_FLUSH_MS = 1200;  // Flush after 1.2s of silence
const NOISE_FLOOR_MULTIPLIER = 2.5;
const MIN_SILENCE_THRESHOLD = 0.015;
const DEFAULT_SILENCE_THRESHOLD = 0.04;
const CALIBRATION_MS = 800;
const RMS_SMOOTHING = 0.3;
const CHECK_INTERVAL_MS = 100;

export function VoiceRecorder({
  onTranscript, onInterimTranscript, onRecordingStart,
  disabled, mode = 'dictation', showUpload,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [segmentsProcessing, setSegmentsProcessing] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
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

  // Stable callback refs for use inside streaming closures
  const onInterimRef = useRef(onInterimTranscript);
  onInterimRef.current = onInterimTranscript;
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Use streaming when dictation mode + caller wants interim updates
  const useStreaming = mode === 'dictation' && !!onInterimTranscript;

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
      if (timerRef.current) clearInterval(timerRef.current);
      if (silenceCheckRef.current) clearInterval(silenceCheckRef.current);
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

  /** Send a blob to /api/transcribe and accumulate the result */
  const processSegmentBlob = useCallback(async (blob: Blob) => {
    pendingCountRef.current++;
    setSegmentsProcessing(c => c + 1);
    try {
      const formData = new FormData();
      formData.append('audio', blob, `segment.${getFileExtension(mimeTypeRef.current)}`);
      formData.append('mode', 'dictation');
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (res.ok) {
        const { text } = await res.json();
        if (text?.trim()) {
          accumulatedTextRef.current = accumulatedTextRef.current
            ? `${accumulatedTextRef.current}\n${text.trim()}`
            : text.trim();
          onInterimRef.current?.(accumulatedTextRef.current);
        }
      }
    } catch (err) {
      console.error('Segment transcription error:', err);
    } finally {
      pendingCountRef.current--;
      setSegmentsProcessing(c => Math.max(0, c - 1));
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

    // Process blob in background
    if (blob.size > 0) {
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;

      onRecordingStart?.();

      if (useStreaming) {
        // --- Streaming dictation mode ---
        accumulatedTextRef.current = '';
        stoppingRef.current = false;
        startSegment();

        setElapsed(0);
        setState('recording');
        timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);

        // Start adaptive silence detection
        startSilenceDetection(stream);
      } else {
        // --- Single-shot mode (encounter recording) ---
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          streamRef.current = null;
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

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
        setElapsed(0);
        setState('recording');
        timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);

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
  }, [onTranscript, onInterimTranscript, onRecordingStart, mode, useStreaming, startSegment, startSilenceDetection]);

  const stopRecording = useCallback(async () => {
    // Stop Web Speech API (encounter mode)
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    if (useStreaming) {
      // --- Streaming stop ---
      stoppingRef.current = true;

      // Stop silence detection
      if (silenceCheckRef.current) { clearInterval(silenceCheckRef.current); silenceCheckRef.current = null; }
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
      analyserRef.current = null;

      // Stop timer
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

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

      // Deliver complete accumulated text
      if (accumulatedTextRef.current.trim()) {
        onTranscriptRef.current(accumulatedTextRef.current.trim());
      }
      accumulatedTextRef.current = '';
      setState('idle');
    } else {
      // --- Single-shot stop ---
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
  }, [useStreaming, processSegmentBlob]);

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

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        disabled={disabled || state === 'transcribing'}
        className={`p-1.5 rounded-lg transition-all select-none touch-none ${
          state === 'recording'
            ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
            : state === 'transcribing'
            ? 'text-blue-500'
            : state === 'error'
            ? 'text-red-400'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
        } disabled:opacity-50`}
        title={
          state === 'recording' ? 'Click to stop'
          : state === 'transcribing' ? 'Processing...'
          : 'Click to dictate, or hold to talk'
        }
      >
        {state === 'transcribing' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : state === 'recording' ? (
          <span className="relative flex items-center gap-1">
            <span className="relative">
              <Mic className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
              </span>
            </span>
            <span className="text-[10px] font-mono tabular-nums leading-none">{formatTime(elapsed)}</span>
          </span>
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>
      {segmentsProcessing > 0 && (
        <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
      )}
      {showUpload && state === 'idle' && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50"
            title="Upload audio file"
          >
            <Upload className="w-3.5 h-3.5" />
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
