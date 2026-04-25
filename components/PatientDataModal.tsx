'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Patient } from '@/lib/google-sheets';
import { getMedicalSuggestions } from '@/lib/medical-suggestions';
import { X, Loader2, Save, ExternalLink, RefreshCw, Check, Heart, ArrowUpCircle, FileText, Trash2, ListTree, Mic } from 'lucide-react';
import { PatientProfile } from '@/components/PatientProfile';
import type { PatientProfile as ProfileData } from '@/app/api/profile/route';
import { ExamToggles } from '@/components/ExamToggles';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { AutocompleteTextarea } from '@/components/AutocompleteTextarea';
import { getEffectivePromptTemplates, getSettings } from '@/lib/settings';
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
  onGenerated?: () => void;
}

export function PatientDataModal({ patient, isOpen, onClose, onSaved, onNavigate, onRegenerate, onGenerated }: PatientDataModalProps) {
  const [noteStyle, setNoteStyle] = useState<'standard' | 'comprehensive' | 'complete-exam'>('standard');
  const [customInstructions, setCustomInstructions] = useState('');
  const [showCustomInstructions, setShowCustomInstructions] = useState(false);
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
  const [showLiveTranscript, setShowLiveTranscript] = useState(false);
  const [micSensitivity, setMicSensitivity] = useState(2); // 0.5-4x range, default 2x
  const [encounterDetail, setEncounterDetail] = useState(3); // 1-5: Minimal/Brief/Standard/Detailed/Comprehensive
  const [isRecordingEncounter, setIsRecordingEncounter] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [audioData, setAudioData] = useState({ level: 0, lowFreq: 0, highFreq: 0, speakerHint: 'silent' as 'near' | 'far' | 'silent' });
  const [waveHistory, setWaveHistory] = useState<Array<{ level: number; speaker: 'near' | 'far' | 'silent' }>>([]);
  const waveFrameCountRef = useRef(0);
  const [processingWord, setProcessingWord] = useState(0);
  const [speakerNames, setSpeakerNames] = useState({ s1: '', s2: '' });
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioBlobIv, setAudioBlobIv] = useState<string | null>(null);
  const [audioBlobContentType, setAudioBlobContentType] = useState<string>('audio/webm');
  const [audioBlobCreatedAt, setAudioBlobCreatedAt] = useState<string | null>(null);
  const [retranscribing, setRetranscribing] = useState(false);
  const [showRetranscribeOptions, setShowRetranscribeOptions] = useState(false);
  const [retranscribeHints, setRetranscribeHints] = useState('');
  const [refiningFields, setRefiningFields] = useState<Set<string>>(new Set());
  const setFieldRefining = (field: string, refining: boolean) => {
    setRefiningFields(prev => {
      const next = new Set(prev);
      if (refining) next.add(field); else next.delete(field);
      return next;
    });
  };
  const [activeTab, setActiveTab] = useState<'clinical' | 'profile' | 'ddx'>('clinical');
  const [sidePanel, setSidePanel] = useState<'profile' | 'ddx' | null>(null);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  // DDx tab state
  const [ddxData, setDdxData] = useState<{ keyQuestions: string; ddx: string; investigations: string } | null>(null);
  const [generatingDdx, setGeneratingDdx] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const hasChangesRef = useRef(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Array<{ id: string; field: string; content: string; submittedAt: string; title?: string; date?: string }>>([]);
  const [hoveredSub, setHoveredSub] = useState<string | null>(null);
  // Pending submit: shows inline title input before confirming
  const [pendingSubmit, setPendingSubmit] = useState<{ field: string; content: string } | null>(null);
  const [submitTitle, setSubmitTitle] = useState('');

  // Map field → state setter for clearing after submit
  const fieldSetters: Record<string, (v: string) => void> = {
    triageVitals: setTriageVitals,
    transcript: setTranscript,
    encounterNotes: setEncounterNotes,
    additional: setAdditional,
    pastDocs: setPastDocs,
  };

  const startSubmit = (field: string, content: string) => {
    if (!content.trim()) return;
    setPendingSubmit({ field, content });
    setSubmitTitle('');
  };

  const cancelSubmit = () => {
    setPendingSubmit(null);
    setSubmitTitle('');
  };

  const confirmSubmit = async () => {
    if (!patient || !pendingSubmit) return;
    let { field, content } = pendingSubmit;
    // Replace canonical speaker labels with custom names before saving
    if (field === 'transcript') {
      if (speakerNames.s1) content = content.replace(/^Speaker 1:/gim, `${speakerNames.s1}:`);
      if (speakerNames.s2) content = content.replace(/^Speaker 2:/gim, `${speakerNames.s2}:`);
    }
    setSubmitting(field);
    setPendingSubmit(null);
    try {
      const res = await fetch(`/api/patients/${patient.rowIndex}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field, content, sheetName: patient.sheetName,
          patientName: patient.name, // identity verification
          ...(submitTitle.trim() ? { title: submitTitle.trim() } : {}),
        }),
      });
      if (res.status === 409) {
        const data = await res.json();
        alert(data.error || 'Patient identity mismatch. Please close and reopen.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Submit failed' }));
        console.error('Submit failed:', data.error);
        alert(`Submit failed: ${data.error || 'Unknown error'}. Please try again.`);
        return;
      }
      const data = await res.json();
      setSubmissions(prev => [...prev, data.entry]);
      if (fieldSetters[field]) fieldSetters[field]('');
      setSubmitted(field);
      onSaved();
      if (sidePanel === 'profile') {
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
    } catch (e) {
      console.error('Section submit failed:', e);
      alert('Submit failed — please check your connection and try again.');
    } finally {
      setSubmitting(null);
      setSubmitTitle('');
    }
  };

  // Legacy direct submit (kept for backward compat)
  const handleSectionSubmit = (field: string, content: string) => {
    startSubmit(field, content);
  };

  const deleteSubmission = async (sub: { id: string }) => {
    if (!patient) return;
    try {
      await fetch(`/api/patients/${patient.rowIndex}/submit`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: sub.id, sheetName: patient.sheetName }),
      });
      setSubmissions(prev => prev.filter(s => s.id !== sub.id));
    } catch {}
  };

  const SubmissionTags = ({ field }: { field: string }) => {
    const subs = submissions.filter(s => s.field === field);
    const isPending = pendingSubmit?.field === field;
    return (
      <>
        {/* Pending submit form — inline title input */}
        {isPending && (
          <div className="mb-1.5 animate-fadeIn">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={submitTitle}
                onChange={(e) => setSubmitTitle(e.target.value)}
                placeholder="Label, e.g. HPI, Plan, Exam (optional)"
                className="flex-1 px-2 py-1 border border-[var(--input-border)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-emerald-500"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') confirmSubmit(); if (e.key === 'Escape') cancelSubmit(); }}
              />
              <button
                onClick={confirmSubmit}
                className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 active:scale-[0.97] transition-all"
              >
                {submitting === field ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button
                onClick={cancelSubmit}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            </div>
            <p className="text-[9px] text-[var(--text-muted)] mt-0.5 pl-0.5">Add a label to help AI understand the content — or leave blank to submit without one</p>
          </div>
        )}
        {/* Existing submission tags */}
        {subs.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {subs.map(sub => (
              <div key={sub.id} className="relative group/tag">
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 cursor-default"
                  onMouseEnter={() => setHoveredSub(sub.id)}
                  onMouseLeave={() => setHoveredSub(null)}
                >
                  <FileText className="w-2.5 h-2.5" />
                  {sub.title || new Date(sub.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  <button
                    onClick={() => deleteSubmission(sub)}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors opacity-0 group-hover/tag:opacity-100"
                  >
                    <Trash2 className="w-2.5 h-2.5 text-red-500" />
                  </button>
                </span>
                {hoveredSub === sub.id && (
                  <div className="absolute z-50 bottom-full left-0 mb-1 w-64 max-h-32 overflow-y-auto p-2 rounded-lg text-xs bg-[var(--card-bg)] border border-[var(--card-border)] shadow-lg whitespace-pre-wrap text-[var(--text-secondary)]"
                    style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
                    {sub.title && <div className="font-semibold text-[var(--text-primary)] mb-0.5">{sub.title}</div>}
                    {sub.content.length > 300 ? sub.content.substring(0, 300) + '...' : sub.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  // Fetch user's saved phrases for autocomplete
  // Recording timer
  useEffect(() => {
    if (!isRecordingEncounter) { setRecordingElapsed(0); return; }
    const startTime = Date.now();
    setRecordingStartTime(startTime);
    setRecordingElapsed(0);
    const interval = setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecordingEncounter]);

  // Alternate processing/refining text
  useEffect(() => {
    const isProcessing = refiningFields.has('transcript') && !isRecordingEncounter;
    if (!isProcessing) return;
    const interval = setInterval(() => setProcessingWord(p => (p + 1) % 2), 2000);
    return () => clearInterval(interval);
  }, [refiningFields, isRecordingEncounter]);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/user-phrases')
        .then(r => r.ok ? r.json() : { phrases: [] })
        .then(data => setUserPhrases(data.phrases || []))
        .catch(() => {});
      fetch('/api/encryption-key')
        .then(r => r.ok ? r.json() : { key: null })
        .then(data => setEncryptionKey(data.key))
        .catch(() => {});
    }
  }, [isOpen]);

  // Merge static corpus with user phrases (user phrases first for priority)
  const allSuggestions = useMemo(
    () => {
      const set = new Set<string>(userPhrases);
      for (const s of getMedicalSuggestions()) set.add(s);
      return Array.from(set);
    },
    [userPhrases]
  );

  // Track which patient is currently loaded to detect actual patient changes vs data refreshes
  const currentPatientRef = useRef<string | null>(null);

  // Populate text fields from patient data
  const populateFromPatient = (p: Patient) => {
    if (p.encounterNotes) {
      setTranscript(p.transcript || '');
      setEncounterNotes(p.encounterNotes);
    } else {
      const { transcript: t, encounterNotes: en } = splitTranscriptAndNotes(p.transcript || '');
      setTranscript(t);
      setEncounterNotes(en);
    }
    setTriageVitals(p.triageVitals || '');
    setAdditional(p.additional || '');
    setPastDocs(p.pastDocs || '');
  };

  // Sync state when patient/modal changes
  useEffect(() => {
    if (!patient || !isOpen) return;

    const patientKey = `${patient.rowIndex}:${patient.sheetName}`;
    const isSamePatient = currentPatientRef.current === patientKey;

    if (!isSamePatient) {
      // NEW patient or modal just opened
      currentPatientRef.current = patientKey;

      // Clear everything — including profile state
      setTranscript('');
      setEncounterNotes('');
      setTriageVitals('');
      setAdditional('');
      setPastDocs('');
      setSubmissions([]);
      setHoveredSub(null);
      setPendingSubmit(null);
      setSubmitTitle('');
      setProfileData(null);
      setDdxData(null);
      setActiveTab('clinical');
      setGeneratingProfile(false);
      setGeneratingDdx(false);

      // Load audio backup info if available
      if (patient.audioBackup) {
        try {
          const backup = JSON.parse(patient.audioBackup);
          // Check if backup is still within retention window
          const retentionMs = (getSettings().audioRetentionHours || 12) * 60 * 60 * 1000;
          const age = Date.now() - new Date(backup.createdAt).getTime();
          if (age < retentionMs) {
            setAudioBlobUrl(backup.blobUrl || null);
            setAudioBlobIv(backup.iv || null);
            setAudioBlobContentType(backup.contentType || 'audio/webm');
            setAudioBlobCreatedAt(backup.createdAt || null);
          } else {
            // Expired
            setAudioBlobUrl(null); setAudioBlobIv(null); setAudioBlobCreatedAt(null);
          }
        } catch {
          setAudioBlobUrl(null); setAudioBlobIv(null); setAudioBlobCreatedAt(null);
        }
      } else {
        setAudioBlobUrl(null); setAudioBlobIv(null); setAudioBlobCreatedAt(null);
      }

      // Fetch submissions, then populate text boxes only for fields WITHOUT submissions
      fetch(`/api/patients/${patient.rowIndex}/submit?sheet=${encodeURIComponent(patient.sheetName)}&name=${encodeURIComponent(patient.name || '')}`)
        .then(r => r.ok ? r.json() : { submissions: [] })
        .then(data => {
          const subs: Array<{ id: string; field: string; content: string; submittedAt: string; title?: string; date?: string }> = data.submissions || [];
          setSubmissions(subs);

          // Fields that have submissions → leave text box empty (content is in tags)
          // Fields without submissions → populate from patient data (Sheet)
          const submittedFields = new Set(subs.map(s => s.field));

          if (!submittedFields.has('transcript') && !submittedFields.has('encounterNotes')) {
            if (patient.encounterNotes) {
              setTranscript(patient.transcript || '');
              setEncounterNotes(patient.encounterNotes);
            } else {
              const { transcript: t, encounterNotes: en } = splitTranscriptAndNotes(patient.transcript || '');
              setTranscript(t);
              setEncounterNotes(en);
            }
          } else {
            // Only populate the field that doesn't have submissions
            if (!submittedFields.has('transcript')) {
              setTranscript(patient.transcript || '');
            }
            if (!submittedFields.has('encounterNotes')) {
              setEncounterNotes(patient.encounterNotes || '');
            }
          }
          if (!submittedFields.has('triageVitals')) setTriageVitals(patient.triageVitals || '');
          if (!submittedFields.has('additional')) setAdditional(patient.additional || '');
          if (!submittedFields.has('pastDocs')) setPastDocs(patient.pastDocs || '');
        })
        .catch(() => {
          // On error, populate everything from patient data
          populateFromPatient(patient);
        });
    }
    // SAME patient refresh (after onSaved/fetchPatients) — do NOT touch text fields or submissions
  }, [patient, isOpen]);

  // Clear ref when modal closes so next open repopulates from patient data
  useEffect(() => {
    if (!isOpen) {
      currentPatientRef.current = null;
    }
  }, [isOpen]);

  // Parse profile JSON when patient loads
  useEffect(() => {
    if (patient?.profile) {
      try { setProfileData(JSON.parse(patient.profile)); } catch { setProfileData(null); }
    } else {
      setProfileData(null);
    }
  }, [patient?.profile]);

  // Load existing DDx data from patient
  useEffect(() => {
    if (patient?.ddx || patient?.investigations) {
      setDdxData(prev => prev || { keyQuestions: '', ddx: patient.ddx || '', investigations: patient.investigations || '' });
    }
  }, [patient?.ddx, patient?.investigations]);

  const handleGenerateProfile = async () => {
    if (!patient) return;
    setGeneratingProfile(true);
    try {
      // Save current data first if changed
      if (hasChangesRef.current) {
        const fields = buildFieldsToSave();
        if (Object.keys(fields).length > 0) {
          await fetch(`/api/patients/${patient.rowIndex}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              _sheetName: patient.sheetName,
              _patientName: patient.name,
              ...fields,
            }),
          });
        }
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

  const handleGenerateDdx = async () => {
    if (!patient) return;
    setGeneratingDdx(true);
    try {
      // Save current data first
      if (hasChangesRef.current) {
        const fields = buildFieldsToSave();
        if (Object.keys(fields).length > 0) {
          await fetch(`/api/patients/${patient.rowIndex}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ _sheetName: patient.sheetName, _patientName: patient.name, ...fields }),
          });
        }
      }
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, section: 'ddx-investigations' }),
      });
      if (res.ok) {
        const data = await res.json();
        // Also generate key clinical questions
        const qRes = await fetch('/api/clinical-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rowIndex: patient.rowIndex,
            sheetName: patient.sheetName,
            question: 'Based on the current differential diagnosis and available clinical information, list the 5-8 most important history questions I should ask this patient to narrow the differential. Format as a numbered list. For each question, briefly note which diagnoses it helps differentiate.',
          }),
        });
        let keyQuestions = '';
        if (qRes.ok) {
          const qData = await qRes.json();
          keyQuestions = qData.answer || '';
        }
        setDdxData({
          keyQuestions,
          ddx: data.ddx || patient.ddx || '',
          investigations: data.investigations || patient.investigations || '',
        });
        onSaved();
      }
    } catch (error) {
      console.error('Failed to generate DDx:', error);
    } finally {
      setGeneratingDdx(false);
    }
  };

  if (!isOpen || !patient) return null;

  const combinedTranscript = combineTranscriptAndNotes(transcript, encounterNotes);
  // Only consider non-empty text boxes as "changes" — empty boxes should NOT overwrite saved/submitted data
  const hasNewContent = !!(transcript.trim() || encounterNotes.trim() || triageVitals.trim() || additional.trim() || pastDocs.trim());
  const hasChanges = hasNewContent;
  hasChangesRef.current = hasChanges;

  // Can generate note if any content exists beyond just triage/vitals
  const canGenerateNote = !!(
    transcript.trim() ||
    encounterNotes.trim() ||
    additional.trim() ||
    triageVitals.trim() ||
    pastDocs.trim() ||
    patient.hpi ||
    patient.transcript?.trim() ||
    patient.encounterNotes?.trim() ||
    patient.triageVitals?.trim() ||
    patient.additional?.trim() ||
    submissions.length > 0
  );

  // Build fields object with only non-empty text box content (don't overwrite submitted data with empty)
  const buildFieldsToSave = () => {
    const fields: Record<string, string> = {};
    if (transcript.trim()) fields.transcript = transcript;
    if (encounterNotes.trim()) fields.encounterNotes = encounterNotes;
    if (triageVitals.trim()) fields.triageVitals = triageVitals;
    if (additional.trim()) fields.additional = additional;
    if (pastDocs.trim()) fields.pastDocs = pastDocs;
    return fields;
  };

  const handleSave = async () => {
    savePhrasesInBackground(encounterNotes, additional);

    const fields = buildFieldsToSave();
    if (Object.keys(fields).length === 0) {
      onSaved();
      return;
    }

    setSaving(true);
    try {
      await fetch(`/api/patients/${patient.rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _sheetName: patient.sheetName,
          _patientName: patient.name,
          ...fields,
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
      <div className={`relative w-full animate-slideUp transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidePanel ? 'sm:max-w-[780px]' : 'sm:max-w-lg'}`}>
      {/* Tabs anchored to the modal's right edge, protruding outward */}
      <div className="hidden sm:flex flex-col absolute z-50 right-0 translate-x-full" style={{ top: '80px' }}>
        {/* PMHx tab */}
        <button
          onClick={() => {
            setSidePanel(sidePanel === 'profile' ? null : 'profile');
            if (!profileData && !generatingProfile) handleGenerateProfile();
          }}
          className="outline-none relative"
        >
          <div
            className="flex items-center justify-center transition-all duration-250 ease-out"
            style={{
              width: sidePanel === 'profile' ? '30px' : '26px',
              height: '72px',
              background: sidePanel === 'profile'
                ? 'linear-gradient(135deg, rgba(96,165,250,0.12), rgba(59,130,246,0.06))'
                : 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderLeft: 'none',
              borderTopRightRadius: '12px',
              borderBottomRightRadius: '12px',
              boxShadow: sidePanel === 'profile'
                ? '4px 0 12px rgba(0,0,0,0.2), inset 0 0 12px rgba(96,165,250,0.06)'
                : '2px 0 8px rgba(0,0,0,0.12)',
            }}
          >
            <div className="flex flex-col items-center gap-2">
              <Heart
                className="w-3 h-3 transition-colors duration-200"
                style={{ color: sidePanel === 'profile' ? '#60a5fa' : 'var(--text-muted)' }}
                fill={profileData ? 'currentColor' : 'none'}
              />
              <span
                className="font-semibold uppercase leading-none transition-colors duration-200"
                style={{
                  fontSize: '7px',
                  letterSpacing: '0.1em',
                  writingMode: 'vertical-rl',
                  color: sidePanel === 'profile' ? '#60a5fa' : 'var(--text-muted)',
                }}
              >
                PMHx
              </span>
            </div>
          </div>
          {profileData && sidePanel !== 'profile' && (
            <span className="absolute top-2 right-2 w-[5px] h-[5px] rounded-full bg-blue-400" />
          )}
        </button>

        {/* DDx tab — offset slightly so tabs are staggered like real binder tabs */}
        <button
          onClick={() => {
            setSidePanel(sidePanel === 'ddx' ? null : 'ddx');
            if (!ddxData && !generatingDdx) handleGenerateDdx();
          }}
          className="outline-none relative mt-px"
        >
          <div
            className="flex items-center justify-center transition-all duration-250 ease-out"
            style={{
              width: sidePanel === 'ddx' ? '30px' : '26px',
              height: '64px',
              background: sidePanel === 'ddx'
                ? 'linear-gradient(135deg, rgba(167,139,250,0.12), rgba(139,92,246,0.06))'
                : 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderLeft: 'none',
              borderTopRightRadius: '12px',
              borderBottomRightRadius: '12px',
              boxShadow: sidePanel === 'ddx'
                ? '4px 0 12px rgba(0,0,0,0.2), inset 0 0 12px rgba(167,139,250,0.06)'
                : '2px 0 8px rgba(0,0,0,0.12)',
            }}
          >
            <div className="flex flex-col items-center gap-2">
              <ListTree
                className="w-3 h-3 transition-colors duration-200"
                style={{ color: sidePanel === 'ddx' ? '#a78bfa' : 'var(--text-muted)' }}
              />
              <span
                className="font-semibold uppercase leading-none transition-colors duration-200"
                style={{
                  fontSize: '7px',
                  letterSpacing: '0.1em',
                  writingMode: 'vertical-rl',
                  color: sidePanel === 'ddx' ? '#a78bfa' : 'var(--text-muted)',
                }}
              >
                DDx
              </span>
            </div>
          </div>
          {ddxData && sidePanel !== 'ddx' && (
            <span className="absolute top-2 right-2 w-[5px] h-[5px] rounded-full bg-violet-400" />
          )}
        </button>
      </div>

      {/* Mobile: inline icons in header */}
      <div className="sm:hidden absolute right-14 top-5 z-40 flex gap-1">
        <button
          onClick={() => {
            setSidePanel(sidePanel === 'profile' ? null : 'profile');
            if (!profileData && !generatingProfile) handleGenerateProfile();
          }}
          className={`p-1.5 rounded-lg transition-all duration-200 ${
            sidePanel === 'profile' ? 'text-blue-400' : 'text-[var(--text-muted)] opacity-50'
          }`}
        >
          <Heart className="w-4 h-4" fill={sidePanel === 'profile' ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={() => {
            setSidePanel(sidePanel === 'ddx' ? null : 'ddx');
            if (!ddxData && !generatingDdx) handleGenerateDdx();
          }}
          className={`p-1.5 rounded-lg transition-all duration-200 ${
            sidePanel === 'ddx' ? 'text-violet-400' : 'text-[var(--text-muted)] opacity-50'
          }`}
        >
          <ListTree className="w-4 h-4" />
        </button>
      </div>

      <div className="w-full sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{
        background: 'var(--modal-bg)',
        backdropFilter: 'blur(40px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
        border: '1px solid var(--modal-divider)',
      }}>
        {/* Header — warm dark */}
        <div className="flex items-center gap-3 px-5 py-4 sm:rounded-t-2xl" style={{
          background: 'var(--modal-header)',
          borderBottom: '1px solid rgba(120,113,108,0.1)',
        }}>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.06] rounded-full flex-shrink-0 transition-colors" title="Close">
            <X className="w-5 h-5" style={{ color: 'var(--modal-header-sub)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold truncate tracking-[-0.01em]" style={{ color: 'var(--modal-header-text)' }}>
              Clinical Information
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--modal-header-sub)' }}>
              {patient.name || 'Unknown'}
              {patient.age && ` · ${patient.age}`}{patient.gender && ` ${patient.gender}`}
              {patient.timestamp && (
                <span style={{ color: 'var(--modal-accent)' }}> · {patient.timestamp}</span>
              )}
            </p>
          </div>
          <button
            onClick={onNavigate}
            className="p-2 hover:bg-white/[0.06] rounded-full flex-shrink-0 transition-colors"
            title="Open full detail"
          >
            <ExternalLink className="w-4 h-4" style={{ color: 'var(--modal-header-sub)' }} />
          </button>
        </div>

        {/* Thin separator */}
        <div className="border-b border-[var(--border)]" />

        {/* Content area with optional side panel */}
        <div className="flex-1 overflow-hidden flex relative">

        {/* Clinical info — always visible */}
        <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-4 transition-all duration-300">
          {/* Triage Notes */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.12em] mb-1.5" style={{ color: 'var(--modal-label)' }}>
              Triage Notes & Vitals
            </label>
            <SubmissionTags field="triageVitals" />
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
              <label className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--modal-label)' }}>
                Transcript
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Mic className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--accent)', opacity: 0.5 }} />
                  <div className="flex-1" style={{ maxWidth: 80 }}>
                    <input
                      type="range"
                      min={0.5}
                      max={4}
                      step={0.5}
                      value={micSensitivity}
                      onChange={(e) => setMicSensitivity(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right, rgba(59,130,246,0.4) 0%, rgba(59,130,246,0.4) ${((micSensitivity - 0.5) / 3.5) * 100}%, var(--border) ${((micSensitivity - 0.5) / 3.5) * 100}%, var(--border) 100%)` }}
                    />
                  </div>
                  <span className="text-[8px] tabular-nums font-medium w-5 text-right" style={{ color: 'var(--text-muted)' }}>{micSensitivity}x</span>
                </div>
                <span
                  onClick={() => setShowLiveTranscript(!showLiveTranscript)}
                  className="text-[9px] cursor-pointer select-none transition-colors"
                  style={{ color: showLiveTranscript ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: showLiveTranscript ? 0.8 : 0.4 }}
                >
                  {showLiveTranscript ? 'Live' : 'Live'}
                </span>
              </div>
              {/* iOS positioning tip — removed */}
              {false && (
                <p className="text-[9px] text-amber-500/70 mt-0.5">Tip: Position device between you and the patient for best pickup</p>
              )}
            </div>
            <SubmissionTags field="transcript" />
            <div className="relative">
              {transcript && !isRecordingEncounter && !refiningFields.has('transcript') &&
                /^(Speaker \d|Dr[.:]|Pt[.:]|Patient:|Family:|Physician:|Doctor:)/im.test(transcript) ? (() => {
                const SPEAKER_REGEX = /^(Speaker \d+:|Dr[.:]|Physician:|Doctor:|Pt[.:]|Patient:|Family:)\s*/i;
                const lines = transcript.split('\n');
                const speakerNum = (label: string): number => {
                  const l = label.replace(/[.:]\s*$/, '').trim().toLowerCase();
                  if (['speaker 1', 'dr', 'physician', 'doctor'].includes(l)) return 1;
                  if (['speaker 2', 'speaker 3', 'pt', 'patient', 'family'].some(p => l.startsWith(p))) return 2;
                  return 0;
                };
                const displayLabel = (num: number): string => {
                  if (num === 1) return speakerNames.s1 ? `${speakerNames.s1}:` : 'Speaker 1:';
                  if (num === 2) return speakerNames.s2 ? `${speakerNames.s2}:` : 'Speaker 2:';
                  return '';
                };
                const cycleLabel = (idx: number) => {
                  const line = lines[idx];
                  const match = line.match(SPEAKER_REGEX);
                  const cur = match ? speakerNum(match[1]) : 0;
                  const next = cur === 1 ? 2 : cur === 2 ? 0 : 1;
                  const stripped = match ? line.substring(match[0].length) : line;
                  const canon = next === 1 ? 'Speaker 1:' : next === 2 ? 'Speaker 2:' : '';
                  const updated = [...lines]; updated[idx] = canon ? `${canon} ${stripped}` : stripped;
                  setTranscript(updated.join('\n'));
                };
                const swapSpeakers = () => {
                  setTranscript(lines.map(line => {
                    if (/^Speaker 1:/i.test(line)) return line.replace(/^Speaker 1:/i, 'Speaker 2:');
                    if (/^Speaker 2:/i.test(line)) return line.replace(/^Speaker 2:/i, 'Speaker 1:');
                    return line;
                  }).join('\n'));
                  setSpeakerNames(prev => ({ s1: prev.s2, s2: prev.s1 }));
                };
                const stripAll = () => setTranscript(lines.map(l => l.replace(SPEAKER_REGEX, '')).join('\n'));
                const hasSpeakers = lines.some(l => SPEAKER_REGEX.test(l));
                return (
                  <div>
                    {hasSpeakers && (
                      <div className="flex items-center gap-3 mb-1 px-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <input value={speakerNames.s1} onChange={e => setSpeakerNames(p => ({ ...p, s1: e.target.value }))}
                            placeholder="Speaker 1" className="text-[10px] bg-transparent border-none outline-none w-20 placeholder:text-blue-400/40 text-blue-400 font-medium" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <input value={speakerNames.s2} onChange={e => setSpeakerNames(p => ({ ...p, s2: e.target.value }))}
                            placeholder="Speaker 2" className="text-[10px] bg-transparent border-none outline-none w-20 placeholder:text-amber-400/40 text-amber-400 font-medium" />
                        </div>
                        <button onClick={swapSpeakers} className="text-[8px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors" title="Swap speakers">⇄ swap</button>
                        <span className="text-[var(--text-muted)] opacity-20">·</span>
                        <button onClick={stripAll} className="text-[8px] text-[var(--text-muted)] hover:text-red-400 transition-colors">remove labels</button>
                      </div>
                    )}
                    <div className="w-full max-h-28 p-3 pr-10 border border-[var(--input-border)] rounded-xl text-xs overflow-y-auto bg-[var(--input-bg)]">
                      {lines.map((line, i) => {
                        const match = line.match(SPEAKER_REGEX);
                        const num = match ? speakerNum(match[1]) : 0;
                        const isSp1 = num === 1;
                        const isSp2 = num === 2;
                        const label = match ? displayLabel(num) + ' ' : null;
                        const rest = match ? line.substring(match[0].length) : line;
                        return (
                          <div key={i} className="leading-relaxed flex">
                            {label ? (
                              <span onClick={e => { e.stopPropagation(); cycleLabel(i); }}
                                className={`font-semibold cursor-pointer select-none hover:underline decoration-dotted underline-offset-2 flex-shrink-0 ${isSp1 ? 'text-blue-400' : isSp2 ? 'text-amber-400' : ''}`}
                                title="Click to change speaker">{label}</span>
                            ) : rest?.trim() ? (
                              <span onClick={e => { e.stopPropagation(); cycleLabel(i); }}
                                className="w-3 flex-shrink-0 cursor-pointer opacity-0 hover:opacity-30 text-center" title="Click to assign speaker">+</span>
                            ) : null}
                            <span
                              className={`${isSp1 ? 'text-blue-400' : isSp2 ? 'text-amber-400' : 'text-[var(--text-primary)]'} cursor-text`}
                              onClick={e => {
                                e.stopPropagation();
                                const container = e.currentTarget.closest('.relative');
                                const ta = container?.querySelector('textarea') as HTMLTextAreaElement;
                                if (ta) { (e.currentTarget.closest('.overflow-y-auto') as HTMLElement).style.display = 'none'; ta.style.display = 'block'; ta.focus(); }
                              }}
                            >{rest || '\u00A0'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })() : null}
              {/* Edit/clear bar for transcript — above textarea, left-aligned */}
              {transcript && !isRecordingEncounter && !refiningFields.has('transcript') && (
                <div className="flex items-center gap-3 mb-1 px-1">
                  <button
                    onClick={() => {
                      // Show the textarea for editing
                      const textareas = document.querySelectorAll('textarea');
                      textareas.forEach(ta => {
                        if (ta.placeholder?.includes('transcript') || ta.placeholder?.includes('dictation')) {
                          ta.style.display = 'block';
                          ta.focus();
                        }
                      });
                      // Hide the colored speaker view
                      const coloredViews = document.querySelectorAll('.overflow-y-auto');
                      coloredViews.forEach(v => {
                        if ((v as HTMLElement).closest('.relative')) (v as HTMLElement).style.display = 'none';
                      });
                    }}
                    className="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Clear transcript?')) {
                        setTranscript('');
                        // Save empty transcript to patient data so it doesn't repopulate on reopen
                        if (patient) {
                          fetch(`/api/patients/${patient.rowIndex}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ transcript: '', _sheetName: patient.sheetName, _patientName: patient.name }),
                          }).catch(() => {});
                        }
                      }
                    }}
                    className="text-[9px] text-[var(--text-muted)] hover:text-red-400 transition-colors font-medium"
                  >
                    Clear
                  </button>
                </div>
              )}
              {/* Recording waveform */}
              {isRecordingEncounter && !showLiveTranscript && (() => {
                const vizGain = micSensitivity <= 1 ? 32 : micSensitivity <= 2 ? 48 : micSensitivity <= 3 ? 65 : 85;
                const mins = Math.floor(recordingElapsed / 60);
                const secs = recordingElapsed % 60;
                const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                const recentPeak = waveHistory.slice(-10).reduce((max, s) => Math.max(max, s?.level || 0), 0);
                const glowIntensity = Math.min(1, recentPeak * 4);
                return (
                  <div className="w-full rounded-lg relative overflow-hidden" style={{
                    height: '84px',
                    background: 'linear-gradient(160deg, rgba(6,8,16,0.97) 0%, rgba(10,14,26,0.99) 50%, rgba(6,8,16,0.97) 100%)',
                    border: `1px solid rgba(96,165,250,${0.1 + glowIntensity * 0.12})`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.015), 0 0 ${14 + glowIntensity * 30}px rgba(96,165,250,${0.04 + glowIntensity * 0.18}), inset 0 0 ${20 + glowIntensity * 20}px rgba(96,165,250,${glowIntensity * 0.04})`,
                    transition: 'box-shadow 120ms ease-out, border-color 120ms ease-out',
                  }}>
                    {/* Scan lines */}
                    <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.02, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(148,163,184,0.3) 2px, rgba(148,163,184,0.3) 3px)' }} />
                    {/* Center line — glows with audio */}
                    <div className="absolute left-0 top-[calc(50%-0.5px)] h-px z-[1] pointer-events-none" style={{ right: '48px', background: `linear-gradient(to right, rgba(96,165,250,${0.04 + glowIntensity * 0.12}), rgba(96,165,250,${0.1 + glowIntensity * 0.2}) 50%, rgba(96,165,250,${0.04 + glowIntensity * 0.08}))` }} />
                    {/* Waveform bars — stop before mic icon, taper off on right */}
                    <div className="absolute left-0 top-0 bottom-0 flex items-center justify-between px-1" style={{ right: '48px' }}>
                      {Array.from({ length: 100 }).map((_, i) => {
                        const sample = waveHistory[i];
                        const level = sample?.level || 0;
                        // Taper: last 15 bars fade out gracefully
                        const taperStart = 85;
                        const taper = i >= taperStart ? 1 - ((i - taperStart) / (100 - taperStart)) : 1;
                        const barH = Math.max(0.5, level * vizGain * taper);
                        const intensity = level > 0.02 ? Math.min(1, level * 2.5) * taper : 0;
                        return (
                          <div key={i} style={{
                            width: '2px',
                            height: `${barH * 2 + 1}px`,
                            borderRadius: '1px',
                            opacity: taper,
                            background: level > 0.02
                              ? `linear-gradient(180deg, rgba(59,130,246,${intensity * 0.15}) 0%, rgba(96,165,250,${0.3 + intensity * 0.5}) 30%, rgba(147,197,253,${0.5 + intensity * 0.5}) 50%, rgba(96,165,250,${0.3 + intensity * 0.5}) 70%, rgba(59,130,246,${intensity * 0.15}) 100%)`
                              : `rgba(148,163,184,${(0.03 + Math.sin(i * 0.3 + Date.now() * 0.001) * 0.01) * taper})`,
                            transition: 'height 50ms ease-out',
                            boxShadow: level > 0.12 && taper > 0.5 ? `0 0 ${3 + level * 8}px rgba(96,165,250,${level * 0.35 * taper})` : 'none',
                          }} />
                        );
                      })}
                    </div>
                    {/* Left fade only */}
                    <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, rgba(6,8,16,0.97) 0%, rgba(6,8,16,0.5) 40%, transparent 100%)' }} />
                    {/* Bottom glow */}
                    <div className="absolute bottom-0 inset-x-0 h-10 pointer-events-none" style={{
                      background: `radial-gradient(ellipse 50% 100% at 40% 100%, rgba(96,165,250,${0.02 + glowIntensity * 0.1}) 0%, transparent 100%)`,
                      transition: 'background 120ms ease',
                    }} />
                    {/* Top glow pulse */}
                    <div className="absolute top-0 inset-x-0 h-6 pointer-events-none" style={{
                      background: `radial-gradient(ellipse 40% 100% at 40% 0%, rgba(96,165,250,${glowIntensity * 0.06}) 0%, transparent 100%)`,
                    }} />
                    {/* Top-left status */}
                    <div className="absolute top-2 left-3 flex items-center gap-2 z-20">
                      <div className="w-[6px] h-[6px] rounded-full bg-red-500" style={{
                        boxShadow: `0 0 4px rgba(239,68,68,0.6), 0 0 8px rgba(239,68,68,0.3)`,
                        animation: 'pulse 1.5s ease-in-out infinite',
                      }} />
                      <span className="text-[8px] text-white/25 font-medium tracking-[0.2em] uppercase">Encounter</span>
                      <span className="text-[9px] text-white/40 font-mono tabular-nums tracking-wide">{timeStr}</span>
                    </div>
                  </div>
                );
              })()}
              {/* Draft text indicator when live text is on during recording */}
              {isRecordingEncounter && showLiveTranscript && (
                <div className="absolute bottom-1 left-3 z-10 flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[9px] text-amber-400/60 font-medium">Draft — will be refined when recording stops</span>
                </div>
              )}
              {/* Processing overlay — shows after recording stops while transcribing */}
              {refiningFields.has('transcript') && !isRecordingEncounter && (
                <div className="w-full rounded-xl flex items-center justify-center" style={{ height: '72px',
                  background: 'linear-gradient(180deg, rgba(15,23,42,0.5) 0%, rgba(15,23,42,0.7) 100%)',
                  border: '1px solid rgba(96,165,250,0.12)',
                }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                    <span key={processingWord} className="text-[11px] text-blue-400/70 font-medium animate-fadeIn">
                      {processingWord === 0 ? 'Processing' : 'Refining'}...
                    </span>
                  </div>
                </div>
              )}
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                onBlur={(e) => {
                  const prev = e.currentTarget.previousElementSibling as HTMLElement;
                  if (prev && /^(Speaker \d|Dr[.:]|Pt[.:]|Patient:|Family:|Physician:|Doctor:)/im.test(transcript)) {
                    prev.style.display = 'block';
                    e.currentTarget.style.display = 'none';
                  }
                }}
                placeholder="Audio transcript or dictation..."
                className={`w-full h-28 p-3 pr-16 border border-[var(--input-border)] rounded-xl text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] placeholder:text-[var(--text-muted)] transition-colors duration-300 ${refiningFields.has('transcript') ? 'text-[var(--text-muted)] italic' : 'text-[var(--text-primary)]'}`}
                style={(isRecordingEncounter && !showLiveTranscript) || (refiningFields.has('transcript') && !isRecordingEncounter) || (transcript && /^(Speaker \d|Dr[.:]|Pt[.:]|Patient:|Family:|Physician:|Doctor:)/im.test(transcript) && !refiningFields.has('transcript')) ? { display: 'none' } : undefined}
              />
              <div className="absolute top-1.5 right-1.5">
                <VoiceRecorder
                  mode="encounter"
                  showUpload
                  sensitivity={micSensitivity}
                  encryptionKey={encryptionKey || undefined}
                  sheetName={patient.sheetName}
                  rowIndex={patient.rowIndex}
                  onBlobBackup={(url, iv, ct) => {
                    const now = new Date().toISOString();
                    setAudioBlobUrl(url); setAudioBlobIv(iv); setAudioBlobContentType(ct); setAudioBlobCreatedAt(now);
                    // Persist to patient data so re-transcribe works after modal close
                    if (patient) {
                      const backup = JSON.stringify({ blobUrl: url, iv, contentType: ct, createdAt: new Date().toISOString() });
                      fetch(`/api/patients/${patient.rowIndex}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ audioBackup: backup, _sheetName: patient.sheetName, _patientName: patient.name }),
                      }).catch(() => {});
                    }
                  }}
                  onTranscript={(text) => {
                    const base = preRecordTranscript || '';
                    setTranscript(base ? `${base}\n\n${text}` : text);
                    setFieldRefining('transcript', false);
                  }}
                  onRecordingStart={() => { setPreRecordTranscript(transcript); setIsRecordingEncounter(true); setWaveHistory([]); waveFrameCountRef.current = 0; setAudioBlobUrl(null); }}
                  onRecordingStop={() => { setIsRecordingEncounter(false); setAudioData({ level: 0, lowFreq: 0, highFreq: 0, speakerHint: 'silent' }); }}
                  onInterimTranscript={showLiveTranscript ? (text) => {
                    const base = preRecordTranscript || '';
                    setTranscript(base ? `${base}\n\n${text}` : text);
                  } : undefined}
                  onProcessingChange={(p) => setFieldRefining('transcript', p)}
                  onAudioLevel={(data) => {
                    // Sample every 12th frame (~5Hz at 60fps) for visible scrolling
                    waveFrameCountRef.current++;
                    if (waveFrameCountRef.current % 6 === 0) {
                      setWaveHistory(prev => [...prev.slice(-99), { level: data.level, speaker: data.speakerHint }]);
                    }
                  }}
                />
              </div>
            </div>
            {/* Detail level for transcript extraction */}
            {transcript.trim() && !isRecordingEncounter && (
              <div className="flex items-center gap-2 mt-1 px-1">
                <span className="text-[8px] text-[var(--text-muted)]">Detail</span>
                <input type="range" min={1} max={5} value={encounterDetail} onChange={e => setEncounterDetail(Number(e.target.value))}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer" style={{ maxWidth: 100, background: `linear-gradient(to right, rgba(59,130,246,0.4) 0%, rgba(59,130,246,0.4) ${(encounterDetail - 1) * 25}%, var(--border) ${(encounterDetail - 1) * 25}%, var(--border) 100%)` }} />
                <span className="text-[8px] tabular-nums font-medium w-[52px] text-right" style={{ color: 'var(--text-muted)' }}>
                  {['Minimal', 'Brief', 'Standard', 'Detailed', 'Comprehensive'][encounterDetail - 1]}
                </span>
              </div>
            )}
            <button
              onClick={() => {
                // Tag transcript with detail level metadata
                const detailMap: Record<number, string> = { 1: 'concise', 2: 'concise', 3: 'standard', 4: 'comprehensive', 5: 'comprehensive' };
                const detailTag = `[Detail: ${detailMap[encounterDetail] || 'standard'}]`;
                const taggedContent = transcript.includes('[Detail:') ? transcript : `${detailTag}\n${transcript}`;
                handleSectionSubmit('transcript', taggedContent);
              }}
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
            {/* Re-transcribe from Blob backup */}
            {audioBlobUrl && audioBlobIv && !isRecordingEncounter && (() => {
              const hoursLeft = audioBlobCreatedAt
                ? Math.max(0, Math.floor(((getSettings().audioRetentionHours || 12) * 60 * 60 * 1000 - (Date.now() - new Date(audioBlobCreatedAt).getTime())) / (60 * 60 * 1000)))
                : null;
              const handleRetranscribe = async () => {
                setRetranscribing(true);
                setFieldRefining('transcript', true);
                try {
                  const res = await fetch('/api/transcribe-server', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      blobUrl: audioBlobUrl,
                      iv: audioBlobIv,
                      contentType: audioBlobContentType,
                      ...(retranscribeHints.trim() ? { keywords: retranscribeHints.trim() } : {}),
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    if (data.text?.trim()) setTranscript(data.text.trim());
                  }
                } catch (e) {
                  console.error('Re-transcribe failed:', e);
                } finally {
                  setRetranscribing(false);
                  setFieldRefining('transcript', false);
                }
              };
              return (
                <div className="mt-1">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleRetranscribe}
                      disabled={retranscribing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded-lg text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                      title={hoursLeft !== null ? `Audio backup expires in ${hoursLeft}h` : undefined}
                    >
                      {retranscribing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Re-transcribe
                      {hoursLeft !== null && <span className="text-[8px] opacity-50">· {hoursLeft}h left</span>}
                    </button>
                    <button
                      onClick={() => setShowRetranscribeOptions(!showRetranscribeOptions)}
                      className={`px-1.5 py-1 rounded text-[9px] transition-colors ${showRetranscribeOptions ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] opacity-50 hover:opacity-100'}`}
                    >
                      ···
                    </button>
                  </div>
                  {showRetranscribeOptions && (
                    <div className="mt-1.5 animate-fadeIn">
                      <input
                        type="text"
                        value={retranscribeHints}
                        onChange={(e) => setRetranscribeHints(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRetranscribe(); } }}
                        placeholder="Boost terms: drug names, conditions, names..."
                        className="w-full px-2.5 py-1.5 border border-[var(--input-border)] rounded-lg text-[10px] bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                      <p className="text-[8px] text-[var(--text-muted)] mt-0.5 ml-1 opacity-60">
                        Add words Deepgram should listen for (comma-separated)
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Encounter Notes */}
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-[0.12em] mb-1.5" style={{ color: 'var(--modal-label)' }}>
              Encounter Notes
            </label>
            <SubmissionTags field="encounterNotes" />
            <div className="relative">
              <AutocompleteTextarea
                value={encounterNotes}
                onChange={setEncounterNotes}
                suggestions={allSuggestions}
                placeholder="Physician notes, clinical observations, plan..."
                textareaClassName={`w-full h-28 p-3 pr-10 border border-[var(--input-border)] rounded-xl text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] placeholder:text-[var(--text-muted)] transition-colors duration-300 ${refiningFields.has('encounterNotes') ? 'text-[var(--text-muted)] italic' : 'text-[var(--text-primary)]'}`}
                patientContext={patientContext}
              />
              {refiningFields.has('encounterNotes') && (
                <div className="absolute bottom-2 left-3 text-[10px] text-blue-400 font-medium animate-pulse z-10">Refining dictation...</div>
              )}
              <div className="absolute top-1.5 right-1.5 z-10">
                <VoiceRecorder
                  onTranscript={(text) => {
                    const base = preRecordEncounterNotes || encounterNotes;
                    setEncounterNotes(base ? `${base}\n${text}` : text);
                    setFieldRefining('encounterNotes', false);
                  }}
                  onRecordingStart={() => setPreRecordEncounterNotes(encounterNotes)}
                  onInterimTranscript={(text) => {
                    setEncounterNotes(preRecordEncounterNotes ? `${preRecordEncounterNotes}\n${text}` : text);
                  }}
                  onProcessingChange={(p) => setFieldRefining('encounterNotes', p)}
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
            <label className="block text-[10px] font-medium uppercase tracking-[0.12em] mb-1.5" style={{ color: 'var(--modal-label)' }}>
              Additional Findings / Exam
            </label>
            <SubmissionTags field="additional" />
            <ExamToggles value={additional} onChange={setAdditional} />
            <div className="relative">
              <AutocompleteTextarea
                value={additional}
                onChange={setAdditional}
                suggestions={allSuggestions}
                placeholder="Exam findings, investigations, results, updates..."
                textareaClassName={`w-full h-24 p-3 pr-10 border border-[var(--input-border)] rounded-xl text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] placeholder:text-[var(--text-muted)] transition-colors duration-300 ${refiningFields.has('additional') ? 'text-[var(--text-muted)] italic' : 'text-[var(--text-primary)]'}`}
                patientContext={patientContext}
              />
              {refiningFields.has('additional') && (
                <div className="absolute bottom-2 left-3 text-[10px] text-blue-400 font-medium animate-pulse z-10">Refining dictation...</div>
              )}
              <div className="absolute top-1.5 right-1.5 z-10">
                <VoiceRecorder
                  onTranscript={(text) => {
                    const base = preRecordAdditional || additional;
                    setAdditional(base ? `${base}\n${text}` : text);
                    setFieldRefining('additional', false);
                  }}
                  onRecordingStart={() => setPreRecordAdditional(additional)}
                  onInterimTranscript={(text) => {
                    setAdditional(preRecordAdditional ? `${preRecordAdditional}\n${text}` : text);
                  }}
                  onProcessingChange={(p) => setFieldRefining('additional', p)}
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
            <label className="block text-[10px] font-medium uppercase tracking-[0.12em] mb-1.5" style={{ color: 'var(--modal-label)' }}>
              Past Documentation
            </label>
            <SubmissionTags field="pastDocs" />
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

        {/* Side panel — slides in as a sibling flex panel */}
        {sidePanel && (
          <div className="w-[280px] flex-shrink-0 border-l border-[var(--border)] overflow-y-auto animate-sidePanelIn">
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card-bg)]">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                {sidePanel === 'profile' ? 'Medical Profile' : 'Differential Diagnosis'}
              </span>
              <button
                onClick={() => setSidePanel(null)}
                className="p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>
            </div>
            <div className="px-4 py-3">
              {sidePanel === 'profile' ? (
                <PatientProfile
                  profile={profileData}
                  age={patient.age}
                  gender={patient.gender}
                  onGenerate={handleGenerateProfile}
                  generating={generatingProfile}
                />
              ) : (
                <div className="space-y-3">
                  {generatingDdx ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                      <span className="ml-2 text-xs text-[var(--text-muted)]">Generating...</span>
                    </div>
                  ) : ddxData ? (
                    <>
                      {ddxData.keyQuestions && (
                        <div className="border border-amber-200 dark:border-amber-800/40 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20">
                          <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1.5">Key Questions</h3>
                          <div className="text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">{ddxData.keyQuestions}</div>
                        </div>
                      )}
                      {ddxData.ddx && (
                        <div>
                          <h3 className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1.5">Differential</h3>
                          <div className="text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed border border-[var(--border)] rounded-lg p-3 bg-[var(--bg-secondary)]">{ddxData.ddx}</div>
                        </div>
                      )}
                      {ddxData.investigations && (
                        <div>
                          <h3 className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1.5">Investigations</h3>
                          <div className="text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed border border-[var(--border)] rounded-lg p-3 bg-[var(--bg-secondary)]">{ddxData.investigations}</div>
                        </div>
                      )}
                      <button
                        onClick={handleGenerateDdx}
                        disabled={generatingDdx}
                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-md hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Update
                      </button>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-xs text-[var(--text-muted)] mb-2">Add clinical info to generate DDx.</p>
                      <button onClick={handleGenerateDdx} disabled={generatingDdx} className="px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors">
                        Generate DDx
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 pb-safe sm:rounded-b-2xl space-y-3" style={{ borderTop: '1px solid var(--modal-divider)', background: 'var(--modal-section-bg)' }}>
          {showCustomInstructions && (
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="E.g., 'Focus on cardiac workup', 'Keep assessment brief'..."
              className="w-full h-14 p-2.5 border border-purple-300 dark:border-purple-700 rounded-lg text-xs resize-none bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-purple-500 focus:outline-none"
              autoFocus
            />
          )}
          <div className="flex gap-2 items-stretch">
            <button
              onClick={async () => {
                if (hasChanges) await handleSave();
                onClose();
              }}
              disabled={saving || generating}
              className="flex-1 border border-[var(--border)] text-[var(--text-primary)] rounded-xl text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-[var(--bg-primary)] hover:border-[var(--text-muted)] active:scale-[0.97] transition-all"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save'}
            </button>
            {canGenerateNote && (
              <button
                onClick={async () => {
                  setGenerating(true);
                  try {
                    if (hasChanges) {
                      const fields = buildFieldsToSave();
                      if (Object.keys(fields).length > 0) {
                        await fetch(`/api/patients/${patient.rowIndex}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            _sheetName: patient.sheetName,
                            _patientName: patient.name,
                            ...fields,
                          }),
                        });
                      }
                    }
                    const res = await fetch('/api/process', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        rowIndex: patient.rowIndex,
                        sheetName: patient.sheetName,
                        patientName: patient.name,
                        promptTemplates: getEffectivePromptTemplates(),
                        noteStyle,
                        noteStyleInstructions: noteStyle === 'standard' ? getSettings().noteStyleStandard : noteStyle === 'comprehensive' ? getSettings().noteStyleDetailed : getSettings().noteStyleCompleteExam,
                        ...(customInstructions.trim() ? { customInstructions: customInstructions.trim() } : {}),
                      }),
                    });
                    if (res.ok) {
                      fetch('/api/profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName }),
                      }).catch(() => {});
                      (onGenerated || onSaved)();
                      onClose();
                      onNavigate();
                    } else {
                      const err = await res.json().catch(() => ({ error: 'Generation failed' }));
                      alert(`Note generation failed: ${err.error || 'Unknown error'}`);
                    }
                  } catch (error) {
                    console.error('Failed to generate:', error);
                    alert('Note generation failed — please try again.');
                  } finally {
                    setGenerating(false);
                  }
                }}
                disabled={generating || saving}
                className="flex-[2] py-3 text-white rounded-xl font-medium disabled:opacity-40 flex flex-col items-center justify-center active:scale-[0.98] transition-all"
                style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', boxShadow: '0 2px 8px rgba(217,119,6,0.25)' }}
              >
                <span className="flex items-center gap-2 text-sm">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {generating ? 'Generating...' : patient.hasOutput ? 'Regenerate Note' : 'Generate Note'}
                </span>
                <span className="flex items-center gap-2 mt-0.5">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteStyle(noteStyle === 'standard' ? 'comprehensive' : noteStyle === 'comprehensive' ? 'complete-exam' : 'standard');
                    }}
                    className={`text-[9px] font-medium ${noteStyle !== 'standard' ? 'text-white' : 'text-white/50'}`}
                  >
                    {noteStyle === 'standard' ? 'Standard' : noteStyle === 'comprehensive' ? 'Detailed' : 'Complete Exam'}
                  </span>
                  <span className="text-white/30 text-[9px]">·</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); setShowCustomInstructions(!showCustomInstructions); }}
                    className={`text-[9px] font-medium ${showCustomInstructions || customInstructions.trim() ? 'text-white' : 'text-white/50'}`}
                  >
                    Instructions{customInstructions.trim() ? ' ✓' : ''}
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>{/* end modal card */}
      </div>{/* end relative wrapper */}
    </div>
  );
}
