'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Patient } from '@/lib/google-sheets';
import { Eyebrow } from '../primitives/Eyebrow';
import { Button } from '../primitives/Button';
import { useBoard, useShell } from '../../providers';

export type ChartAction = 'referral' | 'admission' | 'heart' | null;

// --- Referral Panel ---

function ReferralPanel({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const [service, setService] = useState('');
  const [urgency, setUrgency] = useState('same-shift');
  const [reason, setReason] = useState(patient.diagnosis || '');
  const [sending, setSending] = useState(false);
  const { refreshPatients, sheetName } = useBoard();
  const { showToast } = useShell();

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: patient.rowIndex, sheetName: patient.sheetName || sheetName,
          service, urgency, reason, patientName: patient.name,
        }),
      });
      if (res.ok) {
        showToast('Referral generated');
        refreshPatients();
        onClose();
      } else { showToast('Referral failed'); }
    } catch { showToast('Referral failed'); }
    finally { setSending(false); }
  };

  return (
    <ActionCard title="REFERRAL" onClose={onClose}>
      <label style={labelStyle}>Service</label>
      <select value={service} onChange={(e) => setService(e.target.value)} style={selectStyle}>
        <option value="">Select service…</option>
        {['Cardiology', 'Internal Medicine', 'General Surgery', 'Orthopaedics', 'Psychiatry', 'Neurology', 'OB/GYN', 'Pediatrics'].map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <label style={labelStyle}>Urgency</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        {[{ key: 'now', label: 'Now' }, { key: 'same-shift', label: 'Same shift' }, { key: 'routine', label: 'Routine' }].map(u => (
          <button key={u.key} onClick={() => setUrgency(u.key)} style={{
            ...pillStyle, background: urgency === u.key ? 'var(--warm-accent-soft)' : 'var(--warm-surface-2)',
            border: urgency === u.key ? '1px solid var(--warm-accent-ring)' : '1px solid var(--warm-border)',
            color: urgency === u.key ? 'var(--warm-accent)' : 'var(--warm-text-2)',
          }}>{u.label}</button>
        ))}
      </div>
      <label style={labelStyle}>Reason for referral</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)}
        style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} />
      <Button variant="primary" size="lg" onClick={handleSend} disabled={!service || !reason.trim() || sending}
        style={{ marginTop: '4px' }}>
        {sending ? 'Sending…' : 'Send Referral'}
      </Button>
    </ActionCard>
  );
}

// --- Admission Panel ---

function AdmissionPanel({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const [admitService, setAdmitService] = useState('');
  const [bed, setBed] = useState('');
  const [sending, setSending] = useState(false);
  const { refreshPatients, sheetName } = useBoard();
  const { showToast } = useShell();

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/admission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: patient.rowIndex, sheetName: patient.sheetName || sheetName,
          service: admitService, bed, patientName: patient.name,
        }),
      });
      if (res.ok) { showToast('Admission note generated'); refreshPatients(); onClose(); }
      else { showToast('Admission failed'); }
    } catch { showToast('Admission failed'); }
    finally { setSending(false); }
  };

  return (
    <ActionCard title="ADMISSION REQUEST" onClose={onClose}>
      <label style={labelStyle}>Admitting service</label>
      <select value={admitService} onChange={(e) => setAdmitService(e.target.value)} style={selectStyle}>
        <option value="">Select service…</option>
        {['Internal Medicine', 'General Surgery', 'Cardiology', 'Neurology', 'Psychiatry', 'Pediatrics', 'ICU'].map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <label style={labelStyle}>Bed type</label>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
        {['CCU', 'Ward telemetry', 'Ward unmonitored', 'Step-down'].map(b => (
          <button key={b} onClick={() => setBed(b)} style={{
            ...pillStyle, background: bed === b ? 'var(--warm-accent-soft)' : 'var(--warm-surface-2)',
            border: bed === b ? '1px solid var(--warm-accent-ring)' : '1px solid var(--warm-border)',
            color: bed === b ? 'var(--warm-accent)' : 'var(--warm-text-2)',
          }}>{b}</button>
        ))}
      </div>
      <Button variant="primary" size="lg" onClick={handleSend} disabled={!admitService || sending}
        style={{ marginTop: '4px' }}>
        {sending ? 'Sending…' : 'Request Admission'}
      </Button>
    </ActionCard>
  );
}

// --- HEART Score Panel ---

