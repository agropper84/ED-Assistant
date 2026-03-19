'use client';

import { useState, useEffect, useMemo } from 'react';
import { Patient } from '@/lib/google-sheets';
import { MEDICAL_SUGGESTIONS } from '@/lib/medical-suggestions';
import { X, Loader2, Save, ExternalLink, RefreshCw, Check } from 'lucide-react';
import { ExamToggles } from '@/components/ExamToggles';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { AutocompleteTextarea } from '@/components/AutocompleteTextarea';
import { getEffectivePromptTemplates } from '@/lib/settings';
import { savePhrasesInBackground } from '@/lib/user-phrases';

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
  const [preRecordTranscript, setPreRecordTranscript] = useState('');
  const [encounterNotes, setEncounterNotes] = useState('');
  const [preRecordEncounterNotes, setPreRecordEncounterNotes] = useState('');
  const [triageVitals, setTriageVitals] = useState('');
  const [additional, setAdditional] = useState('');
  const [preRecordAdditional, setPreRecordAdditional] = useState('');
  const [pastDocs, setPastDocs] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [userPhrases, setUserPhrases] = useState<string[]>([]);

  // Fetch user's saved phrases for autocomplete
  useEffect(() => {
    if (isOpen) {
      fetch('/api/user-phrases')
        .then(r => r.ok ? r.json() : { phrases: [] })
        .then(data => setUserPhrases(data.phrases || []))
        .catch(() => {});
    }
  }, [isOpen]);

  // Merge static corpus with user phrases (user phrases first for priority)
  const allSuggestions = useMemo(
    () => {
      const set = new Set<string>(userPhrases);
      for (const s of MEDICAL_SUGGESTIONS) set.add(s);
      return Array.from(set);
    },
    [userPhrases]
  );

  // Sync state when patient changes
  useEffect(() => {
    if (patient) {
      // Use dedicated encounterNotes column if available, fall back to splitting combined transcript
      if (patient.encounterNotes) {
        setTranscript(patient.transcript || '');
        setEncounterNotes(patient.encounterNotes);
      } else {
        const { transcript: t, encounterNotes: en } = splitTranscriptAndNotes(patient.transcript || '');
        setTranscript(t);
        setEncounterNotes(en);
      }
      setTriageVitals(patient.triageVitals || '');
      setAdditional(patient.additional || '');
      setPastDocs(patient.pastDocs || '');
    }
  }, [patient]);

  if (!isOpen || !patient) return null;

  const combinedTranscript = combineTranscriptAndNotes(transcript, encounterNotes);
  const hasChanges =
    transcript !== (patient.transcript || '') ||
    encounterNotes !== (patient.encounterNotes || '') ||
    triageVitals !== (patient.triageVitals || '') ||
    additional !== (patient.additional || '') ||
    pastDocs !== (patient.pastDocs || '');

  // Can generate note if any content exists beyond just triage/vitals
  const canGenerateNote = !!(
    transcript.trim() ||
    encounterNotes.trim() ||
    additional.trim() ||
    pastDocs.trim() ||
    patient.hpi ||
    patient.transcript?.replace(/--- ENCOUNTER NOTES ---[\s\S]*/, '').trim()
  );

  const handleSave = async () => {
    // Save user phrases for future autocomplete (fire-and-forget)
    savePhrasesInBackground(encounterNotes, additional);

    setSaving(true);
    try {
      await fetch(`/api/patients/${patient.rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _sheetName: patient.sheetName,
          transcript,
          encounterNotes,
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

  const patientContext = {
    age: patient.age,
    gender: patient.gender,
    chiefComplaint: triageVitals.split('\n')[0] || '',
  };

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center">
      <div className="bg-[var(--card-bg)] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
        {/* Header */}
        <div className="dash-header flex items-center justify-between px-5 py-4 sm:rounded-t-3xl">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--dash-text)' }}>
              {patient.name || 'Unknown'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--dash-text-muted)' }}>
              {patient.age && `${patient.age} `}{patient.gender && `${patient.gender} `}
              {patient.timestamp && `• ${patient.timestamp}`}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onNavigate}
              className="p-2 hover:bg-white/10 rounded-full"
              title="Open full detail"
            >
              <ExternalLink className="w-5 h-5" style={{ color: 'var(--dash-text-sub)' }} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
              <X className="w-5 h-5" style={{ color: 'var(--dash-text-sub)' }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Triage Notes */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
              Triage Notes & Vitals
            </label>
            <textarea
              value={triageVitals}
              onChange={(e) => setTriageVitals(e.target.value)}
              placeholder="Chief complaint, vitals, triage assessment..."
              className="w-full h-20 p-3 border border-[var(--input-border)] rounded-xl text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Transcript */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
              Transcript
            </label>
            <div className="relative">
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Audio transcript or dictation..."
                className="w-full h-28 p-3 pr-16 border border-[var(--input-border)] rounded-xl text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <div className="absolute top-1.5 right-1.5">
                <VoiceRecorder
                  mode="encounter"
                  showUpload
                  onTranscript={(text) => {
                    const base = preRecordTranscript || transcript;
                    setTranscript(base ? `${base}\n\n${text}` : text);
                  }}
                  onRecordingStart={() => setPreRecordTranscript(transcript)}
                  onInterimTranscript={(text) => {
                    setTranscript(preRecordTranscript ? `${preRecordTranscript}\n\n${text}` : text);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Encounter Notes */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
              Encounter Notes
            </label>
            <div className="relative">
              <AutocompleteTextarea
                value={encounterNotes}
                onChange={setEncounterNotes}
                suggestions={allSuggestions}
                placeholder="Physician notes, clinical observations, plan..."
                textareaClassName="w-full h-28 p-3 pr-10 border border-[var(--input-border)] rounded-xl text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                patientContext={patientContext}
              />
              <div className="absolute top-1.5 right-1.5 z-10">
                <VoiceRecorder
                  onTranscript={(text) => {
                    const base = preRecordEncounterNotes || encounterNotes;
                    setEncounterNotes(base ? `${base}\n${text}` : text);
                  }}
                  onRecordingStart={() => setPreRecordEncounterNotes(encounterNotes)}
                  onInterimTranscript={(text) => {
                    setEncounterNotes(preRecordEncounterNotes ? `${preRecordEncounterNotes}\n${text}` : text);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Additional Findings with Exam Toggles */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
              Additional Findings / Exam
            </label>
            <ExamToggles value={additional} onChange={setAdditional} />
            <div className="relative">
              <AutocompleteTextarea
                value={additional}
                onChange={setAdditional}
                suggestions={allSuggestions}
                placeholder="Exam findings, investigations, results, updates..."
                textareaClassName="w-full h-24 p-3 pr-10 border border-[var(--input-border)] rounded-xl text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                patientContext={patientContext}
              />
              <div className="absolute top-1.5 right-1.5 z-10">
                <VoiceRecorder
                  onTranscript={(text) => {
                    const base = preRecordAdditional || additional;
                    setAdditional(base ? `${base}\n${text}` : text);
                  }}
                  onRecordingStart={() => setPreRecordAdditional(additional)}
                  onInterimTranscript={(text) => {
                    setAdditional(preRecordAdditional ? `${preRecordAdditional}\n${text}` : text);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Past Documentation */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
              Past Documentation
            </label>
            <textarea
              value={pastDocs}
              onChange={(e) => setPastDocs(e.target.value)}
              placeholder="Previous visit notes, relevant history..."
              className="w-full h-20 p-3 border border-[var(--input-border)] rounded-xl text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
        </div>

        {/* Footer — matching ParseModal style */}
        <div className="px-5 py-4 pb-safe border-t border-[var(--border)] bg-[var(--bg-tertiary)] sm:rounded-b-3xl">
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (hasChanges) await handleSave();
                onClose();
              }}
              disabled={saving || generating}
              className="flex-1 py-3 min-h-[48px] bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl font-medium disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </button>
            {canGenerateNote && (
              <button
                onClick={async () => {
                  setGenerating(true);
                  try {
                    // Save first if there are changes
                    if (hasChanges) {
                      await fetch(`/api/patients/${patient.rowIndex}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          _sheetName: patient.sheetName,
                          transcript,
                          encounterNotes,
                          triageVitals,
                          additional,
                          pastDocs,
                        }),
                      });
                    }
                    const res = await fetch('/api/process', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        rowIndex: patient.rowIndex,
                        sheetName: patient.sheetName,
                        promptTemplates: getEffectivePromptTemplates(),
                      }),
                    });
                    if (res.ok) {
                      onSaved();
                      onClose();
                    }
                  } catch (error) {
                    console.error('Failed to generate:', error);
                  } finally {
                    setGenerating(false);
                  }
                }}
                disabled={generating || saving}
                className="flex-1 py-3 min-h-[48px] bg-emerald-600 dark:bg-emerald-500 text-white rounded-xl font-medium disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-emerald-700 dark:hover:bg-emerald-600 active:scale-[0.97] transition-all"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {patient.hasOutput ? 'Regenerate Note' : 'Generate Note'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
