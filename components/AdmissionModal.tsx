'use client';

import { useState } from 'react';
import { X, Loader2, FilePlus } from 'lucide-react';
import { getSettings } from '@/lib/settings';

interface AdmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowIndex: number;
  sheetName?: string;
  onGenerated: () => void;
}

const COMMON_SERVICES = [
  'Internal Medicine', 'General Surgery', 'Cardiology', 'Respirology', 'Neurology',
  'Orthopedics', 'Gastroenterology', 'Nephrology', 'Psychiatry', 'Pediatrics',
  'Obstetrics/Gynecology', 'ICU/Critical Care', 'Hospitalist', 'Geriatrics',
  'Oncology', 'Hematology', 'Infectious Disease', 'Trauma Surgery',
];

export function AdmissionModal({ isOpen, onClose, rowIndex, sheetName, onGenerated }: AdmissionModalProps) {
  const [service, setService] = useState('');
  const [acuity, setAcuity] = useState<'stable' | 'acute' | 'critical'>('acute');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!service.trim() || !reason.trim()) {
      setError('Please provide admitting service and reason for admission');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex,
          sheetName,
          service: service.trim(),
          acuity,
          reason: reason.trim(),
          customInstructions: getSettings().admissionInstructions || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate admission note');
      }

      setService('');
      setAcuity('acute');
      setReason('');
      onGenerated();
    } catch (e: any) {
      setError(e.message || 'Failed to generate admission note');
    } finally {
      setLoading(false);
    }
  };

  const acuityOptions = [
    { value: 'stable' as const, label: 'Stable', color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950/50 dark:text-green-300 dark:border-green-700' },
    { value: 'acute' as const, label: 'Acute', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700' },
    { value: 'critical' as const, label: 'Critical', color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-700' },
  ];

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center">
      <div className="bg-[var(--card-bg)] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Generate Admission Note</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Admitting Service
            </label>
            <input
              type="text"
              list="services"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="e.g., Internal Medicine"
              className="w-full p-3 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <datalist id="services">
              {COMMON_SERVICES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Acuity
            </label>
            <div className="flex gap-2">
              {acuityOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAcuity(opt.value)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                    acuity === opt.value
                      ? opt.color
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Reason for Admission
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for admission, key clinical concerns, and any specific admission orders..."
              className="w-full h-32 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--bg-tertiary)]">
          <button
            onClick={handleGenerate}
            disabled={loading || !service.trim() || !reason.trim()}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FilePlus className="w-4 h-4" />
                Generate Admission Note
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
