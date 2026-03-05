'use client';

import { useState } from 'react';
import { X, Clipboard, Check, Loader2 } from 'lucide-react';
import { ExamToggles } from '@/components/ExamToggles';
import { VoiceRecorder } from '@/components/VoiceRecorder';

interface ParseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ParsedData) => void;
}

export interface ParsedData {
  name: string;
  age: string;
  gender: string;
  birthday: string;
  hcn: string;
  mrn: string;
  timestamp: string;
  triageVitals: string;
  transcript: string;
  additional: string;
  pastDocs: string;
}

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

export function ParseModal({ isOpen, onClose, onSave }: ParseModalProps) {
  const [pasteText, setPasteText] = useState('');
  const [triageVitals, setTriageVitals] = useState('');
  const [transcript, setTranscript] = useState('');
  const [encounterNotes, setEncounterNotes] = useState('');
  const [additional, setAdditional] = useState('');
  const [pastDocs, setPastDocs] = useState('');
  const [encounterTime, setEncounterTime] = useState('');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!pasteText.trim()) {
      setError('Please paste patient data first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });

      if (!res.ok) throw new Error('Failed to parse');

      const data = await res.json();
      const timestamp = encounterTime || data.timestamp;
      setParsedData({
        ...data,
        timestamp,
        triageVitals,
        transcript: combineTranscriptAndNotes(transcript, encounterNotes),
        additional,
        pastDocs,
      });
    } catch (e) {
      setError('Failed to parse patient data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (parsedData) {
      const timestamp = encounterTime || parsedData.timestamp;
      onSave({
        ...parsedData,
        timestamp,
        triageVitals,
        transcript: combineTranscriptAndNotes(transcript, encounterNotes),
        additional,
        pastDocs,
      });
      // Reset form
      setPasteText('');
      setTriageVitals('');
      setTranscript('');
      setEncounterNotes('');
      setAdditional('');
      setPastDocs('');
      setEncounterTime('');
      setParsedData(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center">
      <div className="bg-[var(--card-bg)] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Add Patient</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Paste Area */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Paste Meditech Data
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste patient info from Meditech..."
              className="w-full h-32 p-3 border border-[var(--input-border)] rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <button
              onClick={handleParse}
              disabled={loading || !pasteText.trim()}
              className="mt-2 w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Clipboard className="w-4 h-4" />
              )}
              Parse Data
            </button>
          </div>

          {/* Parsed Result */}
          {parsedData && (
            <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg p-3 animate-fadeIn">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-medium mb-2">
                <Check className="w-4 h-4" />
                Parsed Successfully
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-[var(--text-muted)]">Name:</span> <span className="text-[var(--text-primary)]">{parsedData.name}</span></div>
                <div><span className="text-[var(--text-muted)]">Age:</span> <span className="text-[var(--text-primary)]">{parsedData.age} {parsedData.gender}</span></div>
                <div><span className="text-[var(--text-muted)]">DOB:</span> <span className="text-[var(--text-primary)]">{parsedData.birthday}</span></div>
                <div><span className="text-[var(--text-muted)]">HCN:</span> <span className="text-[var(--text-primary)]">{parsedData.hcn}</span></div>
                <div><span className="text-[var(--text-muted)]">MRN:</span> <span className="text-[var(--text-primary)]">{parsedData.mrn}</span></div>
                <div><span className="text-[var(--text-muted)]">Time:</span> <span className="text-[var(--text-primary)]">{encounterTime || parsedData.timestamp}</span></div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Encounter Time Override */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Encounter Time (optional override)
            </label>
            <input
              type="time"
              value={encounterTime}
              onChange={(e) => setEncounterTime(e.target.value)}
              className="w-full p-3 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
            />
          </div>

          {/* Triage Notes */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Triage Notes & Vitals (optional)
            </label>
            <textarea
              value={triageVitals}
              onChange={(e) => setTriageVitals(e.target.value)}
              placeholder="Chief complaint, vitals, triage assessment..."
              className="w-full h-24 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Transcript */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                Transcript (optional)
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
              Encounter Notes (optional)
            </label>
            <textarea
              value={encounterNotes}
              onChange={(e) => setEncounterNotes(e.target.value)}
              placeholder="Physician notes, clinical observations, plan..."
              className="w-full h-28 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Additional Findings */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Additional Findings (optional)
            </label>
            <ExamToggles value={additional} onChange={setAdditional} />
            <textarea
              value={additional}
              onChange={(e) => setAdditional(e.target.value)}
              placeholder="Exam findings, investigations, plan notes..."
              className="w-full h-24 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Past Documentation */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Past Documentation (optional)
            </label>
            <textarea
              value={pastDocs}
              onChange={(e) => setPastDocs(e.target.value)}
              placeholder="Previous visit notes, relevant history..."
              className="w-full h-24 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--bg-tertiary)]">
          <button
            onClick={handleSave}
            disabled={!parsedData}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:bg-gray-400 dark:disabled:bg-gray-600 active:scale-[0.97] transition-all"
          >
            Save Patient
          </button>
        </div>
      </div>
    </div>
  );
}
