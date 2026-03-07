'use client';

import { useState, useRef, useEffect } from 'react';
import { Patient } from '@/lib/google-sheets';
import { X, Loader2, Upload, ChevronDown, ChevronUp, AlertTriangle, Check } from 'lucide-react';

interface BatchTranscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  sheetName: string;
  onSaved: () => void;
  initialFile?: File;
  initialTranscript?: string;
}

interface Segment {
  patientName: string;
  transcript: string;
  matched: boolean;
  assignedRowIndex: number | null; // null = skip
}

type ModalState = 'upload' | 'splitting' | 'review';

export function BatchTranscribeModal({ isOpen, onClose, patients, sheetName, onSaved, initialFile, initialTranscript }: BatchTranscribeModalProps) {
  const [state, setState] = useState<ModalState>('upload');
  const [transcribing, setTranscribing] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialFileProcessed = useRef(false);
  const initialTranscriptProcessed = useRef(false);

  const reset = () => {
    setState('upload');
    setTranscribing(false);
    setSegments([]);
    setError('');
    setSaving(false);
    setExpandedIdx(null);
    initialFileProcessed.current = false;
    initialTranscriptProcessed.current = false;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processFile = async (file: File) => {
    setError('');
    setTranscribing(true);

    try {
      // Step 1: Transcribe
      const formData = new FormData();
      formData.append('audio', file);

      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!transcribeRes.ok) {
        const err = await transcribeRes.json();
        throw new Error(err.error || 'Transcription failed');
      }

      const { text: transcript } = await transcribeRes.json();
      setTranscribing(false);

      // Step 2: Split
      setState('splitting');
      const patientNames = patients.map(p => p.name).filter(Boolean);

      const splitRes = await fetch('/api/split-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, patientNames }),
      });

      if (!splitRes.ok) {
        const err = await splitRes.json();
        throw new Error(err.error || 'Failed to split transcript');
      }

      const { segments: rawSegments } = await splitRes.json();

      // Match segments to patient rowIndexes
      const mapped: Segment[] = rawSegments.map((seg: any) => {
        const matchedPatient = patients.find(
          p => p.name.toLowerCase() === seg.patientName.toLowerCase()
        );
        return {
          patientName: seg.patientName,
          transcript: seg.transcript,
          matched: seg.matched,
          assignedRowIndex: matchedPatient ? matchedPatient.rowIndex : null,
        };
      });

      setSegments(mapped);
      setState('review');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setTranscribing(false);
      setState('upload');
    }
  };

  // Auto-process initialFile when provided
  useEffect(() => {
    if (isOpen && initialFile && !initialFileProcessed.current) {
      initialFileProcessed.current = true;
      processFile(initialFile);
    }
  }, [isOpen, initialFile]);

  // Auto-process initialTranscript (from iOS Shortcut) — skip upload & transcription
  useEffect(() => {
    if (!isOpen || !initialTranscript || initialTranscriptProcessed.current) return;
    // Wait for patients to load before splitting
    if (patients.length === 0) return;
    initialTranscriptProcessed.current = true;

    (async () => {
      try {
        setState('splitting');
        const patientNames = patients.map(p => p.name).filter(Boolean);

        const splitRes = await fetch('/api/split-transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: initialTranscript, patientNames }),
        });

        if (!splitRes.ok) {
          const err = await splitRes.json();
          throw new Error(err.error || 'Failed to split transcript');
        }

        const { segments: rawSegments } = await splitRes.json();

        const mapped: Segment[] = rawSegments.map((seg: any) => {
          const matchedPatient = patients.find(
            p => p.name.toLowerCase() === seg.patientName.toLowerCase()
          );
          return {
            patientName: seg.patientName,
            transcript: seg.transcript,
            matched: seg.matched,
            assignedRowIndex: matchedPatient ? matchedPatient.rowIndex : null,
          };
        });

        setSegments(mapped);
        setState('review');
      } catch (err: any) {
        setError(err.message || 'Something went wrong');
        setState('upload');
      }
    })();
  }, [isOpen, initialTranscript, patients]);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    // Reset file input so same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleAssign = (segIdx: number, rowIndex: number | null) => {
    setSegments(prev =>
      prev.map((seg, i) => i === segIdx ? { ...seg, assignedRowIndex: rowIndex } : seg)
    );
  };

  const handleSave = async () => {
    const toSave = segments.filter(seg => seg.assignedRowIndex !== null);
    if (toSave.length === 0) {
      handleClose();
      return;
    }

    setSaving(true);
    setError('');

    try {
      for (const seg of toSave) {
        // Get current patient to check existing transcript
        const patient = patients.find(p => p.rowIndex === seg.assignedRowIndex);
        const existingTranscript = patient?.transcript || '';
        const newTranscript = existingTranscript
          ? `${existingTranscript}\n\n${seg.transcript}`
          : seg.transcript;

        const res = await fetch(`/api/patients/${seg.assignedRowIndex}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: newTranscript,
            _sheetName: sheetName,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `Failed to save segment for ${seg.patientName}`);
        }
      }

      onSaved();
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  const assignedCount = segments.filter(s => s.assignedRowIndex !== null).length;

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-center justify-center px-4">
      <div
        className="bg-[var(--card-bg)] rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-scaleIn"
        style={{ boxShadow: 'var(--card-shadow-elevated)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {state === 'upload' && 'Upload Audio'}
            {state === 'splitting' && 'Splitting Transcript'}
            {state === 'review' && 'Review Segments'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Upload State */}
          {state === 'upload' && !transcribing && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                Upload a voice memo with notes for multiple patients. The audio will be transcribed and automatically split by patient.
              </p>
              <label className="flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-[var(--border)] rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors">
                <Upload className="w-10 h-10 text-[var(--text-muted)]" />
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  Tap to select audio file
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  .m4a, .mp3, .wav, .webm — up to 25 MB
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Transcribing */}
          {state === 'upload' && transcribing && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm font-medium text-[var(--text-secondary)]">Transcribing audio...</p>
              <p className="text-xs text-[var(--text-muted)]">This may take a moment</p>
            </div>
          )}

          {/* Splitting */}
          {state === 'splitting' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <p className="text-sm font-medium text-[var(--text-secondary)]">Splitting transcript by patient...</p>
              <p className="text-xs text-[var(--text-muted)]">Identifying patient segments</p>
            </div>
          )}

          {/* Review State */}
          {state === 'review' && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                {segments.length} segment{segments.length !== 1 ? 's' : ''} found. Assign each to a patient or skip.
              </p>

              {segments.map((seg, idx) => (
                <div
                  key={idx}
                  className={`border rounded-xl overflow-hidden ${
                    seg.assignedRowIndex === null
                      ? 'border-[var(--border)] opacity-60'
                      : seg.matched
                        ? 'border-green-300 dark:border-green-700'
                        : 'border-amber-300 dark:border-amber-700'
                  }`}
                >
                  {/* Segment header */}
                  <div className="px-4 py-3 flex items-center gap-3 bg-[var(--bg-secondary)]">
                    {/* Match indicator */}
                    {seg.matched ? (
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    )}

                    {/* Patient assignment dropdown */}
                    <select
                      value={seg.assignedRowIndex ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleAssign(idx, val === '' ? null : parseInt(val));
                      }}
                      className="flex-1 text-sm bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-1.5 text-[var(--text-primary)]"
                    >
                      <option value="">Skip</option>
                      {patients.filter(p => p.name).map(p => (
                        <option key={p.rowIndex} value={p.rowIndex}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    {/* Expand/collapse */}
                    <button
                      onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                      className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors flex-shrink-0"
                    >
                      {expandedIdx === idx ? (
                        <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                      )}
                    </button>
                  </div>

                  {/* Transcript preview */}
                  <div className="px-4 py-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                    {expandedIdx === idx ? (
                      <p className="whitespace-pre-wrap">{seg.transcript}</p>
                    ) : (
                      <p className="line-clamp-2">{seg.transcript}</p>
                    )}
                  </div>

                  {/* Unmatched label */}
                  {!seg.matched && seg.assignedRowIndex !== null && (
                    <div className="px-4 pb-2">
                      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        Originally: &quot;{seg.patientName}&quot;
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {state === 'review' && (
          <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">
              {assignedCount} of {segments.length} will be saved
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] rounded-lg hover:brightness-95 active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || assignedCount === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:brightness-110 active:scale-[0.97] transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  `Save ${assignedCount} Segment${assignedCount !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
