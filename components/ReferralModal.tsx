'use client';

import { useState } from 'react';
import { X, Loader2, Send } from 'lucide-react';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowIndex: number;
  sheetName?: string;
  onGenerated: () => void;
}

const COMMON_SPECIALTIES = [
  'Cardiology', 'Dermatology', 'ENT', 'Gastroenterology', 'General Surgery',
  'Internal Medicine', 'Nephrology', 'Neurology', 'Obstetrics/Gynecology',
  'Ophthalmology', 'Orthopedics', 'Pediatrics', 'Psychiatry', 'Pulmonology',
  'Radiology', 'Rheumatology', 'Urology', 'Vascular Surgery',
];

export function ReferralModal({ isOpen, onClose, rowIndex, sheetName, onGenerated }: ReferralModalProps) {
  const [specialty, setSpecialty] = useState('');
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergent'>('routine');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!specialty.trim() || !reason.trim()) {
      setError('Please provide specialty and reason for referral');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex,
          sheetName,
          specialty: specialty.trim(),
          urgency,
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate referral');
      }

      // Reset and close
      setSpecialty('');
      setUrgency('routine');
      setReason('');
      onGenerated();
    } catch (e: any) {
      setError(e.message || 'Failed to generate referral');
    } finally {
      setLoading(false);
    }
  };

  const urgencyOptions = [
    { value: 'routine' as const, label: 'Routine', color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950/50 dark:text-green-300 dark:border-green-700' },
    { value: 'urgent' as const, label: 'Urgent', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700' },
    { value: 'emergent' as const, label: 'Emergent', color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-700' },
  ];

  return (
    <div className="fixed inset-0 bg-[var(--overlay)] z-50 flex items-end sm:items-center justify-center">
      <div className="bg-[var(--card-bg)] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Generate Referral</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Specialty */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Specialty
            </label>
            <input
              type="text"
              list="specialties"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="e.g., Cardiology"
              className="w-full p-3 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <datalist id="specialties">
              {COMMON_SPECIALTIES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Urgency
            </label>
            <div className="flex gap-2">
              {urgencyOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setUrgency(opt.value)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                    urgency === opt.value
                      ? opt.color
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Reason for Referral
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for referral and any specific questions for the consultant..."
              className="w-full h-32 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-tertiary)]">
          <button
            onClick={handleGenerate}
            disabled={loading || !specialty.trim() || !reason.trim()}
            className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Generate Referral
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
