'use client';

import { useState } from 'react';
import { Copy, Check, ChevronRight } from 'lucide-react';
import type { Patient } from '@/lib/google-sheets';
import { Eyebrow } from '../primitives/Eyebrow';
import { Button } from '../primitives/Button';

interface NoteSectionProps {
  label: string;
  content: string;
}

function NoteSection({ label, content }: NoteSectionProps) {
  if (!content) return null;
  return (
    <div style={{
      background: 'var(--warm-surface)',
      border: '1px solid var(--warm-border)',
      borderRadius: 'var(--warm-radius-card)',
      padding: '15px 17px',
      animation: 'warm-slideUp 300ms var(--warm-ease) both',
    }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{
        fontSize: '14px',
        lineHeight: 1.6,
        color: 'var(--warm-text-2)',
        whiteSpace: 'pre-wrap' as const,
        marginTop: '8px',
      }}>
        {content}
      </div>
    </div>
  );
}

export function EncounterTab({ patient, onSwitchTab }: { patient: Patient; onSwitchTab?: (tab: string) => void }) {
  const [copied, setCopied] = useState(false);
  const hasNote = patient.hpi || patient.objective || patient.assessmentPlan;
  const hasTranscript = patient.transcript || patient.encounterNotes;

  const handleCopyNote = () => {
    const parts = [
      patient.hpi && `HPI:\n${patient.hpi}`,
      patient.objective && `EXAM:\n${patient.objective}`,
      patient.assessmentPlan && `ASSESSMENT & PLAN:\n${patient.assessmentPlan}`,
      patient.referral && `REFERRAL:\n${patient.referral}`,
      patient.admission && `DISPOSITION:\n${patient.admission}`,
    ].filter(Boolean).join('\n\n');
    navigator.clipboard.writeText(parts);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
      {/* Diagnosis card */}
      <div style={{
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        padding: '15px 17px',
      }}>
        <Eyebrow>DIAGNOSIS</Eyebrow>
        <div style={{
          fontSize: '15px',
          fontWeight: 500,
          color: patient.diagnosis ? 'var(--warm-text)' : 'var(--warm-text-3)',
          marginTop: '8px',
          fontStyle: patient.diagnosis ? 'normal' : 'italic',
        }}>
          {patient.diagnosis || 'No diagnosis yet'}
        </div>
        {patient.icd9 && (
          <div style={{ fontSize: '12px', color: 'var(--warm-text-3)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
            ICD-9: {patient.icd9}{patient.icd10 ? ` · ICD-10: ${patient.icd10}` : ''}
          </div>
        )}
      </div>

      {/* Note sections */}
      {hasNote ? (
        <>
          <NoteSection label="HPI" content={patient.hpi || ''} />
          <NoteSection label="EXAM" content={patient.objective || ''} />
          <NoteSection label="ASSESSMENT & PLAN" content={patient.assessmentPlan || ''} />
          {patient.referral && <NoteSection label="REFERRAL" content={patient.referral} />}
          {patient.admission && <NoteSection label="DISPOSITION" content={patient.admission} />}
        </>
      ) : hasTranscript ? (
        <div style={{
          background: 'var(--warm-accent-soft)',
          border: '1px solid var(--warm-accent-ring)',
          borderRadius: 'var(--warm-radius-card)',
          padding: '30px 20px',
          textAlign: 'center' as const,
        }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--warm-text)', marginBottom: '6px' }}>
            Transcript ready — no note yet
          </div>
          <div style={{ fontSize: '13px', color: 'var(--warm-text-2)' }}>
            Tap <strong>Generate</strong> to create the encounter note from the transcript.
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--warm-surface)',
          border: '1px solid var(--warm-border)',
          borderRadius: 'var(--warm-radius-card)',
          padding: '30px 20px',
          textAlign: 'center' as const,
        }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--warm-text-2)', marginBottom: '6px' }}>
            Nothing recorded yet
          </div>
          <div style={{ fontSize: '13px', color: 'var(--warm-text-3)' }}>
            Tap <strong>Dictate</strong> to start an encounter recording, or paste notes manually.
          </div>
        </div>
      )}

      {/* DDX / Investigations if present */}
      <NoteSection label="DIFFERENTIAL DIAGNOSIS" content={patient.ddx || ''} />
      <NoteSection label="INVESTIGATIONS" content={patient.investigations || ''} />
      <NoteSection label="MANAGEMENT" content={patient.management || ''} />

      {/* Copy + Next actions (only when note exists) */}
      {hasNote && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
          <Button variant="secondary" size="sm" onClick={handleCopyNote}
            icon={copied ? <Check size={14} /> : <Copy size={14} />}>
            {copied ? 'Copied' : 'Copy Full Note'}
          </Button>
          <button
            onClick={() => onSwitchTab?.('billing')}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, color: 'var(--warm-accent)',
              fontFamily: 'var(--warm-font)',
            }}
          >
            Next: Billing <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
