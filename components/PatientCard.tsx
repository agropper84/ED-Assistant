'use client';

import { useState, useRef } from 'react';
import { Patient } from '@/lib/google-sheets';
import { Clock, User, FileText, Trash2, DollarSign, Stethoscope, Copy, Check, Brain, ClipboardList, BookOpen, Play, Loader2, X, MessageCircleQuestion, Merge, CalendarDays, GraduationCap, ExternalLink, Calculator, Bookmark } from 'lucide-react';

interface PatientCardProps {
  patient: Patient;
  onClick: () => void;
  onDelete?: () => void;
  anonymize?: boolean;
  onTimeChange?: (time: string) => void;
  onBillingToggle?: () => void;
  billingCodes?: string;
  onNavigate?: () => void;
  onProcess?: () => Promise<void>;
  onGenerateAnalysis?: () => Promise<void>;
  onUpdateFields?: (fields: Record<string, string>) => Promise<void>;
  onClinicalChat?: () => void;
  onMerge?: () => void;
  onDateChange?: (newSheetName: string) => void;
  onGenerateEducation?: () => Promise<void>;
  showEducation?: boolean;
  onCalculator?: () => void;
  onSaveResource?: (resource: { type: 'evidence' | 'education'; content: string; patientName: string; diagnosis: string }) => void;
  savedResourceKey?: (type: 'evidence' | 'education') => boolean;
}

/** Convert a full name to initials, e.g. "John Smith" → "J.S." */
function toInitials(name: string): string {
  if (!name) return '—';
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + '.')
    .join('');
}

// Unified empty-state color for unfilled icons
const EMPTY = 'text-slate-300 dark:text-slate-600';

