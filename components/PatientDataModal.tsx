'use client';

import { useState, useEffect } from 'react';
import { Patient } from '@/lib/google-sheets';
import { X, Loader2, Save, ExternalLink, RefreshCw } from 'lucide-react';
import { ExamToggles } from '@/components/ExamToggles';
import { VoiceRecorder } from '@/components/VoiceRecorder';

/** Combine transcript + encounter notes into one string for storage */
function combineTranscriptAndNotes(transcript: string, encounterNotes: string): string {
  const parts: string[] = [];
  if (transcript.trim()) parts.push(transcript.trim());
  if (encounterNotes.trim()) parts.push(`--- ENCOUNTER NOTES ---\n${encounterNotes.trim()}`);
  return parts.join('\n\n');
}

/** Split stored transcript back into transcript + encounter notes */
function splitTranscriptAndNotes(combined: string): { transcript: string; encounterNotes: string } {
  const separator = '--- ENCOUNTER NOTES ---';
  const idx = combined.indexOf(separator);
  if (idx === -1) return { transcript: combined, encounterNotes: '' };
  return {
    transcript: combined.substring(0, idx).trim(),
    encounterNotes: combined.substring(idx + separator.length).trim(),
  };
}

interface PatientDataModalProps {
  patient: Patient | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onNavigate: () => void;
  onRegenerate?: () => void;
}

export function PatientDataModal({ patient, isOpen, onClose, onSaved, onNavigate, onRegenerate }: PatientDataModalProps) {
  const [transcript, setTranscript] = useState('');
  const [encounterNotes, setEncounterNotes] = useState('');
  const [triageVitals, setTriageVitals] = useState('');
  const [additional, setAdditional] = useState('');
  const [pastDocs, setPastDocs] = useState('');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Sync state when patient changes
  useEffect(() => {
    if (patient) {
      const { transcript: t, encounterNotes: en } = splitTranscriptAndNotes(patient.transcript || '');
      setTranscript(t);
      setEncounterNotes(en);
      setTriageVitals(patient.triageVitals || '');
      setAdditional(patient.additional || '');
      setPastDocs(patient.pastDocs || '');
    }
  }, [patient]);

  if (!isOpen || !patient) return null;

  const combinedTranscript = combineTranscriptAndNotes(transcript, encounterNotes);
  const hasChanges =
    combinedTranscript !== (patient.transcript || '') ||
    triageVitals !== (patient.triageVitals || '') ||
    additional !== (patient.additional || '') ||
    pastDocs !== (patient.pastDocs || '');

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/patients/${patient.rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _sheetName: patient.sheetName,
          transcript: combinedTranscript,
          triageVitals,
          additional,
          pastDocs,
        }),
      });
      onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center">
      <div className="bg-[var(--card-bg)] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">
              {patient.name || 'Unknown'}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {patient.age && `${patient.age} `}{patient.gender && `${patient.gender} `}
              {patient.timestamp && `• ${patient.timestamp}`}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onNavigate}
              className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full"
              title="Open full detail"
            >
              <ExternalLink className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full">
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Triage Notes */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Triage Notes & Vitals
            </label>
            <textarea
              value={triageVitals}
              onChange={(e) => setTriageVitals(e.target.value)}
              placeholder="Chief complaint, vitals, triage assessment..."
              className="w-full h-20 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Transcript */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                Transcript
              </label>
              <VoiceRecorder
                onTranscript={(text) => setTranscript(prev => prev ? `${prev}\n\n${text}` : text)}
              />
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Audio transcript or dictation..."
              className="w-full h-28 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Encounter Notes */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Encounter Notes
            </label>
            <textarea
              value={encounterNotes}
              onChange={(e) => setEncounterNotes(e.target.value)}
              placeholder="Physician notes, clinical observations, plan..."
              className="w-full h-28 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Additional Findings with Exam Toggles */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Additional Findings / Exam
            </label>
            <ExamToggles value={additional} onChange={setAdditional} />
            <textarea
              value={additional}
              onChange={(e) => setAdditional(e.target.value)}
              placeholder="Exam findings, investigations, results, updates..."
              className="w-full h-24 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Past Documentation */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Past Documentation
            </label>
            <textarea
              value={pastDocs}
              onChange={(e) => setPastDocs(e.target.value)}
              placeholder="Previous visit notes, relevant history..."
              className="w-full h-20 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--bg-tertiary)] flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || regenerating || !hasChanges}
            className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:bg-gray-400 dark:disabled:bg-gray-600 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
          {patient.hasOutput && onRegenerate && (
            <button
              onClick={async () => {
                setRegenerating(true);
                try {
                  // Save first if there are changes
                  if (hasChanges) {
                    await fetch(`/api/patients/${patient.rowIndex}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        _sheetName: patient.sheetName,
                        transcript: combineTranscriptAndNotes(transcript, encounterNotes),
                        triageVitals,
                        additional,
                        pastDocs,
                      }),
                    });
                  }
                  // Regenerate
                  const res = await fetch('/api/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      rowIndex: patient.rowIndex,
                      sheetName: patient.sheetName,
                    }),
                  });
                  if (res.ok) {
                    onSaved();
                    onClose();
                  }
                } catch (error) {
                  console.error('Failed to regenerate:', error);
                } finally {
                  setRegenerating(false);
                }
              }}
              disabled={regenerating || saving}
              className="py-3 px-4 bg-amber-500 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
            >
              {regenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate
            </button>
          )}
          <button
            onClick={onNavigate}
            className="py-3 px-4 bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Full View
          </button>
        </div>
      </div>
    </div>
  );
}
