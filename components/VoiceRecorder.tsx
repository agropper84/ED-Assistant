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

export function VoiceRecorder({
  onTranscript, onInterimTranscript, onRecordingStart,
  disabled, mode = 'dictation', showUpload,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pressStartRef = useRef(0);
  const toggleModeRef = useRef(false);

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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getMimeType();

      onRecordingStart?.();

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

        // Stop Web Speech API
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

      // Web Speech API for live text display
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
    } catch (err: any) {
      setState('error');
    }
  }, [onTranscript, onInterimTranscript, onRecordingStart, mode]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // --- Click-to-toggle / hold-to-talk ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); // Prevent textarea focus loss
    if (state === 'transcribing') return;

    if (state === 'recording' && toggleModeRef.current) {
      // Second click in toggle mode → stop
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
        // Hold release → stop
        stopRecording();
      } else {
        // Quick tap → enter toggle mode (stay recording)
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
