'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { getTranscribeWebAPI, getTranscribeAPI, type TranscribeAPI } from '@/lib/settings';

function getTranscribeEndpoint(api: TranscribeAPI | string): string {
  if (api === 'deepgram') return '/api/transcribe-deepgram';
  if (api === 'wispr') return '/api/transcribe-wispr';
  return '/api/transcribe';
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  sampleRate: { ideal: 48000 },
  channelCount: { ideal: 1 },
  echoCancellation: { ideal: false },
  noiseSuppression: { ideal: false },
  autoGainControl: { ideal: true },
};

type QuickRecordState = 'idle' | 'recording-encounter' | 'recording-dictation' | 'transcribing';

interface QuickRecordButtonProps {
  patient: { rowIndex: number; sheetName: string; name: string };
  onRecordingComplete: () => void;
  onRecordingStateChange: (recording: boolean) => void;
}

export function QuickRecordButton({ patient, onRecordingComplete, onRecordingStateChange }: QuickRecordButtonProps) {
  const [state, setState] = useState<QuickRecordState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);

  const stateRef = useRef<QuickRecordState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pressStartRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vizFrameRef = useRef<number | null>(null);
  const mimeTypeRef = useRef('audio/webm');

  const setRecState = (s: QuickRecordState) => {
    stateRef.current = s;
    setState(s);
    const isRecording = s === 'recording-encounter' || s === 'recording-dictation' || s === 'transcribing';
    onRecordingStateChange(isRecording);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (audioContextRef.current) try { audioContextRef.current.close(); } catch {}
      if (vizFrameRef.current) cancelAnimationFrame(vizFrameRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  const getMimeType = (): string => {
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    }
    return 'audio/webm';
  };

  const getFileExtension = (mime: string): string => mime.includes('mp4') ? 'mp4' : 'webm';

  const startAudioViz = (analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setAudioLevel(Math.min(avg / 128, 1));
      vizFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stopAudioViz = () => {
    if (vizFrameRef.current) { cancelAnimationFrame(vizFrameRef.current); vizFrameRef.current = null; }
    setAudioLevel(0);
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      streamRef.current = stream;
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start();

      // Audio level viz
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        startAudioViz(analyser);
      } catch {}
    } catch {
      setRecState('idle');
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob());
        return;
      }
      recorder.onstop = () => {
        stopAudioViz();
        if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  const transcribeAndSubmit = useCallback(async (blob: Blob, mode: 'encounter' | 'dictation') => {
    if (blob.size < 2000) { setRecState('idle'); return; }

    setRecState('transcribing');
    try {
      const formData = new FormData();
      formData.append('audio', blob, `recording.${getFileExtension(mimeTypeRef.current)}`);
      formData.append('mode', mode);

      const engine = mode === 'encounter' ? getTranscribeWebAPI() : getTranscribeAPI();
      const useExternal = engine === 'deepgram' || engine === 'wispr';
      const res = await fetch(getTranscribeEndpoint(engine), { method: 'POST', body: formData });

      let finalText = '';
      if (res.ok) {
        const { text } = await res.json();
        if (text?.trim()) {
          if (mode === 'encounter' && useExternal) {
            // Encounter: medicalize the transcript
            const medRes = await fetch('/api/medicalize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: text.trim(), mode: 'encounter' }),
            });
            if (medRes.ok) {
              const { text: medText } = await medRes.json();
              finalText = medText?.trim() || text.trim();
            } else {
              finalText = text.trim();
            }
          } else {
            finalText = text.trim();
          }
        }
      }

      if (finalText) {
        // Auto-submit
        const field = mode === 'encounter' ? 'transcript' : 'encounterNotes';
        const title = mode === 'encounter' ? 'Encounter Recording' : 'Dictation';
        await fetch(`/api/patients/${patient.rowIndex}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field,
            content: finalText,
            sheetName: patient.sheetName,
            patientName: patient.name,
            title,
          }),
        });
        onRecordingComplete();
      }
    } catch (err) {
      console.error('Quick record error:', err);
    }
    setRecState('idle');
  }, [patient, onRecordingComplete]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If recording encounter, stop it
    if (stateRef.current === 'recording-encounter') {
      stopRecording().then(blob => transcribeAndSubmit(blob, 'encounter'));
      return;
    }

    if (stateRef.current !== 'idle') return;

    pressStartRef.current = Date.now();
    startRecording();

    // Hold timer: if still pressing after 500ms → dictation mode
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'idle' || stateRef.current === 'recording-encounter') {
        // The recording already started; switch to dictation state
        setRecState('recording-dictation');
      }
    }, 500);
  }, [startRecording, stopRecording, transcribeAndSubmit]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }

    if (stateRef.current === 'recording-dictation') {
      // Was holding → stop and process as dictation
      stopRecording().then(blob => transcribeAndSubmit(blob, 'dictation'));
    } else if (stateRef.current === 'idle' && Date.now() - pressStartRef.current < 500) {
      // Short tap → encounter toggle mode (recording continues)
      setRecState('recording-encounter');
    }
  }, [stopRecording, transcribeAndSubmit]);

  const isRecording = state === 'recording-encounter' || state === 'recording-dictation';
  const ringColor = state === 'recording-encounter' ? 'rgba(239,68,68,' : 'rgba(96,165,250,';
  const ringScale = 1 + audioLevel * 0.6;

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex items-center justify-center w-6 h-6 rounded-full transition-all duration-150 active:scale-90 touch-none select-none ${
        state === 'transcribing' ? '' : isRecording ? '' : 'hover:bg-white/[0.06]'
      }`}
      title={
        state === 'recording-encounter' ? 'Click to stop recording'
        : state === 'recording-dictation' ? 'Release to stop dictation'
        : state === 'transcribing' ? 'Processing...'
        : 'Click: record encounter · Hold: dictate'
      }
    >
      {/* Audio level ring */}
      {isRecording && (
        <span
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            transform: `scale(${ringScale})`,
            boxShadow: `0 0 0 2px ${ringColor}0.5), 0 0 8px ${ringColor}0.25)`,
            transition: 'transform 0.1s ease-out, box-shadow 0.1s ease-out',
          }}
        />
      )}
      {state === 'transcribing' ? (
        <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
      ) : (
        <Mic className={`w-3 h-3 transition-colors duration-150 ${
          state === 'recording-encounter' ? 'text-red-400'
          : state === 'recording-dictation' ? 'text-blue-400'
          : 'text-[var(--text-muted)]'
        }`} />
      )}
    </button>
  );
}
