'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square } from 'lucide-react';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { useBoard, useShell } from '../../providers';

interface RecorderPillProps {
  patientId: number | null;
  patientName: string;
  sheetName: string;
  onTranscript: (text: string) => void;
  onClose: () => void;
}

export function RecorderPill({ patientId, patientName, sheetName, onTranscript, onClose }: RecorderPillProps) {
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '26px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 90,
      animation: 'warm-slideUp 300ms var(--warm-ease) both',
    }}>
      <div style={{
        background: 'var(--warm-text)',
        color: 'var(--warm-bg)',
        borderRadius: 'var(--warm-radius-pill)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: 'var(--warm-shadow-hover)',
        minWidth: '280px',
      }}>
        {/* Pulsing dot */}
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: '#dc2626',
          animation: 'warm-fadeIn 800ms ease-in-out infinite alternate',
          flexShrink: 0,
        }} />

        {/* Timer */}
        <span style={{
          fontSize: '14px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          minWidth: '36px',
        }}>
          {formatTime(seconds)}
        </span>

        {/* Waveform bars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '22px' }}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} style={{
              width: '3px',
              borderRadius: '2px',
              background: 'currentColor',
              opacity: 0.6,
              animation: `warm-fadeIn 900ms ease-in-out ${i * 70}ms infinite alternate`,
              height: `${8 + Math.random() * 14}px`,
            }} />
          ))}
        </div>

        {/* Target */}
        <span style={{ fontSize: '12px', opacity: 0.7, flex: 1, textAlign: 'center' as const }}>
          {patientName || 'Unassigned'}
        </span>

        {/* Embedded VoiceRecorder (hidden visually, provides actual recording) */}
        <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}>
          <VoiceRecorder
            mode="encounter"
            sheetName={sheetName}
            onTranscript={(text) => {
              onTranscript(text);
              onClose();
            }}
            onRecordingStart={() => {
              setRecording(true);
              setSeconds(0);
              timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
            }}
            onRecordingStop={() => {
              setRecording(false);
              if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            }}
            onProcessingChange={() => {}}
          />
        </div>

        {/* Stop button */}
        <button
          onClick={onClose}
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'var(--warm-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer', flexShrink: 0,
            color: '#fff',
          }}
          title="Stop recording"
        >
          <Square size={14} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
