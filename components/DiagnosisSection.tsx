'use client';

import { useState, useEffect } from 'react';
import { Patient } from '@/lib/google-sheets';
import { Loader2, FileText, Pencil, Save, RefreshCw } from 'lucide-react';

export function DiagnosisSection({
  patient,
  onSave,
}: {
  patient: Patient;
  onSave: (fields: Record<string, string>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [diagnosis, setDiagnosis] = useState(patient.diagnosis || '');
  const [icd9, setIcd9] = useState(patient.icd9 || '');
  const [icd10, setIcd10] = useState(patient.icd10 || '');
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDiagnosis(patient.diagnosis || '');
    setIcd9(patient.icd9 || '');
    setIcd10(patient.icd10 || '');
  }, [patient.diagnosis, patient.icd9, patient.icd10]);

  const handleLookup = async () => {
    if (!diagnosis.trim()) return;
    setLookingUp(true);
    try {
      const res = await fetch('/api/icd-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosis: diagnosis.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setDiagnosis(data.diagnosis || diagnosis);
        setIcd9(data.icd9 || '');
        setIcd10(data.icd10 || '');
      }
    } catch (err) {
      console.error('ICD lookup failed:', err);
    } finally {
      setLookingUp(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ diagnosis, icd9, icd10 });
      setEditing(false);
    } catch (err) {
      console.error('Failed to save diagnosis:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasDiagnosis = patient.diagnosis || patient.icd9 || patient.icd10;

  if (!hasDiagnosis && !editing) return null;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <h3 className="font-semibold text-sm text-[var(--text-primary)]">Diagnosis & ICD Codes</h3>
        </div>
        {!editing && hasDiagnosis && (
          <button onClick={() => setEditing(true)} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors">
            <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
        )}
      </div>
      <div className="p-4">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Diagnosis</label>
              <div className="flex gap-2">
                <input type="text" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Enter diagnosis..."
                  className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]" autoFocus />
                <button onClick={handleLookup} disabled={lookingUp || !diagnosis.trim()}
                  className="px-3 py-2 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0" title="Look up ICD codes">
                  {lookingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  ICD Lookup
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">ICD-9</label>
                <input type="text" value={icd9} onChange={(e) => setIcd9(e.target.value)} placeholder="e.g. 462"
                  className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">ICD-10</label>
                <input type="text" value={icd10} onChange={(e) => setIcd10(e.target.value)} placeholder="e.g. J02.9"
                  className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 active:scale-[0.97] transition-all">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
              <button onClick={() => { setDiagnosis(patient.diagnosis || ''); setIcd9(patient.icd9 || ''); setIcd10(patient.icd10 || ''); setEditing(false); }}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:scale-[0.97] transition-all">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="font-medium text-[var(--text-primary)]">{patient.diagnosis}</div>
            {(patient.icd9 || patient.icd10) && (
              <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                {patient.icd9 && <span className="px-2 py-0.5 bg-[var(--bg-tertiary)] rounded font-mono">ICD-9: {patient.icd9}</span>}
                {patient.icd10 && <span className="px-2 py-0.5 bg-[var(--bg-tertiary)] rounded font-mono">ICD-10: {patient.icd10}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
