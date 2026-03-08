'use client';

import { useState } from 'react';
import { Patient } from '@/lib/google-sheets';
import { X, Loader2, Search, Merge } from 'lucide-react';

interface MergeModalProps {
  source: Patient;
  patients: Patient[];
  onMerge: (sourceRowIndex: number, targetRowIndex: number) => Promise<void>;
  onClose: () => void;
}

export function MergeModal({ source, patients, onMerge, onClose }: MergeModalProps) {
  const [search, setSearch] = useState('');
  const [merging, setMerging] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Patient | null>(null);

  const targets = patients.filter(
    (p) =>
      p.rowIndex !== source.rowIndex &&
      !p.name?.startsWith('New Encounter') &&
      (search === '' ||
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.diagnosis?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleMerge = async (target: Patient) => {
    setMerging(true);
    try {
      await onMerge(source.rowIndex, target.rowIndex);
      onClose();
    } catch (err) {
      console.error('Merge failed:', err);
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card-bg)] rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)]">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">Assign to Patient</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Merge transcript from <span className="font-medium">{source.name}</span> into an existing patient
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--bg-tertiary)] rounded-full">
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Confirm dialog */}
        {confirmTarget ? (
          <div className="p-6 text-center space-y-4">
            {merging ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-sm text-[var(--text-secondary)]">Merging...</p>
              </div>
            ) : (
              <>
                <Merge className="w-8 h-8 text-blue-500 mx-auto" />
                <p className="text-sm text-[var(--text-primary)]">
                  Merge transcript from <span className="font-semibold">{source.name}</span> into{' '}
                  <span className="font-semibold">{confirmTarget.name || `Patient #${confirmTarget.patientNum}`}</span>?
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  The transcript will be appended and the {source.name} row will be cleared.
                </p>
                <div className="flex gap-2 justify-center pt-2">
                  <button
                    onClick={() => handleMerge(confirmTarget)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    Merge
                  </button>
                  <button
                    onClick={() => setConfirmTarget(null)}
                    className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="p-3 border-b border-[var(--card-border)]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search patients..."
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Patient list */}
            <div className="flex-1 overflow-y-auto p-2">
              {targets.length === 0 ? (
                <p className="text-center text-sm text-[var(--text-muted)] py-8">
                  {search ? 'No matching patients' : 'No other patients to merge into'}
                </p>
              ) : (
                <div className="space-y-1">
                  {targets.map((p) => (
                    <button
                      key={p.rowIndex}
                      onClick={() => setConfirmTarget(p)}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <div className="font-medium text-sm text-[var(--text-primary)]">
                        {p.name || `Patient #${p.patientNum}`}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] flex gap-3">
                        {p.age && <span>{p.age}{p.gender && ` ${p.gender}`}</span>}
                        {p.diagnosis && <span>{p.diagnosis}</span>}
                        {p.transcript && <span className="text-green-500">Has transcript</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