/** Render text with markdown links [text](url) and bare URLs as clickable <a> tags */
function Linkified({ text }: { text: string }) {
  // Match markdown links [text](url) or bare https:// URLs
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
        if (mdMatch) {
          return (
            <a key={i} href={mdMatch[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
              {mdMatch[1]}
            </a>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function PatientCard({ patient, onClick, onDelete, anonymize, onTimeChange, onBillingToggle, billingCodes, onNavigate, onProcess, onGenerateAnalysis, onUpdateFields, onClinicalChat, onMerge, onDateChange, onGenerateEducation, showEducation, onCalculator, onSaveResource, savedResourceKey }: PatientCardProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [timeValue, setTimeValue] = useState(patient.timestamp || '');
  const [noteCopied, setNoteCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatingIcon, setGeneratingIcon] = useState<'synopsis' | 'management' | 'evidence' | 'education' | null>(null);
  const [editingDemo, setEditingDemo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editHcn, setEditHcn] = useState('');
  const [editMrn, setEditMrn] = useState('');
  const [savingDemo, setSavingDemo] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const hasEncounterNote = !!(patient.hpi || patient.objective || patient.assessmentPlan);
  const hasAnalysis = !!(patient.synopsis || patient.management || patient.evidence);
  const hasInputData = !!(patient.transcript || patient.triageVitals || patient.additional || patient.diagnosis);
  const showInfoIcons = hasEncounterNote || hasAnalysis || (hasInputData && !!onGenerateAnalysis);

  const displayName = anonymize ? toInitials(patient.name) : (patient.name || 'No name');

  const handleTimeSave = () => {
    if (onTimeChange && timeValue !== patient.timestamp) {
      onTimeChange(timeValue);
    }
    setEditingTime(false);
  };

  return (
    <div className="group/card relative">
      {/* Delete button — left side, revealed as card slides right */}
      {onDelete && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-[35] opacity-0 group-hover/card:opacity-100 transition-all duration-200 scale-90 group-hover/card:scale-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-7 h-7 flex items-center justify-center bg-[var(--card-bg)] border border-[var(--border)] rounded-full shadow-sm hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-300 dark:hover:border-red-700 transition-all active:scale-90"
            title="Delete patient"
          >
            <Trash2 className="w-3 h-3 text-[var(--text-muted)] hover:text-red-500 dark:hover:text-red-400 transition-colors" />
          </button>
        </div>
      )}

      {/* Card body — slides right on hover to reveal delete */}
      <div
        className={`patient-card relative flex items-center transition-all duration-200 ${onDelete ? 'group-hover/card:translate-x-6' : ''}`}
        data-status={patient.status}
      >

      {/* Main content area */}
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left px-5 py-4"
      >
        {/* Top row: Name + badges + inline info icons */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`font-semibold text-[var(--text-primary)] truncate ${onUpdateFields ? 'hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer' : ''}`}
            onClick={onUpdateFields ? (e) => {
              e.stopPropagation();
              e.preventDefault();
              setEditName(patient.name || '');
              setEditAge(patient.age || '');
              setEditGender(patient.gender || '');
              setEditBirthday(patient.birthday || '');
              setEditHcn(patient.hcn || '');
              setEditMrn(patient.mrn || '');
              setEditingDemo(true);
            } : undefined}
          >
            {displayName}
          </span>

          {/* Info icons — inline with name */}
          {showInfoIcons && (
            <>
              {/* Encounter note — emerald green */}
              {hasEncounterNote && onNavigate && (
                <div className="relative group/note flex-shrink-0">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate();
                    }}
                    className="p-0.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition-colors cursor-pointer inline-flex"
                  >
                    <FileText className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  </span>
                  <div className="absolute left-0 top-full h-2 w-80 hidden group-hover/note:block" />
                  <div
                    className="absolute left-0 top-full mt-2 z-50 hidden group-hover/note:block w-80 max-h-64 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl ring-1 ring-white/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-2 sticky top-0 bg-gray-900 pb-1">
                      <span className="text-emerald-400 font-medium">Encounter Note</span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const fullNote = `HPI:\n${patient.hpi}\n\nOBJECTIVE:\n${patient.objective}\n\nASSESSMENT & PLAN:\n${patient.assessmentPlan}`;
                          await navigator.clipboard.writeText(fullNote);
                          setNoteCopied(true);
                          setTimeout(() => setNoteCopied(false), 2000);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-200 transition-colors"
                      >
                        {noteCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {noteCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed space-y-2">
                      {patient.hpi && (
                        <div><span className="text-emerald-400 font-medium">HPI:</span> {patient.hpi}</div>
                      )}
                      {patient.objective && (
                        <div><span className="text-emerald-400 font-medium">Objective:</span> {patient.objective}</div>
                      )}
                      {patient.assessmentPlan && (
                        <div><span className="text-emerald-400 font-medium">A&P:</span> {patient.assessmentPlan}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Synopsis — blue (echoes header) */}
              <div className="relative group/synopsis flex-shrink-0">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!patient.synopsis && onGenerateAnalysis && !generatingIcon) {
                      setGeneratingIcon('synopsis');
                      onGenerateAnalysis().finally(() => setGeneratingIcon(null));
                    } else if (patient.synopsis && onNavigate) {
                      onNavigate();
                    }
                  }}
                  className={`p-0.5 rounded transition-colors inline-flex ${patient.synopsis || onGenerateAnalysis ? 'hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer' : ''}`}
                  title={patient.synopsis ? '' : 'Generate synopsis & analysis'}
                >
                  {generatingIcon === 'synopsis' ? (
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  ) : (
                    <Brain className={`w-4 h-4 ${patient.synopsis ? 'text-blue-600 dark:text-blue-400' : EMPTY}`} />
                  )}
                </span>
                {patient.synopsis && (
                  <>
                    <div className="absolute left-0 top-full h-2 w-72 hidden group-hover/synopsis:block" />
                    <div
                      className="absolute left-0 top-full mt-2 z-50 hidden group-hover/synopsis:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl ring-1 ring-white/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-blue-400 font-medium block mb-1">Synopsis</span>
                      <p className="whitespace-pre-wrap leading-relaxed">{patient.synopsis}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Management — violet (purple complement) */}
              <div className="relative group/mgmt flex-shrink-0">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!patient.management && onGenerateAnalysis && !generatingIcon) {
                      setGeneratingIcon('management');
                      onGenerateAnalysis().finally(() => setGeneratingIcon(null));
                    } else if (patient.management && onNavigate) {
                      onNavigate();
                    }
                  }}
                  className={`p-0.5 rounded transition-colors inline-flex ${patient.management || onGenerateAnalysis ? 'hover:bg-violet-50 dark:hover:bg-violet-900/30 cursor-pointer' : ''}`}
                  title={patient.management ? '' : 'Generate synopsis & analysis'}
                >
                  {generatingIcon === 'management' ? (
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                  ) : (
                    <ClipboardList className={`w-4 h-4 ${patient.management ? 'text-violet-600 dark:text-violet-400' : EMPTY}`} />
                  )}
                </span>
                {patient.management && (
                  <>
                    <div className="absolute left-0 top-full h-2 w-72 hidden group-hover/mgmt:block" />
                    <div
                      className="absolute left-0 top-full mt-2 z-50 hidden group-hover/mgmt:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl ring-1 ring-white/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-violet-400 font-medium block mb-1">Management</span>
                      <p className="whitespace-pre-wrap leading-relaxed">{patient.management}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Evidence — amber (warm accent) */}
              <div className="relative group/evidence flex-shrink-0">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!patient.evidence && onGenerateAnalysis && !generatingIcon) {
                      setGeneratingIcon('evidence');
                      onGenerateAnalysis().finally(() => setGeneratingIcon(null));
                    } else if (patient.evidence && onNavigate) {
                      onNavigate();
                    }
                  }}
                  className={`p-0.5 rounded transition-colors inline-flex ${patient.evidence || onGenerateAnalysis ? 'hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer' : ''}`}
                  title={patient.evidence ? '' : 'Generate synopsis & analysis'}
                >
                  {generatingIcon === 'evidence' ? (
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                  ) : (
                    <BookOpen className={`w-4 h-4 ${patient.evidence ? 'text-amber-600 dark:text-amber-400' : EMPTY}`} />
                  )}
                </span>
                {patient.evidence && (
                  <>
                    <div className="absolute left-0 top-full h-2 w-72 hidden group-hover/evidence:block" />
                    <div
                      className="absolute left-0 top-full mt-2 z-50 hidden group-hover/evidence:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl ring-1 ring-white/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-amber-400 font-medium">Evidence</span>
                        {onSaveResource && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSaveResource({ type: 'evidence', content: patient.evidence, patientName: patient.name, diagnosis: patient.diagnosis }); }}
                            className="p-0.5 rounded hover:bg-white/10 transition-colors"
                            title={savedResourceKey?.('evidence') ? 'Saved' : 'Save to library'}
                          >
                            <Bookmark className="w-3.5 h-3.5 text-amber-400" fill={savedResourceKey?.('evidence') ? 'currentColor' : 'none'} />
                          </button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed"><Linkified text={patient.evidence} /></p>
                    </div>
                  </>
                )}
              </div>

              {/* Education — emerald-green (learning) */}
              {showEducation && (
                <div className="relative group/edu flex-shrink-0">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!patient.education && onGenerateEducation && !generatingIcon) {
                        setGeneratingIcon('education');
                        onGenerateEducation().finally(() => setGeneratingIcon(null));
                      } else if (patient.education && onNavigate) {
                        onNavigate();
                      }
                    }}
                    className={`p-0.5 rounded transition-colors inline-flex ${patient.education || onGenerateEducation ? 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 cursor-pointer' : ''}`}
                    title={patient.education ? '' : 'Generate learning resources'}
                  >
                    {generatingIcon === 'education' ? (
                      <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                    ) : (
                      <GraduationCap className={`w-4 h-4 ${patient.education ? 'text-emerald-600 dark:text-emerald-400' : EMPTY}`} />
                    )}
                  </span>
                  {patient.education && (
                    <>
                      <div className="absolute left-0 top-full h-2 w-72 hidden group-hover/edu:block" />
                      <div
                        className="absolute left-0 top-full mt-2 z-50 hidden group-hover/edu:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl ring-1 ring-white/10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-emerald-400 font-medium">Learning Resources</span>
                          {onSaveResource && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onSaveResource({ type: 'education', content: patient.education, patientName: patient.name, diagnosis: patient.diagnosis }); }}
                              className="p-0.5 rounded hover:bg-white/10 transition-colors"
                              title={savedResourceKey?.('education') ? 'Saved' : 'Save to library'}
                            >
                              <Bookmark className="w-3.5 h-3.5 text-emerald-400" fill={savedResourceKey?.('education') ? 'currentColor' : 'none'} />
                            </button>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed"><Linkified text={patient.education} /></p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Clinical Q&A — cyan (conversational feel) */}
          {onClinicalChat && (
            <div className="relative group/qa flex-shrink-0">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClinicalChat();
                }}
                className="p-0.5 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded transition-colors cursor-pointer inline-flex"
                title="Clinical questions"
              >
                <MessageCircleQuestion className={`w-4 h-4 ${patient.clinicalQA ? 'text-cyan-600 dark:text-cyan-400' : EMPTY}`} />
              </span>
              {patient.clinicalQA && (() => {
                try {
                  const qa = JSON.parse(patient.clinicalQA);
                  if (!Array.isArray(qa) || qa.length < 2) return null;
                  const lastQ = qa[qa.length - 2];
                  const lastA = qa[qa.length - 1];
                  return (
                    <>
                      <div className="absolute left-0 top-full h-2 w-72 hidden group-hover/qa:block" />
                      <div
                        className="absolute left-0 top-full mt-2 z-50 hidden group-hover/qa:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl ring-1 ring-white/10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-cyan-400 font-medium block mb-1">Last Q&A</span>
                        <p className="text-cyan-300/80 mb-1"><strong>Q:</strong> {lastQ?.content}</p>
                        <p className="whitespace-pre-wrap leading-relaxed"><strong>A:</strong> {lastA?.content?.slice(0, 200)}{lastA?.content?.length > 200 ? '...' : ''}</p>
                      </div>
                    </>
                  );
                } catch { return null; }
              })()}
            </div>
          )}
        </div>

        {/* Bottom row: metadata */}
        <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
          {patient.timestamp && !editingTime && (
            <span className="flex items-center gap-1">
              <span
                className="flex items-center gap-1 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setTimeValue(patient.timestamp);
                  setEditingTime(true);
                }}
              >
                <Clock className="w-3.5 h-3.5" />
                {patient.timestamp}
              </span>
              {onDateChange && (
                <span
                  className="hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    dateInputRef.current?.showPicker();
                  }}
                  title="Move to different date"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <input
                    ref={dateInputRef}
                    type="date"
                    className="sr-only"
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                      const newSheet = `${months[m - 1]} ${d.toString().padStart(2, '0')}, ${y}`;
                      if (newSheet !== patient.sheetName) {
                        onDateChange(newSheet);
                      }
                    }}
                  />
                </span>
              )}
            </span>
          )}
          {(patient.age || patient.gender) && (
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {patient.age}{patient.gender && ` ${patient.gender}`}
            </span>
          )}
          {patient.diagnosis && (
            <span className="flex items-center gap-1 truncate">
              <Stethoscope className="w-3.5 h-3.5" />
              {patient.diagnosis}
            </span>
          )}
        </div>
      </button>

      {/* Right action icons — appear on hover */}
      <div className="flex items-center gap-0.5 pr-2 flex-shrink-0 self-center opacity-0 group-hover/card:opacity-100 transition-all duration-200 translate-x-2 group-hover/card:translate-x-0">

        {/* Inline time editor */}
        {editingTime && (
          <div
            className="flex items-center gap-1 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              onBlur={handleTimeSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTimeSave(); }}
              autoFocus
              className="w-24 p-1 border border-[var(--input-border)] rounded text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
            />
          </div>
        )}

        {/* Process — play button for pending patients */}
        {patient.status === 'pending' && onProcess && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (isProcessing) return;
              setIsProcessing(true);
              try { await onProcess(); } finally { setIsProcessing(false); }
            }}
            disabled={isProcessing}
            className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
            title="Create Encounter Note"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
            ) : (
              <Play className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            )}
          </button>
        )}

        {/* Billing — teal (distinct from encounter note's emerald) */}
        {onBillingToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBillingToggle();
            }}
            className="p-1.5 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors"
            title="Billing"
          >
            {billingCodes ? (
              <span className="text-xs font-medium text-teal-700 dark:text-teal-400 whitespace-nowrap">
                {billingCodes}
              </span>
            ) : (
              <DollarSign className="w-4 h-4 text-[var(--text-muted)] hover:text-teal-600 dark:hover:text-teal-400 transition-colors" />
            )}
          </button>
        )}

        {/* Merge — blue */}
        {onMerge && patient.name?.startsWith('New Encounter') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMerge();
            }}
            className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            title="Assign to existing patient"
          >
            <Merge className="w-4 h-4 text-[var(--text-muted)] hover:text-blue-500 dark:hover:text-blue-400 transition-colors" />
          </button>
        )}

        {/* Calculator */}
        {onCalculator && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCalculator();
            }}
            className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
            title="Calculator"
          >
            <Calculator className={`w-4 h-4 ${(patient as any).hasCalcHistory ? 'text-orange-500 dark:text-orange-400' : EMPTY} transition-colors`} />
          </button>
        )}

        {/* Open full view */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate?.();
          }}
          className="p-1.5 rounded-lg transition-all opacity-0 group-hover/card:opacity-100 hover:bg-blue-50 dark:hover:bg-blue-900/30"
          title="Open full view"
        >
          <ExternalLink className="w-4 h-4 text-blue-400 dark:text-blue-500 transition-colors hover:text-blue-600 dark:hover:text-blue-400" />
        </button>
      </div>

      {/* Inline demographics editor */}
      {editingDemo && (
        <div
          className="absolute left-0 right-0 top-0 z-40 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-xl animate-scaleIn"
          onClick={(e) => e.stopPropagation()}
          style={{ boxShadow: 'var(--card-shadow)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Edit Patient Info</span>
            <button
              onClick={() => setEditingDemo(false)}
              className="p-1 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Patient name"
              autoFocus
              className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={editAge}
                onChange={(e) => setEditAge(e.target.value)}
                placeholder="Age"
                className="w-20 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
              />
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value)}
                className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
              >
                <option value="">Gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="Other">Other</option>
              </select>
              <input
                type="text"
                value={editBirthday}
                onChange={(e) => setEditBirthday(e.target.value)}
                placeholder="DOB"
                className="w-28 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={editHcn}
                onChange={(e) => setEditHcn(e.target.value)}
                placeholder="HCN"
                className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
              />
              <input
                type="text"
                value={editMrn}
                onChange={(e) => setEditMrn(e.target.value)}
                placeholder="MRN"
                className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={async () => {
                  if (!onUpdateFields) return;
                  setSavingDemo(true);
                  try {
                    await onUpdateFields({
                      name: editName.trim(),
                      age: editAge.trim(),
                      gender: editGender,
                      birthday: editBirthday.trim(),
                      hcn: editHcn.trim(),
                      mrn: editMrn.trim(),
                    });
                    setEditingDemo(false);
                  } catch (err) {
                    console.error('Failed to update patient info:', err);
                  } finally {
                    setSavingDemo(false);
                  }
                }}
                disabled={savingDemo}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingDemo && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
              <button
                onClick={() => setEditingDemo(false)}
                className="px-3 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </div>{/* end patient-card */}
    </div>
  );
}
