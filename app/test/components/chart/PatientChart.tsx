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
import { useBoard, useShell } from '../../providers';

interface PatientChartProps {
  patient: Patient;
  onBack: () => void;
  showBack?: boolean;
}

export function PatientChart({ patient, onBack, showBack }: PatientChartProps) {
  const [tab, setTab] = useState<ChartTab>('encounter');
  const [generating, setGenerating] = useState(false);
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
      <ChartTabs active={tab} onChange={setTab} />

      <div style={{
        flex: 1,
        overflowY: 'auto' as const,
        padding: '18px 22px 32px',
        maxWidth: '860px',
        width: '100%',
      }}>
        {tab === 'encounter' && <EncounterTab patient={patient} />}
        {tab === 'transcript' && <TranscriptTab patient={patient} />}
        {tab === 'billing' && <BillingTab patient={patient} />}
        {tab === 'ask' && <AskTab patient={patient} />}
        {tab === 'data' && <DataTab patient={patient} />}
      </div>
    </div>
  );
}
