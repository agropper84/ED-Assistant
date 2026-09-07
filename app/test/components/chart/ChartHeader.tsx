'use client';

import { ChevronLeft, Mic, Sparkles } from 'lucide-react';
import { StatusBadge } from '../primitives/StatusBadge';
import { Button } from '../primitives/Button';
import type { Patient } from '@/lib/google-sheets';

function getStatus(p: Patient): string {
  if (p.status === 'processed' || p.hpi || p.objective || p.assessmentPlan) return 'done';
  if (p.status === 'pending' || p.transcript || p.encounterNotes) return 'pending';
  return 'new';
}

function formatTime(ts: string): string {
  if (!ts) return '';
  const m = ts.match(/(\d{1,2}):(\d{2})/);
  if (!m) return ts;
  let h = parseInt(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

interface ChartHeaderProps {
  patient: Patient;
  onBack: () => void;
  showBack?: boolean;
}

export function ChartHeader({ patient, onBack, showBack = false }: ChartHeaderProps) {
  const status = getStatus(patient);

  return (
    <div style={{
      background: 'var(--warm-surface)',
      borderBottom: '1px solid var(--warm-border)',
      padding: '16px 22px',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
    }}>
      {/* Back button — hidden in Split view */}
      {showBack && (
        <button
          onClick={onBack}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--warm-surface-2)',
            border: '1px solid var(--warm-border)',
            cursor: 'pointer',
            color: 'var(--warm-text-2)',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={18} />
        </button>
      )}

      {/* Name + subline */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '21px', fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--warm-text)' }}>
          {patient.name || 'Unnamed'}
        </div>
        <div style={{
          fontSize: '13px',
          color: 'var(--warm-text-3)',
          fontVariantNumeric: 'tabular-nums',
          marginTop: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
        }}>
          {[
            patient.age && patient.gender ? `${patient.age} ${patient.gender}` : patient.age || patient.gender,
            patient.room ? `Rm ${patient.room}` : null,
            patient.timestamp ? `arrived ${formatTime(patient.timestamp)}` : null,
            patient.hcn ? `HCN ${patient.hcn}` : null,
          ].filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* Status */}
      <StatusBadge status={status} />

      {/* Actions */}
      <Button variant="secondary" size="sm" icon={<Mic size={14} />}>
        Dictate
      </Button>
      <Button variant="primary" size="sm" icon={<Sparkles size={14} />}>
        Generate
      </Button>
    </div>
  );
}
