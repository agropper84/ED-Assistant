'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '../primitives/Button';
import { useBoard, useShell } from '../../providers';

interface AddPatientModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddPatientModal({ open, onClose }: AddPatientModalProps) {
  const [tab, setTab] = useState<'quick' | 'parse'>('quick');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [hcn, setHcn] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [saving, setSaving] = useState(false);
  const { sheetName, refreshPatients } = useBoard();
  const { showToast } = useShell();

  if (!open) return null;

  const resetForm = () => {
    setName(''); setAge(''); setGender(''); setHcn(''); setDiagnosis(''); setPasteText('');
  };

  const handleQuickAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const now = new Date();
      const timestamp = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _sheetName: sheetName,
          name: name.trim(),
          age: age.trim(),
          gender: gender.trim(),
          hcn: hcn.trim(),
          diagnosis: diagnosis.trim(),
          timestamp,
        }),
      });
      if (res.ok) {
        showToast(`${name.trim()} added`);
        refreshPatients();
        resetForm();
        onClose();
      } else {
        showToast('Failed to add patient');
      }
    } catch {
      showToast('Failed to add patient');
    } finally {
      setSaving(false);
    }
  };

  const handleParse = async () => {
    if (!pasteText.trim()) return;
    setSaving(true);
    try {
      const lines = pasteText.trim().split('\n').filter(l => l.trim());
      let added = 0;
      for (const line of lines) {
        const parts = line.split(/\t|,(?=\s)/).map(p => p.trim()).filter(Boolean);
        if (parts.length < 1) continue;
        const patientName = parts[0];
        const now = new Date();
        const timestamp = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
        const res = await fetch('/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            _sheetName: sheetName,
            name: patientName,
            age: parts[1] || '',
            gender: parts[2] || '',
            hcn: parts[3] || '',
            diagnosis: parts[4] || '',
            timestamp,
          }),
        });
        if (res.ok) added++;
      }
      showToast(`Parsed ${added} patient${added !== 1 ? 's' : ''}`);
      refreshPatients();
      resetForm();
      onClose();
    } catch {
      showToast('Parse failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,25,23,0.34)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'warm-fadeIn 150ms ease-out both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, calc(100% - 32px))',
          background: 'var(--warm-surface)',
          borderRadius: 'var(--warm-radius-card)',
          boxShadow: 'var(--warm-shadow-hover)',
          border: '1px solid var(--warm-border)',
          overflow: 'hidden',
          animation: 'warm-slideUp 300ms var(--warm-ease) both',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--warm-border)',
        }}>
          <h2 style={{ fontSize: '17px', fontWeight: 650, color: 'var(--warm-text)', letterSpacing: '-0.02em' }}>
            Add Patient
          </h2>
          <button onClick={onClose} style={{
            width: '32px', height: '32px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--warm-surface-2)', border: '1px solid var(--warm-border)',
            cursor: 'pointer', color: 'var(--warm-text-3)',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--warm-border)' }}>
          {(['quick', 'parse'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px', fontSize: '13px', fontWeight: tab === t ? 650 : 400,
                color: tab === t ? 'var(--warm-text)' : 'var(--warm-text-3)',
                borderBottom: tab === t ? '2px solid var(--warm-accent)' : '2px solid transparent',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--warm-font)',
              }}
            >
              {t === 'quick' ? 'Quick Add' : 'Paste Data'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px 20px' }}>
          {tab === 'quick' ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient name *"
                style={inputStyle} autoFocus />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age"
                  style={{ ...inputStyle, flex: 1 }} />
                <select value={gender} onChange={(e) => setGender(e.target.value)}
                  style={{ ...inputStyle, flex: 1, appearance: 'auto' as any }}>
                  <option value="">Gender</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                  <option value="X">X</option>
                </select>
              </div>
              <input value={hcn} onChange={(e) => setHcn(e.target.value)} placeholder="HCN"
                style={inputStyle} />
              <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Diagnosis"
                style={inputStyle} />
              <Button variant="primary" size="lg" onClick={handleQuickAdd} disabled={!name.trim() || saving}
                icon={<Plus size={16} />} style={{ marginTop: '4px' }}>
                {saving ? 'Adding…' : 'Add Patient'}
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--warm-text-3)' }}>
                Paste tab-separated or comma-separated data. Format: Name, Age, Gender, HCN, Diagnosis (one patient per line).
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Smith, John\t45\tM\t002123456\tChest pain\nDoe, Jane\t32\tF\t003456789\tAsthma"}
                style={{
                  ...inputStyle, minHeight: '120px', resize: 'vertical' as const,
                  fontFamily: 'var(--warm-font-mono, monospace)', fontSize: '13px',
                }}
              />
              <Button variant="primary" size="lg" onClick={handleParse} disabled={!pasteText.trim() || saving}
                style={{ marginTop: '4px' }}>
                {saving ? 'Parsing…' : `Parse & Add`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '16px',
  borderRadius: 'var(--warm-radius-input)',
  border: '1px solid var(--warm-border)',
  background: 'var(--warm-surface-2)',
  color: 'var(--warm-text)',
  outline: 'none',
  fontFamily: 'var(--warm-font)',
  width: '100%',
};
