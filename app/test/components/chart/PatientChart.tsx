'use client';

import { useState } from 'react';
import type { Patient } from '@/lib/google-sheets';
import { ChartHeader } from './ChartHeader';
import { ChartTabs, type ChartTab } from './ChartTabs';
import { EncounterTab } from './EncounterTab';
import { DataTab } from './DataTab';

interface PatientChartProps {
  patient: Patient;
  onBack: () => void;
  showBack?: boolean;
}

export function PatientChart({ patient, onBack, showBack }: PatientChartProps) {
  const [tab, setTab] = useState<ChartTab>('encounter');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      overflow: 'hidden',
      background: 'var(--warm-bg)',
    }}>
      <ChartHeader patient={patient} onBack={onBack} showBack={showBack} />
      <ChartTabs active={tab} onChange={setTab} />

      <div style={{
        flex: 1,
        overflowY: 'auto' as const,
        padding: '18px 22px 32px',
        maxWidth: '860px',
        width: '100%',
      }}>
        {tab === 'encounter' && <EncounterTab patient={patient} />}
        {tab === 'transcript' && (
          <PlaceholderTab label="Transcript" detail="Transcript display and editing will appear here." />
        )}
        {tab === 'billing' && (
          <PlaceholderTab label="Billing" detail="Billing codes, premiums, and totals will appear here." />
        )}
        {tab === 'ask' && (
          <PlaceholderTab label="Ask" detail="Clinical Q&A scoped to this patient will appear here." />
        )}
        {tab === 'data' && <DataTab patient={patient} />}
      </div>
    </div>
  );
}

function PlaceholderTab({ label, detail }: { label: string; detail: string }) {
  return (
    <div style={{
      background: 'var(--warm-surface)',
      border: '1px solid var(--warm-border)',
      borderRadius: 'var(--warm-radius-card)',
      padding: '40px 20px',
      textAlign: 'center' as const,
    }}>
      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--warm-text-2)', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--warm-text-3)' }}>
        {detail}
      </div>
    </div>
  );
}
