'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

type RecorderState = 'idle' | 'recording' | 'transcribing' | 'error';

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onTranscript, disabled }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const getMimeType = (): string => {
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    }
    return 'audio/webm'; // fallback
  };

  const getFileExtension = (mime: string): string => {
    if (mime.includes('mp4')) return 'mp4';
    return 'webm';
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Release microphone
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        // Stop timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setErrorMsg('No audio captured');
          setState('error');
          return;
        }

        setState('transcribing');

        try {
          const formData = new FormData();
          formData.append('audio', blob, `recording.${getFileExtension(mimeType)}`);

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Transcription failed' }));
            throw new Error(err.error || `Failed (${res.status})`);
          }

          const { text } = await res.json();
          if (text?.trim()) {
            onTranscript(text.trim());
          }
          setState('idle');
        } catch (err: any) {
          setErrorMsg(err.message || 'Transcription failed');
          setState('error');
        }
      };

      recorder.start();
      setElapsed(0);
      setState('recording');
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch (err: any) {
      // Mic permission denied or not available
      setErrorMsg(err.name === 'NotAllowedError' ? 'Microphone access denied' : 'Microphone unavailable');
      setState('error');
    }
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600">
        {errorMsg}
      </span>
    );
  }

  if (state === 'transcribing') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Transcribing...
      </span>
    );
  }

  if (state === 'recording') {
    return (
      <button
        type="button"
        onClick={stopRecording}
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
        </span>
        {formatTime(elapsed)}
        <Square className="w-3 h-3" />
      </button>
    );
  }

  // idle
  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Record audio"
    >
      <Mic className="w-3.5 h-3.5" />
      Record
    </button>
  );
}