const HEART_CRITERIA = [
  { name: 'History', options: ['Slightly suspicious (0)', 'Moderately suspicious (1)', 'Highly suspicious (2)'] },
  { name: 'ECG', options: ['Normal (0)', 'Non-specific ST changes (1)', 'Significant ST deviation (2)'] },
  { name: 'Age', options: ['<45 (0)', '45-64 (1)', '≥65 (2)'] },
  { name: 'Risk factors', options: ['No risk factors (0)', '1-2 risk factors (1)', '≥3 or hx of CAD (2)'] },
  { name: 'Troponin', options: ['≤ normal (0)', '1-3x normal (1)', '>3x normal (2)'] },
];

function HeartPanel({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const [scores, setScores] = useState<number[]>([0, 0, 0, 0, 0]);
  const total = scores.reduce((a, b) => a + b, 0);
  const risk = total <= 3 ? 'LOW' : total <= 6 ? 'MODERATE' : 'HIGH';
  const riskColor = total <= 3 ? 'var(--warm-status-new)' : total <= 6 ? 'var(--warm-status-pending)' : '#dc2626';

  return (
    <ActionCard title="HEART SCORE" onClose={onClose}>
      {HEART_CRITERIA.map((crit, ci) => (
        <div key={crit.name} style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>{crit.name}</label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' as const }}>
            {crit.options.map((opt, oi) => (
              <button key={oi} onClick={() => { const n = [...scores]; n[ci] = oi; setScores(n); }}
                style={{
                  ...pillStyle, fontSize: '11px', padding: '5px 10px',
                  background: scores[ci] === oi ? 'var(--warm-accent-soft)' : 'var(--warm-surface-2)',
                  border: scores[ci] === oi ? '1px solid var(--warm-accent-ring)' : '1px solid var(--warm-border)',
                  color: scores[ci] === oi ? 'var(--warm-accent)' : 'var(--warm-text-2)',
                }}>{opt}</button>
            ))}
          </div>
        </div>
      ))}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px', borderRadius: 'var(--warm-radius-input)',
        background: 'var(--warm-surface-2)', border: '1px solid var(--warm-border)',
      }}>
        <span style={{ fontSize: '15px', fontWeight: 650, color: 'var(--warm-text)' }}>
          {total}/10
        </span>
        <span style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
          padding: '3px 10px', borderRadius: 'var(--warm-radius-pill)',
          background: riskColor, color: '#fff',
        }}>
          {risk}
        </span>
      </div>
    </ActionCard>
  );
}

// --- Shared ActionCard wrapper ---

function ActionCard({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--warm-surface)',
      border: '1px solid var(--warm-accent-ring)',
      borderRadius: 'var(--warm-radius-card)',
      padding: '15px 17px',
      marginBottom: '12px',
      animation: 'warm-slideUp 300ms var(--warm-ease) both',
      display: 'flex', flexDirection: 'column' as const, gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>{title}</Eyebrow>
        <button onClick={onClose} style={{
          width: '32px', height: '32px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--warm-surface-2)', border: '1px solid var(--warm-border)',
          cursor: 'pointer', color: 'var(--warm-text-3)',
        }}><X size={14} /></button>
      </div>
      {children}
    </div>
  );
}

// --- Exported component ---

export function ChartActionsPanel({ action, patient, onClose }: { action: ChartAction; patient: Patient; onClose: () => void }) {
  if (!action) return null;
  if (action === 'referral') return <ReferralPanel patient={patient} onClose={onClose} />;
  if (action === 'admission') return <AdmissionPanel patient={patient} onClose={onClose} />;
  if (action === 'heart') return <HeartPanel patient={patient} onClose={onClose} />;
  return null;
}

// --- Shared styles ---
const labelStyle: React.CSSProperties = { fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--warm-text-3)' };
const selectStyle: React.CSSProperties = { padding: '10px 12px', fontSize: '14px', borderRadius: 'var(--warm-radius-input)', border: '1px solid var(--warm-border)', background: 'var(--warm-surface-2)', color: 'var(--warm-text)', fontFamily: 'var(--warm-font)', width: '100%' };
const inputStyle: React.CSSProperties = { padding: '10px 12px', fontSize: '14px', borderRadius: 'var(--warm-radius-input)', border: '1px solid var(--warm-border)', background: 'var(--warm-surface-2)', color: 'var(--warm-text)', fontFamily: 'var(--warm-font)', width: '100%', outline: 'none' };
const pillStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 'var(--warm-radius-pill)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--warm-font)', transition: 'all 150ms' };
