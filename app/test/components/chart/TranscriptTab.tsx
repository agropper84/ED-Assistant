'use client';

import { useState } from 'react';
import { Copy, Mic } from 'lucide-react';
import type { Patient } from '@/lib/google-sheets';
import { getExamPresets } from '@/lib/exam-presets';
import { Eyebrow } from '../primitives/Eyebrow';
import { Button } from '../primitives/Button';

interface Turn {
  role: 'MD' | 'PT' | 'SYSTEM';
  text: string;
  time?: string;
}

function parseTranscript(raw: string): Turn[] {
  if (!raw) return [];
  const lines = raw.split('\n').filter(l => l.trim());
  const turns: Turn[] = [];

  for (const line of lines) {
    const speakerMatch = line.match(/^(Speaker\s*\d+|Dr|Pt|MD|Patient|Doctor|Family)\s*:\s*(.*)/i);
    if (speakerMatch) {
      const label = speakerMatch[1].toLowerCase();
      const isPhysician = label.includes('1') || label.includes('dr') || label.includes('md') || label.includes('doctor');
      turns.push({ role: isPhysician ? 'MD' : 'PT', text: speakerMatch[2].trim() });
    } else {
      // No speaker label — treat as MD dictation
      turns.push({ role: 'MD', text: line.trim() });
    }
  }
  return turns;
}

function TurnCard({ turn, index }: { turn: Turn; index: number }) {
  const isMD = turn.role === 'MD';
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      padding: '13px 16px',
      animation: 'warm-slideUp 300ms var(--warm-ease) both',
      animationDelay: `${index * 30}ms`,
    }}>
      {/* Role chip */}
      <div style={{ width: '44px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px 8px',
          borderRadius: 'var(--warm-radius-pill)',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          background: isMD ? 'var(--warm-accent-soft)' : 'var(--warm-surface-2)',
          color: isMD ? 'var(--warm-accent)' : 'var(--warm-text-2)',
        }}>
          {turn.role}
        </span>
        {turn.time && (
          <span style={{ fontSize: '10px', color: 'var(--warm-text-3)', fontVariantNumeric: 'tabular-nums' }}>
            {turn.time}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        fontSize: '15px',
        lineHeight: 1.65,
        color: 'var(--warm-text)',
        whiteSpace: 'pre-wrap' as const,
      }}>
        {turn.text}
      </div>
    </div>
  );
}

export function TranscriptTab({ patient, onAppendTranscript }: { patient: Patient; onAppendTranscript?: (text: string) => void }) {
  const [copied, setCopied] = useState(false);
  const rawTranscript = patient.transcript || patient.encounterNotes || '';
  const turns = parseTranscript(rawTranscript);
  const examPresets = getExamPresets();

  const handleCopy = () => {
    navigator.clipboard.writeText(rawTranscript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePresetClick = (text: string) => {
    onAppendTranscript?.(text);
  };

  if (!rawTranscript) {
    return (
      <div style={{
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        padding: '40px 20px',
        textAlign: 'center' as const,
      }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--warm-text-2)', marginBottom: '6px' }}>
          No transcript yet
        </div>
        <div style={{ fontSize: '13px', color: 'var(--warm-text-3)' }}>
          Tap <strong>Dictate</strong> to start an encounter recording.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
      {/* Meta card */}
      <div style={{
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        padding: '12px 17px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <Eyebrow>TRANSCRIPT</Eyebrow>
          <div style={{ fontSize: '12px', color: 'var(--warm-text-3)', marginTop: '2px' }}>
            {turns.length} turn{turns.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" size="sm" icon={<Mic size={14} />}>
            Append
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy} icon={<Copy size={14} />}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      {/* Turns */}
      <div style={{
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        overflow: 'hidden',
      }}>
        {turns.map((turn, idx) => (
          <div key={idx} style={{
            borderBottom: idx < turns.length - 1 ? '1px solid var(--warm-border)' : 'none',
          }}>
            <TurnCard turn={turn} index={idx} />
          </div>
        ))}
      </div>

      {/* Exam presets */}
      <div style={{
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        padding: '13px 17px',
      }}>
        <Eyebrow>EXAM PRESETS</Eyebrow>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap' as const,
          gap: '6px',
          marginTop: '10px',
        }}>
          {examPresets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => handlePresetClick(preset.text)}
              style={{
                padding: '7px 14px',
                borderRadius: 'var(--warm-radius-pill)',
                fontSize: '12px',
                fontWeight: 500,
                background: 'var(--warm-surface-2)',
                border: '1px solid var(--warm-border)',
                color: 'var(--warm-text-2)',
                cursor: 'pointer',
                transition: 'all var(--warm-dur-fast) var(--warm-ease)',
                height: '36px',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
