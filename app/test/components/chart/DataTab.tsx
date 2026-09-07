'use client';

import type { Patient } from '@/lib/google-sheets';
import { Eyebrow } from '../primitives/Eyebrow';

interface DataFieldProps {
  label: string;
  value: string;
}

function DataField({ label, value }: DataFieldProps) {
  return (
    <div style={{ minWidth: '180px' }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{
        fontSize: '14px',
        fontVariantNumeric: 'tabular-nums',
        color: value ? 'var(--warm-text)' : 'var(--warm-text-3)',
        marginTop: '4px',
        fontStyle: value ? 'normal' : 'italic',
      }}>
        {value || '—'}
      </div>
    </div>
  );
}

export function DataTab({ patient }: { patient: Patient }) {
  return (
    <div style={{
      background: 'var(--warm-surface)',
      border: '1px solid var(--warm-border)',
      borderRadius: 'var(--warm-radius-card)',
      padding: '17px 19px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '14px',
    }}>
      <DataField label="HCN" value={patient.hcn || ''} />
      <DataField label="MRN" value={patient.mrn || ''} />
      <DataField label="AGE / GENDER" value={[patient.age, patient.gender].filter(Boolean).join(' ')} />
      <DataField label="DATE OF BIRTH" value={patient.birthday || ''} />
      <DataField label="ROOM" value={patient.room || ''} />
      <DataField label="ARRIVAL" value={patient.timestamp || ''} />
      <DataField label="SHEET" value={patient.sheetName || ''} />
      <DataField label="ROW INDEX" value={String(patient.rowIndex)} />
    </div>
  );
}
