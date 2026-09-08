'use client';

import { useState, useCallback } from 'react';
import type { Patient } from '@/lib/google-sheets';
import { ChartHeader } from './ChartHeader';
import { ChartTabs, type ChartTab } from './ChartTabs';
import { EncounterTab } from './EncounterTab';
import { TranscriptTab } from './TranscriptTab';
import { BillingTab } from './BillingTab';
import { AskTab } from './AskTab';
import { DataTab } from './DataTab';
import { ChartActionsPanel, type ChartAction } from './ChartActions';
import { useBoard, useShell } from '../../providers';

interface PatientChartProps {
  patient: Patient;
  onBack: () => void;
  showBack?: boolean;
}

export function PatientChart({ patient, onBack, showBack }: PatientChartProps) {
  const [tab, setTab] = useState<ChartTab>('encounter');
  const [generating, setGenerating] = useState(false);
  const [action, setAction] = useState<ChartAction>(null);
  const { refreshPatients, sheetName } = useBoard();
  const { showToast } = useShell();

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: patient.rowIndex,
          sheetName: patient.sheetName || sheetName,
          patientName: patient.name,
        }),
      });
      if (res.ok) {
        showToast('Encounter note generated');
        refreshPatients();
        setTab('encounter');
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        showToast(`Generation failed: ${err.error || res.status}`);
      }
    } catch (e: any) {
      showToast(`Generation failed: ${e.message || 'Network error'}`);
    } finally {
      setGenerating(false);
    }
  }, [generating, patient, sheetName, refreshPatients, showToast]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      overflow: 'hidden',
      background: 'var(--warm-bg)',
    }}>
      <ChartHeader
        patient={patient}
        onBack={onBack}
        showBack={showBack}
        onGenerate={handleGenerate}
        generating={generating}
      />

      {/* Action chips */}
      <div style={{
        display: 'flex', gap: '6px', padding: '8px 22px',
        borderBottom: '1px solid var(--warm-border)',
        flexWrap: 'wrap' as const,
      }}>
        {(['referral', 'admission', 'heart'] as const).map(a => {
          const labels: Record<string, string> = { referral: 'Referral', admission: 'Admission', heart: 'HEART Score' };
          const isActive = action === a;
          return (
            <button key={a} onClick={() => setAction(isActive ? null : a)} style={{
              padding: '5px 12px', borderRadius: 'var(--warm-radius-pill)',
              fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              background: isActive ? 'var(--warm-accent-soft)' : 'var(--warm-surface-2)',
              border: isActive ? '1px solid var(--warm-accent-ring)' : '1px solid var(--warm-border)',
              color: isActive ? 'var(--warm-accent)' : 'var(--warm-text-2)',
              transition: 'all 150ms', fontFamily: 'var(--warm-font)', height: '32px',
            }}>{labels[a]}</button>
          );
        })}
      </div>

      <ChartTabs active={tab} onChange={setTab} />

      <div style={{
        flex: 1,
        overflowY: 'auto' as const,
        padding: '18px 22px 32px',
        maxWidth: '860px',
        width: '100%',
      }}>
        {/* Inline action panel */}
        <ChartActionsPanel action={action} patient={patient} onClose={() => setAction(null)} />

        {tab === 'encounter' && <EncounterTab patient={patient} onSwitchTab={(t) => setTab(t as ChartTab)} />}
        {tab === 'transcript' && <TranscriptTab patient={patient} />}
        {tab === 'billing' && <BillingTab patient={patient} />}
        {tab === 'ask' && <AskTab patient={patient} />}
        {tab === 'data' && <DataTab patient={patient} />}
      </div>
    </div>
  );
}
