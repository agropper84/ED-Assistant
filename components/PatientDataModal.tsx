'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Patient } from '@/lib/google-sheets';
import { MEDICAL_SUGGESTIONS } from '@/lib/medical-suggestions';
import { X, Loader2, Save, ExternalLink, RefreshCw, Check, Heart, ArrowUpCircle } from 'lucide-react';
import { PatientProfile } from '@/components/PatientProfile';
import type { PatientProfile as ProfileData } from '@/app/api/profile/route';
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
  const [showLiveTranscript, setShowLiveTranscript] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const hasChangesRef = useRef(false);
  const [submitting, setSubmitting] = useState<string | null>(null); // field name being submitted
  const [submitted, setSubmitted] = useState<string | null>(null); // field name just submitted (for checkmark)

  const handleSectionSubmit = async (field: string, content: string) => {
    if (!patient || !content.trim() || submitting) return;
    setSubmitting(field);
    try {
      const res = await fetch(`/api/patients/${patient.rowIndex}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, content, sheetName: patient.sheetName }),
      });
      if (res.ok) {
        setSubmitted(field);
        onSaved();
        // Update profile data if profile panel is open
        if (showProfile) {
          setGeneratingProfile(true);
          fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName }),
          }).then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.profile) setProfileData(data.profile); })
            .catch(() => {})
            .finally(() => setGeneratingProfile(false));
        }
        setTimeout(() => setSubmitted(null), 2000);
      }
    } catch (e) {
      console.error('Section submit failed:', e);
    } finally {
      setSubmitting(null);
    }
  };

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

  // Parse profile JSON when patient loads
  useEffect(() => {
    if (patient?.profile) {
      try { setProfileData(JSON.parse(patient.profile)); } catch { setProfileData(null); }
    } else {
      setProfileData(null);
    }
  }, [patient?.profile]);

  const handleGenerateProfile = async () => {
    if (!patient) return;
    setGeneratingProfile(true);
    try {
      // Save current data first if changed
      if (hasChangesRef.current) {
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
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data.profile);
      }
    } catch (error) {
      console.error('Failed to generate profile:', error);
    } finally {
      setGeneratingProfile(false);
    }
  };

  if (!isOpen || !patient) return null;

  const combinedTranscript = combineTranscriptAndNotes(transcript, encounterNotes);
  const hasChanges =
    transcript !== (patient.transcript || '') ||
    encounterNotes !== (patient.encounterNotes || '') ||
    triageVitals !== (patient.triageVitals || '') ||
    additional !== (patient.additional || '') ||
    pastDocs !== (patient.pastDocs || '');
  hasChangesRef.current = hasChanges;

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
      // Auto-update medical profile in background
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName }),
      }).catch(() => {});
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
      <div className="bg-[var(--card-bg)] w-full sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp" style={{ maxWidth: showProfile ? '48rem' : '32rem', transition: 'max-width 500ms cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: 'var(--card-shadow-elevated)' }}>
        {/* Header */}
        <div className="dash-header flex items-center gap-3 px-4 py-4 sm:rounded-t-3xl">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full flex-shrink-0" title="Close">
            <X className="w-5 h-5" style={{ color: 'var(--dash-text-sub)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--dash-text)' }}>
              Add Clinical Information
            </h2>
            <p className="text-sm" style={{ color: 'var(--dash-text-muted)' }}>
              {patient.name || 'Unknown'}
              {patient.age && ` • ${patient.age}`}{patient.gender && ` ${patient.gender}`}
              {patient.timestamp && ` • ${patient.timestamp}`}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Mobile-only profile toggle */}
            <button
              onClick={() => {
                const opening = !showProfile;
                setShowProfile(opening);
                if (opening && !profileData && !generatingProfile) handleGenerateProfile();
              }}
              className={`sm:hidden p-2 rounded-full transition-all ${showProfile ? 'bg-blue-500/20' : 'hover:bg-white/10'}`}
              title={showProfile ? 'Hide profile' : 'Show profile'}
            >
              <Heart className="w-4 h-4" fill={profileData ? 'currentColor' : 'none'} style={{ color: profileData ? '#93c5fd' : 'var(--dash-text-sub)' }} />
            </button>
            <button
              onClick={onNavigate}
              className="p-2 hover:bg-white/10 rounded-full"
              title="Open full detail"
            >
              <ExternalLink className="w-5 h-5" style={{ color: 'var(--dash-text-sub)' }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
        <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-4">
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
            <button
              onClick={() => handleSectionSubmit('triageVitals', triageVitals)}
              disabled={!triageVitals.trim() || !!submitting}
              className={`mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                submitted === 'triageVitals'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : triageVitals.trim()
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 active:scale-[0.98]'
                    : 'bg-transparent text-[var(--text-muted)] opacity-0'
              }`}
            >
              {submitting === 'triageVitals' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : submitted === 'triageVitals' ? <Check className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
              {submitted === 'triageVitals' ? 'Saved' : 'Submit'}
            </button>
          </div>

          {/* Transcript */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                Transcript
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showLiveTranscript}
                  onChange={(e) => setShowLiveTranscript(e.target.checked)}
                  className="w-3 h-3 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                />
                <span className="text-[10px] text-[var(--text-muted)]">Live text</span>
              </label>
            </div>
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
                  onInterimTranscript={showLiveTranscript ? (text) => {
                    setTranscript(preRecordTranscript ? `${preRecordTranscript}\n\n${text}` : text);
                  } : undefined}
                />
              </div>
            </div>
            <button
              onClick={() => handleSectionSubmit('transcript', transcript)}
              disabled={!transcript.trim() || !!submitting}
              className={`mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                submitted === 'transcript'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : transcript.trim()
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 active:scale-[0.98]'
                    : 'bg-transparent text-[var(--text-muted)] opacity-0'
              }`}
            >
              {submitting === 'transcript' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : submitted === 'transcript' ? <Check className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
              {submitted === 'transcript' ? 'Saved' : 'Submit'}
            </button>
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
            <button
              onClick={() => handleSectionSubmit('encounterNotes', encounterNotes)}
              disabled={!encounterNotes.trim() || !!submitting}
              className={`mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                submitted === 'encounterNotes'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : encounterNotes.trim()
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 active:scale-[0.98]'
                    : 'bg-transparent text-[var(--text-muted)] opacity-0'
              }`}
            >
              {submitting === 'encounterNotes' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : submitted === 'encounterNotes' ? <Check className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
              {submitted === 'encounterNotes' ? 'Saved' : 'Submit'}
            </button>
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
            <button
              onClick={() => handleSectionSubmit('additional', additional)}
              disabled={!additional.trim() || !!submitting}
              className={`mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                submitted === 'additional'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : additional.trim()
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 active:scale-[0.98]'
                    : 'bg-transparent text-[var(--text-muted)] opacity-0'
              }`}
            >
              {submitting === 'additional' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : submitted === 'additional' ? <Check className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
              {submitted === 'additional' ? 'Saved' : 'Submit'}
            </button>
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
            <button
              onClick={() => handleSectionSubmit('pastDocs', pastDocs)}
              disabled={!pastDocs.trim() || !!submitting}
              className={`mt-1.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                submitted === 'pastDocs'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : pastDocs.trim()
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 active:scale-[0.98]'
                    : 'bg-transparent text-[var(--text-muted)] opacity-0'
              }`}
            >
              {submitting === 'pastDocs' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : submitted === 'pastDocs' ? <Check className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
              {submitted === 'pastDocs' ? 'Saved' : 'Submit'}
            </button>
          </div>
        </div>

        {/* Profile panel — slides in/out */}
        <div
          className="flex-shrink-0 overflow-hidden"
          style={{
            width: showProfile ? 'calc(50% - 8px)' : '0',
            transition: 'width 500ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="h-full overflow-y-auto px-4 py-4 border-l border-[var(--border)]" style={{ minWidth: '250px' }}>
            <PatientProfile
              profile={profileData}
              age={patient.age}
              gender={patient.gender}
              onGenerate={handleGenerateProfile}
              generating={generatingProfile}
            />
          </div>
        </div>

        {/* Right edge — profile toggle (desktop), always far-right */}
        <div
          className="hidden sm:flex flex-shrink-0 items-stretch cursor-pointer relative group/edge"
          style={{ width: '5px', transition: 'width 600ms cubic-bezier(0.23, 1, 0.32, 1)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.width = '14px'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.width = '5px'; }}
          onClick={() => {
            const opening = !showProfile;
            setShowProfile(opening);
            if (opening && !profileData && !generatingProfile) handleGenerateProfile();
          }}
          title={showProfile ? 'Hide profile' : 'Show profile'}
        >
          {/* Idle line — subtle, theme-matched */}
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none group-hover/edge:opacity-0"
            style={{
              top: '15%', bottom: '15%', width: '1px',
              background: 'linear-gradient(to bottom, transparent, var(--edge-idle) 20%, var(--edge-idle) 80%, transparent)',
              opacity: 1,
              transition: 'opacity 500ms ease',
            }}
          />
          {/* Hover glow fill */}
          <div
            className="absolute inset-0 rounded-full opacity-0 group-hover/edge:opacity-100 pointer-events-none"
            style={{
              top: '8%', bottom: '8%',
              background: 'linear-gradient(to bottom, transparent, var(--edge-glow) 20%, var(--edge-glow) 50%, var(--edge-glow) 80%, transparent)',
              transition: 'opacity 600ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          />
          {/* Hover center line */}
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full opacity-0 group-hover/edge:opacity-100 pointer-events-none"
            style={{
              top: '10%', bottom: '10%', width: '1.5px',
              background: 'linear-gradient(to bottom, transparent, var(--edge-line) 20%, var(--edge-line) 50%, var(--edge-line) 80%, transparent)',
              transition: 'opacity 600ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
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
                      // Auto-update medical profile in background
                      fetch('/api/profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName }),
                      }).catch(() => {});
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
