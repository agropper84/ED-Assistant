'use client';

import { Mic, Sparkles } from 'lucide-react';
import { StatusBadge } from '../primitives/StatusBadge';
import type { Patient } from '@/lib/google-sheets';

const STATUS_COLORS: Record<string, string> = {
  new: 'var(--warm-status-new)',
  pending: 'var(--warm-status-pending)',
  done: 'var(--warm-status-done)',
  processed: 'var(--warm-status-done)',
};

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

interface PatientCardV2Props {
  patient: Patient;
  selected?: boolean;
  onSelect?: () => void;
  onMic?: () => void;
  onGenerate?: () => void;
}

export function PatientCardV2({ patient, selected, onSelect, onMic, onGenerate }: PatientCardV2Props) {
  const status = getStatus(patient);
  const edgeColor = STATUS_COLORS[status] || STATUS_COLORS.new;

  return (
    <div
      onClick={onSelect}
      style={{
        background: 'var(--warm-surface)',
        border: selected ? `1.5px solid var(--warm-accent)` : '1px solid var(--warm-border)',
        borderLeft: `3px solid ${edgeColor}`,
        borderRadius: 'var(--warm-radius-card)',
        padding: '13px 15px',
        cursor: 'pointer',
        boxShadow: selected ? 'var(--warm-shadow-hover)' : 'var(--warm-shadow)',
        transition: 'all var(--warm-dur-fast) var(--warm-ease)',
        minHeight: '90px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '6px',
        ...(selected ? { background: 'var(--warm-accent-soft)' } : {}),
      }}
    >
      {/* Row 1: Name + time */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{
          fontSize: '15px',
          fontWeight: 650,
          color: 'var(--warm-text)',
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
          flex: 1,
        }}>
          {patient.name || 'Unnamed'}
        </span>
        <span style={{
          fontSize: '11px',
          color: 'var(--warm-text-3)',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
          marginLeft: '8px',
        }}>
          {formatTime(patient.timestamp)}
        </span>
      </div>

      {/* Row 2: Diagnosis */}
      <div style={{
        fontSize: '13px',
        color: patient.diagnosis ? 'var(--warm-text-2)' : 'var(--warm-text-3)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
        fontStyle: patient.diagnosis ? 'normal' : 'italic',
      }}>
        {patient.diagnosis || 'Add diagnosis'}
      </div>

      {/* Row 3: Metadata */}
      <div style={{
        fontSize: '11px',
        color: 'var(--warm-text-3)',
        display: 'flex',
        gap: '4px',
      }}>
        {patient.age && <span>{patient.age}</span>}
        {patient.age && patient.gender && <span>·</span>}
        {patient.gender && <span>{patient.gender}</span>}
        {patient.room && <><span>·</span><span>Rm {patient.room}</span></>}
      </div>

      {/* Footer: Status + Actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '2px',
      }}>
        <StatusBadge status={status} />
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onMic?.(); }}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--warm-surface-2)',
              border: '1px solid var(--warm-border)',
              cursor: 'pointer',
              color: 'var(--warm-text-3)',
              transition: 'all var(--warm-dur-fast)',
            }}
            title="Dictate"
          >
            <Mic size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onGenerate?.(); }}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--warm-accent-soft)',
              border: '1px solid var(--warm-accent-ring)',
              cursor: 'pointer',
              color: 'var(--warm-accent)',
              transition: 'all var(--warm-dur-fast)',
            }}
            title="Generate"
          >
            <Sparkles size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
