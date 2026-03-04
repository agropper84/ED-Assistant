'use client';

import { useState, useEffect } from 'react';
import { Patient } from '@/lib/google-sheets';
import { X, Loader2, Save, ExternalLink } from 'lucide-react';
import { ExamToggles } from '@/components/ExamToggles';

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
}

export function PatientDataModal({ patient, isOpen, onClose, onSaved, onNavigate }: PatientDataModalProps) {
  const [transcript, setTranscript] = useState('');
  const [encounterNotes, setEncounterNotes] = useState('');
  const [triageVitals, setTriageVitals] = useState('');
  const [additional, setAdditional] = useState('');
  const [pastDocs, setPastDocs] = useState('');
  const [saving, setSaving] = useState(false);

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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">
              {patient.patientNum && `#${patient.patientNum} `}{patient.name || 'Unknown'}
            </h2>
            <p className="text-sm text-gray-500">
              {patient.age && `${patient.age} `}{patient.gender && `${patient.gender} `}
              {patient.timestamp && `• ${patient.timestamp}`}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onNavigate}
              className="p-2 hover:bg-gray-100 rounded-full"
              title="Open full detail"
            >
              <ExternalLink className="w-5 h-5 text-gray-500" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Triage Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Triage Notes & Vitals
            </label>
            <textarea
              value={triageVitals}
              onChange={(e) => setTriageVitals(e.target.value)}
              placeholder="Chief complaint, vitals, triage assessment..."
              className="w-full h-20 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Transcript */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Transcript
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Audio transcript or dictation..."
              className="w-full h-28 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Encounter Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Encounter Notes
            </label>
            <textarea
              value={encounterNotes}
              onChange={(e) => setEncounterNotes(e.target.value)}
              placeholder="Physician notes, clinical observations, plan..."
              className="w-full h-28 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Additional Findings with Exam Toggles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Findings / Exam
            </label>
            <ExamToggles value={additional} onChange={setAdditional} />
            <textarea
              value={additional}
              onChange={(e) => setAdditional(e.target.value)}
              placeholder="Exam findings, investigations, results, updates..."
              className="w-full h-24 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Past Documentation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Past Documentation
            </label>
            <textarea
              value={pastDocs}
              onChange={(e) => setPastDocs(e.target.value)}
              placeholder="Previous visit notes, relevant history..."
              className="w-full h-20 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:bg-gray-300 flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
          <button
            onClick={onNavigate}
            className="py-3 px-4 bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Full View
          </button>
        </div>
      </div>
    </div>
  );
}
