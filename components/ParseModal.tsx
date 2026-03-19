'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Clipboard, Check, Loader2, Clock, Upload } from 'lucide-react';
import { ExamToggles } from '@/components/ExamToggles';
import { AutocompleteTextarea } from '@/components/AutocompleteTextarea';
import { MEDICAL_SUGGESTIONS } from '@/lib/medical-suggestions';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { getParseRules, saveParseRules, ParseRules, DEFAULT_PARSE_RULES } from '@/lib/settings';
import { savePhrasesInBackground } from '@/lib/user-phrases';

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
  encounterNotes: string;
  additional: string;
  pastDocs: string;
  _generateNote?: boolean;
}

/** Combine transcript + encounter notes into one string for storage */
function combineTranscriptAndNotes(transcript: string, encounterNotes: string): string {
  const parts: string[] = [];
  if (transcript.trim()) parts.push(transcript.trim());
  if (encounterNotes.trim()) parts.push(`--- ENCOUNTER NOTES ---\n${encounterNotes.trim()}`);
  return parts.join('\n\n');
}

/** Generate 10-min increment time slots for quick-pick */
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 10) {
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  return slots;
}

/** Format 24h time to 12h display */
function formatTime12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Get the nearest 10-min slot to now */
function getNearestSlot(): string {
  const now = new Date();
  const h = now.getHours();
  const m = Math.round(now.getMinutes() / 10) * 10;
  if (m === 60) {
    const next = h + 1;
    return `${(next % 24).toString().padStart(2, '0')}:00`;
  }
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const TIME_SLOTS = generateTimeSlots();

export function ParseModal({ isOpen, onClose, onSave }: ParseModalProps) {
  const [pasteText, setPasteText] = useState('');
  const [triageVitals, setTriageVitals] = useState('');
  const [transcript, setTranscript] = useState('');
  const [preRecordTranscript, setPreRecordTranscript] = useState('');
  const [encounterNotes, setEncounterNotes] = useState('');
  const [preRecordEncounter, setPreRecordEncounter] = useState('');
  const [preRecordAdditional, setPreRecordAdditional] = useState('');
  const [additional, setAdditional] = useState('');
  const [pastDocs, setPastDocs] = useState('');
  const [encounterTime, setEncounterTime] = useState('');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [userPhrases, setUserPhrases] = useState<string[]>([]);
  const [generateNote, setGenerateNote] = useState(true);
  const [savedFormats, setSavedFormats] = useState<any[]>([]);
  const [activeFormat, setActiveFormat] = useState(() => getParseRules().formatName || 'Meditech');
  const [daySheetMode, setDaySheetMode] = useState(false);
  const [daySheetPatients, setDaySheetPatients] = useState<any[]>([]);
  const [daySheetLoading, setDaySheetLoading] = useState(false);
  const [daySheetError, setDaySheetError] = useState('');
  const [showLiveTranscript, setShowLiveTranscript] = useState(true);
  const daySheetInputRef = useRef<HTMLInputElement>(null);
  const timeScrollRef = useRef<HTMLDivElement>(null);

  // Fetch user's saved phrases and parse formats
  useEffect(() => {
    if (isOpen) {
      fetch('/api/user-phrases')
        .then(r => r.ok ? r.json() : { phrases: [] })
        .then(data => setUserPhrases(data.phrases || []))
        .catch(() => {});
      fetch('/api/parse-formats')
        .then(r => r.ok ? r.json() : [])
        .then(data => { if (Array.isArray(data)) setSavedFormats(data); })
        .catch(() => {});
      setActiveFormat(getParseRules().formatName || 'Meditech');
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

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!pasteText.trim()) {
      setError('Please paste patient data first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Try to get active format example for AI-based parsing
      let formatExample: any = null;
      try {
        const parseRules = getParseRules();
        if (parseRules.formatName) {
          const fmtRes = await fetch('/api/parse-formats');
          if (fmtRes.ok) {
            const formats = await fmtRes.json();
            const active = formats.find((f: any) => f.name === parseRules.formatName);
            if (active?.sampleText && active?.fieldName) {
              formatExample = active;
            }
          }
        }
      } catch {}

      const parseRules = getParseRules();
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pasteText,
          parseRules,
          ...(formatExample ? { formatExample } : {}),
        }),
      });

      if (!res.ok) throw new Error('Failed to parse');

      const data = await res.json();
      const timestamp = encounterTime || getNearestSlot();
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

  const handleSave = (shouldGenerate?: boolean) => {
    if (parsedData) {
      savePhrasesInBackground(encounterNotes, additional);

      const timestamp = encounterTime || getNearestSlot();
      onSave({
        ...parsedData,
        timestamp,
        triageVitals,
        transcript,
        encounterNotes,
        additional,
        pastDocs,
        _generateNote: shouldGenerate ?? generateNote,
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

  const openTimePicker = () => {
    setShowTimePicker(true);
    // Scroll to nearest slot after render
    requestAnimationFrame(() => {
      if (timeScrollRef.current) {
        const nearest = encounterTime || getNearestSlot();
        const idx = TIME_SLOTS.indexOf(nearest);
        if (idx !== -1) {
          const itemHeight = 44;
          const containerHeight = timeScrollRef.current.clientHeight;
          timeScrollRef.current.scrollTop = Math.max(0, idx * itemHeight - containerHeight / 2 + itemHeight / 2);
        }
      }
    });
  };

  const selectTime = (slot: string) => {
    setEncounterTime(slot);
    setShowTimePicker(false);
  };

  const patientContext = {
    age: parsedData?.age,
    gender: parsedData?.gender,
    chiefComplaint: triageVitals.split('\n')[0] || '',
  };

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center">
      <div className="bg-[var(--card-bg)] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
        {/* Header */}
        <div className="dash-header flex items-center justify-between px-5 py-4 sm:rounded-t-3xl">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--dash-text)' }}>Add Patient</h2>
          <button onClick={onClose} className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-full">
            <X className="w-5 h-5" style={{ color: 'var(--dash-text-sub)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Paste Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
                Patient Information
              </label>
              <select
                value={daySheetMode ? 'daysheet' : activeFormat}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'daysheet') {
                    setDaySheetMode(true);
                    return;
                  }
                  setDaySheetMode(false);
                  setDaySheetPatients([]);
                  setActiveFormat(val);
                  if (val === 'Meditech') {
                    saveParseRules(DEFAULT_PARSE_RULES);
                  } else {
                    const fmt = savedFormats.find((f: any) => f.name === val);
                    if (fmt) {
                      saveParseRules({
                        formatName: fmt.name,
                        ageDobPattern: fmt.ageDobPattern || '',
                        hcnPattern: fmt.hcnPattern || '',
                        mrnPattern: fmt.mrnPattern || '',
                        nameCleanup: fmt.nameCleanup || '',
                      });
                    }
                  }
                }}
                className="px-2 py-0.5 border border-[var(--input-border)] rounded-lg text-[11px] bg-[var(--input-bg)] text-[var(--text-secondary)] focus:ring-1 focus:ring-blue-500"
              >
                <option value="Meditech">Meditech</option>
                {savedFormats.filter((f: any) => f.name !== 'Meditech').map((f: any) => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
                <option value="daysheet">Input Health Day Sheet</option>
              </select>
            </div>
            {daySheetMode ? (
              <>
                {/* Day sheet upload */}
                <input
                  ref={daySheetInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = '';
                    setDaySheetLoading(true);
                    setDaySheetError('');
                    setDaySheetPatients([]);
                    try {
                      const fd = new FormData();
                      fd.append('file', file);
                      const res = await fetch('/api/parse-daysheet', { method: 'POST', body: fd });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || 'Failed to parse');
                      }
                      const { patients } = await res.json();
                      setDaySheetPatients(patients || []);
                    } catch (err: any) {
                      setDaySheetError(err.message || 'Failed to parse day sheet');
                    } finally {
                      setDaySheetLoading(false);
                    }
                  }}
                />
                <button
                  onClick={() => daySheetInputRef.current?.click()}
                  disabled={daySheetLoading}
                  className="w-full py-8 border-2 border-dashed border-[var(--border)] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors disabled:opacity-50"
                >
                  {daySheetLoading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  ) : (
                    <Upload className="w-6 h-6 text-[var(--text-muted)]" />
                  )}
                  <span className="text-sm text-[var(--text-secondary)]">
                    {daySheetLoading ? 'Parsing day sheet...' : 'Upload InputHealth Day Sheet (PDF)'}
                  </span>
                </button>
                {daySheetError && (
                  <p className="text-xs text-red-500 mt-1">{daySheetError}</p>
                )}
                {daySheetPatients.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {daySheetPatients.length} patients found
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
                      {daySheetPatients.map((p: any, i: number) => (
                        <div key={i} className="px-3 py-2 text-sm flex items-center justify-between">
                          <div className="min-w-0">
                            <span className="font-medium text-[var(--text-primary)]">{p.name}</span>
                            <span className="text-[var(--text-muted)] ml-2 text-xs">{p.time}</span>
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] truncate ml-2 max-w-[120px]">{p.note?.substring(0, 40)}{p.note?.length > 40 ? '...' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste patient info..."
                  className="w-full h-28 p-3 border border-[var(--input-border)] rounded-xl text-sm font-mono resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                <button
                  onClick={handleParse}
                  disabled={loading || !pasteText.trim()}
                  className="mt-2 w-full py-2.5 bg-blue-600 dark:bg-blue-500 text-white rounded-xl font-medium disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-blue-700 dark:hover:bg-blue-600 active:scale-[0.97] transition-all"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Clipboard className="w-4 h-4" />
                  )}
                  Parse Data
                </button>
              </>
            )}
          </div>

          {/* Parsed Result */}
          {parsedData && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 animate-fadeIn">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium mb-2">
                <Check className="w-4 h-4" />
                Parsed Successfully
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-sm">
                <div><span className="text-[var(--text-muted)]">Name:</span> <span className="text-[var(--text-primary)]">{parsedData.name}</span></div>
                <div><span className="text-[var(--text-muted)]">Age:</span> <span className="text-[var(--text-primary)]">{parsedData.age} {parsedData.gender}</span></div>
                <div><span className="text-[var(--text-muted)]">DOB:</span> <span className="text-[var(--text-primary)]">{parsedData.birthday}</span></div>
                <div><span className="text-[var(--text-muted)]">HCN:</span> <span className="text-[var(--text-primary)]">{parsedData.hcn}</span></div>
                <div><span className="text-[var(--text-muted)]">MRN:</span> <span className="text-[var(--text-primary)]">{parsedData.mrn}</span></div>
                <div><span className="text-[var(--text-muted)]">Time:</span> <span className="text-[var(--text-primary)]">{encounterTime ? formatTime12(encounterTime) : parsedData.timestamp}</span></div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Encounter Time */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
              Encounter Time
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={openTimePicker}
                className="w-full flex items-center gap-2 p-3 border border-[var(--input-border)] rounded-xl text-sm bg-[var(--input-bg)] text-left hover:border-blue-400 focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <Clock className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                {encounterTime ? (
                  <span className="text-[var(--text-primary)] font-medium">{formatTime12(encounterTime)}</span>
                ) : (
                  <span className="text-[var(--text-muted)]">Tap to set time</span>
                )}
                {encounterTime && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEncounterTime(''); }}
                    className="ml-auto p-0.5 hover:bg-[var(--bg-tertiary)] rounded"
                  >
                    <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  </button>
                )}
              </button>

              {/* Time Picker Dropdown */}
              {showTimePicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowTimePicker(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl overflow-hidden animate-fadeIn" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
                    {/* Now button */}
                    <button
                      onClick={() => selectTime(getNearestSlot())}
                      className="w-full px-4 py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-b border-[var(--border)] hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors text-left"
                    >
                      Now ({formatTime12(getNearestSlot())})
                    </button>
                    {/* Manual input */}
                    <div className="px-3 py-2 border-b border-[var(--border)]">
                      <input
                        type="time"
                        value={encounterTime}
                        onChange={(e) => { setEncounterTime(e.target.value); setShowTimePicker(false); }}
                        className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        autoFocus
                      />
                    </div>
                    {/* Scrollable time slots */}
                    <div ref={timeScrollRef} className="max-h-48 overflow-y-auto">
                      {TIME_SLOTS.map((slot) => {
                        const isSelected = slot === encounterTime;
                        const [h] = slot.split(':').map(Number);
                        const isHourBoundary = slot.endsWith(':00');
                        return (
                          <button
                            key={slot}
                            onClick={() => selectTime(slot)}
                            className={`w-full px-4 py-2.5 text-sm text-left transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium'
                                : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                            } ${isHourBoundary ? 'border-t border-[var(--border-light)]' : ''}`}
                          >
                            <span>{formatTime12(slot)}</span>
                            {isSelected && <Check className="w-4 h-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

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
                  mode="dictation"
                  onTranscript={(text) => {
                    const base = preRecordEncounter || encounterNotes;
                    setEncounterNotes(base ? `${base}\n${text}` : text);
                  }}
                  onRecordingStart={() => setPreRecordEncounter(encounterNotes)}
                  onInterimTranscript={(text) => {
                    setEncounterNotes(preRecordEncounter ? `${preRecordEncounter}\n${text}` : text);
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
                  mode="dictation"
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

        {/* Footer — with safe area padding for iPhone home indicator */}
        <div className="px-5 py-4 pb-safe border-t border-[var(--border)] bg-[var(--bg-tertiary)] sm:rounded-b-3xl">
          {daySheetMode && daySheetPatients.length > 0 ? (
            <button
              onClick={() => {
                // Save all day sheet patients
                for (const p of daySheetPatients) {
                  onSave({
                    name: p.name || '',
                    age: '',
                    gender: '',
                    birthday: p.dob || '',
                    hcn: p.hcn || '',
                    mrn: '',
                    timestamp: p.time || '',
                    triageVitals: [p.note, p.type, p.status].filter(Boolean).join(' | '),
                    transcript: '',
                    encounterNotes: '',
                    additional: '',
                    pastDocs: '',
                    _generateNote: false,
                  });
                }
                setDaySheetPatients([]);
                setDaySheetMode(false);
                onClose();
              }}
              className="w-full py-3.5 min-h-[48px] bg-emerald-600 dark:bg-emerald-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 dark:hover:bg-emerald-600 active:scale-[0.97] transition-all"
            >
              <Check className="w-4 h-4" />
              Add All {daySheetPatients.length} Patients
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => handleSave(false)}
                disabled={!parsedData}
                className="flex-1 py-3 min-h-[48px] bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl font-medium disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all"
              >
                Save
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={!parsedData}
                className="flex-1 py-3 min-h-[48px] bg-emerald-600 dark:bg-emerald-500 text-white rounded-xl font-medium disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-emerald-700 dark:hover:bg-emerald-600 active:scale-[0.97] transition-all"
              >
                Generate Note
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
