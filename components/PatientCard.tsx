'use client';

import { useState, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Patient } from '@/lib/google-sheets';
import { Clock, User, FileText, Trash2, DollarSign, Stethoscope, Copy, Check, Brain, ListTree, BookOpen, Play, Loader2, X, MessageCircleQuestion, Merge, CalendarDays, GraduationCap, Bookmark, Heart, Pin } from 'lucide-react';
import { ProfileSummary } from '@/components/PatientProfile';
import { QuickRecordButton } from '@/components/QuickRecordButton';
import type { PatientProfile } from '@/app/api/profile/route';

interface PatientCardProps {
  patient: Patient;
  onClick: () => void;
  onDelete?: () => void;
  anonymize?: boolean;
  onTimeChange?: (time: string) => void;
  onBillingToggle?: () => void;
  billingCodes?: string;
  onNavigate?: () => void;
  onSplitView?: () => void;
  onProcess?: () => Promise<void>;
  onGenerateAnalysis?: () => Promise<void>;
  onGenerateSynopsis?: () => Promise<void>;
  onGenerateManagement?: () => Promise<void>;
  onGenerateEvidence?: () => Promise<void>;
  onGenerateDdxInvestigations?: () => Promise<void>;
  onGenerateManagementEvidence?: () => Promise<void>;
  onUpdateFields?: (fields: Record<string, string>) => Promise<void>;
  onClinicalChat?: () => void;
  onMerge?: () => void;
  onDateChange?: (newSheetName: string) => void;
  onGenerateEducation?: () => Promise<void>;
  showEducation?: boolean;
  showIconsAlways?: boolean;
  onGenerateProfile?: () => Promise<void>;
  onSaveResource?: (resource: { type: 'evidence' | 'education'; content: string; patientName: string; diagnosis: string }) => void;
  savedResourceKey?: (type: 'evidence' | 'education') => boolean;
  onQuickRecordComplete?: () => void;
  isPinned?: boolean;
  onUnpin?: () => void;
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

/** Portal-based tooltip that renders above all cards */
function IconTooltip({ anchorRef, visible, children }: { anchorRef: React.RefObject<HTMLElement | null>; visible: boolean; children: React.ReactNode }) {
  if (!visible || typeof document === 'undefined' || !anchorRef.current) return null;

  const rect = anchorRef.current.getBoundingClientRect();
  const top = rect.bottom + 8;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 320));

  return createPortal(
    <div
      className="fixed z-[200] w-80 max-h-64 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl ring-1 ring-white/10"
      style={{ top, left }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

export const PatientCard = memo(function PatientCard({ patient, onClick, onDelete, anonymize, onTimeChange, onBillingToggle, billingCodes, onNavigate, onSplitView, onProcess, onGenerateAnalysis, onGenerateSynopsis, onGenerateManagement, onGenerateEvidence, onGenerateDdxInvestigations, onGenerateManagementEvidence, onUpdateFields, onClinicalChat, onMerge, onDateChange, onGenerateEducation, showEducation, showIconsAlways, onSaveResource, savedResourceKey, onGenerateProfile, onQuickRecordComplete, isPinned, onUnpin }: PatientCardProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [timeValue, setTimeValue] = useState(patient.timestamp || '');
  const [noteCopied, setNoteCopied] = useState(false);
  const [copiedIcon, setCopiedIcon] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatingIcon, setGeneratingIcon] = useState<'synopsis' | 'management' | 'evidence' | 'education' | null>(null);
  const [showProfilePopover, setShowProfilePopover] = useState(false);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [editingDemo, setEditingDemo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editHcn, setEditHcn] = useState('');
  const [editMrn, setEditMrn] = useState('');
  const [savingDemo, setSavingDemo] = useState(false);
  const [editingDiagnosis, setEditingDiagnosis] = useState(false);
  const [editDiagnosis, setEditDiagnosis] = useState('');
  const [savingDiagnosis, setSavingDiagnosis] = useState(false);
  const diagInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Tooltip state — replaces CSS group-hover with portal-based tooltips
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const tooltipRefs = {
    note: useRef<HTMLSpanElement>(null),
    synopsis: useRef<HTMLSpanElement>(null),
    ddx: useRef<HTMLSpanElement>(null),
    evidence: useRef<HTMLSpanElement>(null),
    education: useRef<HTMLSpanElement>(null),
    qa: useRef<HTMLSpanElement>(null),
  };
  const tooltipTimer = useRef<NodeJS.Timeout | null>(null);
  const showTooltip = (name: string) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setActiveTooltip(name);
  };
  const hideTooltip = () => {
    tooltipTimer.current = setTimeout(() => setActiveTooltip(null), 150);
  };
  const keepTooltip = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
  };

  const hasEncounterNote = !!(patient.hpi || patient.objective || patient.assessmentPlan);
  const hasAnalysis = !!(patient.synopsis || patient.ddx || patient.investigations || patient.management || patient.evidence);

  // Parse profile JSON for display
  let parsedProfile: PatientProfile | null = null;
  if (patient.profile) {
    try { parsedProfile = JSON.parse(patient.profile); } catch {}
  }
  const hasProfileContent = !!(parsedProfile && (parsedProfile.pmhx.length > 0 || parsedProfile.medications.length > 0 || parsedProfile.allergies.length > 0 || parsedProfile.socialHistory.length > 0 || parsedProfile.familyHistory.length > 0));
  const hasInputData = !!(patient.transcript || patient.triageVitals || patient.additional || patient.diagnosis);
  const showInfoIcons = hasEncounterNote || hasAnalysis || (hasInputData && !!onGenerateAnalysis);

  const displayName = anonymize ? toInitials(patient.name) : (patient.name || 'No name');

  const handleTimeSave = () => {
    if (onTimeChange && timeValue !== patient.timestamp) {
      onTimeChange(timeValue);
    }
    setEditingTime(false);
  };

  const handleDiagnosisSave = async () => {
    const newDiag = editDiagnosis.trim();
    if (!newDiag || !onUpdateFields || newDiag === patient.diagnosis) {
      setEditingDiagnosis(false);
      return;
    }
    setSavingDiagnosis(true);
    try {
      // Update diagnosis and get new ICD codes via AI
      const res = await fetch('/api/icd-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosis: newDiag }),
      });
      let icd9 = '';
      let icd10 = '';
      if (res.ok) {
        const data = await res.json();
        icd9 = data.icd9 || '';
        icd10 = data.icd10 || '';
      }
      await onUpdateFields({ diagnosis: newDiag, icd9, icd10 });
    } catch {}
    setSavingDiagnosis(false);
    setEditingDiagnosis(false);
  };

  const [showDelete, setShowDelete] = useState(false);
  const [editingRoom, setEditingRoom] = useState(false);
  const [roomValue, setRoomValue] = useState(patient.room || '');
  const [quickRecording, setQuickRecording] = useState(false);

  return (
    <div className="group/card relative" style={{ overflow: 'visible' }}>
      {/* Delete zone — narrow left edge hover area */}
      {onDelete && (
        <div
          className="absolute left-0 top-0 bottom-0 z-[36] flex items-center"
          style={{ width: showDelete ? '36px' : '12px' }}
          onMouseEnter={() => setShowDelete(true)}
          onMouseLeave={() => setShowDelete(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="ml-[2px] flex items-center justify-center rounded-full transition-all active:scale-90"
            style={{
              width: '24px', height: '24px', minWidth: '24px', minHeight: '24px',
              opacity: showDelete ? 1 : 0,
              transform: showDelete ? 'scale(1)' : 'scale(0.7)',
              background: showDelete ? undefined : 'transparent',
              pointerEvents: showDelete ? 'auto' : 'none',
            }}
            title="Delete patient"
          >
            <span
              className="group/del flex items-center justify-center rounded-full border transition-all hover:bg-red-100 dark:hover:bg-red-950/60 hover:border-red-400 dark:hover:border-red-600 hover:shadow-md bg-[var(--card-bg)] border-[var(--border)] shadow-sm"
              style={{ width: '24px', height: '24px' }}
            >
              <Trash2 style={{ width: '11px', height: '11px' }} className="text-[var(--text-muted)] group-hover/del:text-red-500 dark:group-hover/del:text-red-400 transition-colors" />
            </span>
          </button>
        </div>
      )}

      {/* Card body — slides right on left-edge hover to reveal delete */}
      <div
        className="patient-card relative flex items-center transition-all duration-200"
        style={{ transform: onDelete && showDelete ? 'translateX(32px)' : 'translateX(0)' }}
        data-status={patient.status}
        onMouseEnter={() => {}}
      >

      {/* Status left edge bar */}
      <div className="patient-card-edge" />

      {/* Room/location badge */}
      {editingRoom ? (
        <div className="flex-shrink-0 pl-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={roomValue}
            onChange={(e) => setRoomValue(e.target.value)}
            onBlur={() => {
              setEditingRoom(false);
              if (roomValue !== (patient.room || '') && onUpdateFields) {
                onUpdateFields({ room: roomValue });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Escape') { setRoomValue(patient.room || ''); setEditingRoom(false); }
              if (e.key === 'Backspace' && roomValue === '') {
                setEditingRoom(false);
                if (patient.room && onUpdateFields) onUpdateFields({ room: '' });
              }
            }}
            placeholder="Rm"
            autoFocus
            className="w-10 px-1 py-0.5 text-center text-[10px] font-semibold rounded bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      ) : (
        <div
          className="flex-shrink-0 pl-2 cursor-pointer group/room"
          onClick={(e) => { e.stopPropagation(); setEditingRoom(true); }}
          title={patient.room ? 'Edit room (right-click to clear)' : 'Add room/location'}
          onContextMenu={(e) => {
            if (patient.room && onUpdateFields) {
              e.preventDefault();
              e.stopPropagation();
              onUpdateFields({ room: '' });
            }
          }}
        >
          {patient.room ? (
            <span className="inline-flex items-center gap-0.5 justify-center min-w-[28px] px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide text-[var(--accent)] bg-[var(--accent-light)] border border-transparent hover:border-[var(--accent)] transition-colors">
              {patient.room}
              <X
                className="w-2.5 h-2.5 opacity-0 group-hover/room:opacity-60 hover:!opacity-100 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onUpdateFields) onUpdateFields({ room: '' });
                }}
              />
            </span>
          ) : (
            <span className="inline-flex items-center justify-center w-7 h-5 rounded text-[9px] text-[var(--text-muted)] opacity-0 group-hover/card:opacity-40 hover:!opacity-100 transition-opacity border border-dashed border-[var(--border)]">
              +
            </span>
          )}
        </div>
      )}

      {/* Main content area */}
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left px-3 py-3"
      >
        {/* Top row: Name + badges + inline info icons */}
        <div className="flex items-center gap-2.5 mb-0.5">
          {isPinned && onUnpin && (
            <span
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onUnpin(); }}
              className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer transition-colors"
              title="Unpin — return to sort order"
            >
              <Pin className="w-3 h-3" style={{ transform: 'rotate(45deg)' }} />
            </span>
          )}
          <span
            className={`font-medium text-[15px] tracking-tight text-[var(--text-primary)] truncate ${onUpdateFields ? 'hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer' : ''}`}
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

          {/* Icons: PMHx through Clinical Q&A — visible on card hover */}
          <div className={`flex items-center gap-1.5 transition-opacity duration-200 ${showIconsAlways ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}>
          <div className="relative flex-shrink-0">
            <span
              onClick={async (e) => {
                e.stopPropagation();
                if (hasProfileContent) {
                  setShowProfilePopover(!showProfilePopover);
                } else if (onGenerateProfile && !generatingProfile) {
                  setGeneratingProfile(true);
                  try { await onGenerateProfile(); } finally { setGeneratingProfile(false); }
                }
              }}
              className={`inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-semibold tracking-wide cursor-pointer transition-all active:scale-95 border ${
                hasProfileContent
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-200/80 dark:border-blue-700/50 hover:bg-blue-200 dark:hover:bg-blue-800/50'
                  : 'bg-gray-100 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 border-gray-200/80 dark:border-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700/50'
              }`}
              title={hasProfileContent ? 'View medical profile' : 'Generate medical profile'}
            >
              {generatingProfile ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <Heart className="w-2.5 h-2.5" fill={hasProfileContent ? 'currentColor' : 'none'} />
              )}
              PMHx
            </span>
            {showProfilePopover && hasProfileContent && parsedProfile && (
              <>
                <div
                  className="fixed inset-0 z-[100]"
                  onClick={(e) => { e.stopPropagation(); setShowProfilePopover(false); }}
                />
                <div
                  className="absolute left-0 top-full mt-2 z-[101] w-72 max-h-72 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-xl shadow-2xl ring-1 ring-white/10 animate-scaleIn"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-blue-400 font-semibold text-[13px]">Medical Profile</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowProfilePopover(false); }}
                      className="p-0.5 rounded hover:bg-white/10 transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                  <ProfileSummary profile={parsedProfile} />
                </div>
              </>
            )}
          </div>

          {/* Info icons — inline with name */}
          {showInfoIcons && (
            <>
              {/* Encounter note — emerald green */}
              {hasEncounterNote && onNavigate && (
                <div className="relative flex-shrink-0">
                  <span
                    ref={tooltipRefs.note}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (e.metaKey || e.ctrlKey) {
                        onNavigate();
                      } else {
                        const fullNote = [
                          patient.hpi && `HPI:\n${patient.hpi}`,
                          patient.objective && `OBJECTIVE:\n${patient.objective}`,
                          patient.assessmentPlan && `ASSESSMENT & PLAN:\n${patient.assessmentPlan}`,
                        ].filter(Boolean).join('\n\n');
                        await navigator.clipboard.writeText(fullNote);
                        setCopiedIcon('note');
                        setTimeout(() => setCopiedIcon(null), 1500);
                      }
                    }}
                    onMouseEnter={() => showTooltip('note')}
                    onMouseLeave={hideTooltip}
                    className="p-0.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition-colors cursor-pointer inline-flex"
                    title="Click to copy · ⌘+click to view"
                  >
                    {copiedIcon === 'note' ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                  </span>
                  <IconTooltip anchorRef={tooltipRefs.note} visible={activeTooltip === 'note'}>
                    <div onMouseEnter={keepTooltip} onMouseLeave={hideTooltip}>
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
                  </IconTooltip>
                </div>
              )}

              {/* Synopsis — blue */}
              <div className="relative flex-shrink-0">
                <span
                  ref={tooltipRefs.synopsis}
                  onMouseEnter={() => patient.synopsis && showTooltip('synopsis')}
                  onMouseLeave={hideTooltip}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const gen = onGenerateSynopsis || onGenerateAnalysis;
                    if (!patient.synopsis && gen && !generatingIcon) {
                      setGeneratingIcon('synopsis');
                      gen().finally(() => setGeneratingIcon(null));
                    } else if (patient.synopsis) {
                      if (e.metaKey || e.ctrlKey) {
                        if (gen && !generatingIcon) { setGeneratingIcon('synopsis'); gen().finally(() => setGeneratingIcon(null)); }
                      } else {
                        await navigator.clipboard.writeText(patient.synopsis);
                        setCopiedIcon('synopsis');
                        setTimeout(() => setCopiedIcon(null), 1500);
                      }
                    }
                  }}
                  className={`p-0.5 rounded transition-colors inline-flex ${patient.synopsis || onGenerateSynopsis || onGenerateAnalysis ? 'hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer' : ''}`}
                  title={patient.synopsis ? 'Click to copy · ⌘+click to regenerate' : 'Generate synopsis'}
                >
                  {generatingIcon === 'synopsis' ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" /> : copiedIcon === 'synopsis' ? <Check className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400`} /> : <Brain className={`w-3.5 h-3.5 ${patient.synopsis ? 'text-blue-600 dark:text-blue-400' : EMPTY}`} />}
                </span>
                {patient.synopsis && (
                  <IconTooltip anchorRef={tooltipRefs.synopsis} visible={activeTooltip === 'synopsis'}>
                    <div onMouseEnter={keepTooltip} onMouseLeave={hideTooltip}>
                      <span className="text-blue-400 font-medium block mb-1">Synopsis</span>
                      <p className="whitespace-pre-wrap leading-relaxed">{patient.synopsis}</p>
                    </div>
                  </IconTooltip>
                )}
              </div>

              {/* DDx & Investigations — violet */}
              <div className="relative flex-shrink-0">
                <span
                  ref={tooltipRefs.ddx}
                  onMouseEnter={() => (patient.ddx || patient.investigations) && showTooltip('ddx')}
                  onMouseLeave={hideTooltip}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const hasDdx = patient.ddx || patient.investigations;
                    const gen = onGenerateDdxInvestigations || onGenerateAnalysis;
                    if (!hasDdx && gen && !generatingIcon) {
                      setGeneratingIcon('management');
                      gen().finally(() => setGeneratingIcon(null));
                    } else if (hasDdx) {
                      if (e.metaKey || e.ctrlKey) {
                        if (gen && !generatingIcon) { setGeneratingIcon('management'); gen().finally(() => setGeneratingIcon(null)); }
                      } else {
                        const text = [patient.ddx && `DDx:\n${patient.ddx}`, patient.investigations && `Investigations:\n${patient.investigations}`].filter(Boolean).join('\n\n');
                        await navigator.clipboard.writeText(text);
                        setCopiedIcon('ddx');
                        setTimeout(() => setCopiedIcon(null), 1500);
                      }
                    }
                  }}
                  className={`p-0.5 rounded transition-colors inline-flex ${patient.ddx || patient.investigations || onGenerateDdxInvestigations || onGenerateAnalysis ? 'hover:bg-violet-50 dark:hover:bg-violet-900/30 cursor-pointer' : ''}`}
                  title={patient.ddx || patient.investigations ? 'Click to copy · ⌘+click to regenerate' : 'Generate DDx & investigations'}
                >
                  {generatingIcon === 'management' ? <Loader2 className="w-4 h-4 text-violet-400 animate-spin" /> : copiedIcon === 'ddx' ? <Check className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" /> : <ListTree className={`w-3.5 h-3.5 ${patient.ddx || patient.investigations ? 'text-violet-600 dark:text-violet-400' : EMPTY}`} />}
                </span>
                {(patient.ddx || patient.investigations) && (
                  <IconTooltip anchorRef={tooltipRefs.ddx} visible={activeTooltip === 'ddx'}>
                    <div onMouseEnter={keepTooltip} onMouseLeave={hideTooltip}>
                      {patient.ddx && (
                        <>
                          <span className="text-violet-400 font-medium block mb-1">Differential Diagnosis</span>
                          <p className="whitespace-pre-wrap leading-relaxed mb-2">{patient.ddx}</p>
                        </>
                      )}
                      {patient.investigations && (
                        <>
                          <span className="text-violet-400 font-medium block mb-1 border-t border-white/10 pt-2">Investigations</span>
                          <p className="whitespace-pre-wrap leading-relaxed">{patient.investigations}</p>
                        </>
                      )}
                    </div>
                  </IconTooltip>
                )}
              </div>

              {/* Management & Evidence — amber */}
              <div className="relative flex-shrink-0">
                <span
                  ref={tooltipRefs.evidence}
                  onMouseEnter={() => (patient.management || patient.evidence) && showTooltip('evidence')}
                  onMouseLeave={hideTooltip}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const hasContent = patient.management || patient.evidence;
                    const gen = onGenerateManagementEvidence || onGenerateEvidence || onGenerateAnalysis;
                    if (!hasContent && gen && !generatingIcon) {
                      setGeneratingIcon('evidence');
                      gen().finally(() => setGeneratingIcon(null));
                    } else if (hasContent) {
                      if (e.metaKey || e.ctrlKey) {
                        if (gen && !generatingIcon) { setGeneratingIcon('evidence'); gen().finally(() => setGeneratingIcon(null)); }
                      } else {
                        const text = [patient.management && `Management:\n${patient.management}`, patient.evidence && `Evidence:\n${patient.evidence}`].filter(Boolean).join('\n\n');
                        await navigator.clipboard.writeText(text);
                        setCopiedIcon('evidence');
                        setTimeout(() => setCopiedIcon(null), 1500);
                      }
                    }
                  }}
                  className={`p-0.5 rounded transition-colors inline-flex ${patient.management || patient.evidence || onGenerateManagementEvidence || onGenerateEvidence || onGenerateAnalysis ? 'hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer' : ''}`}
                  title={patient.management || patient.evidence ? 'Click to copy · ⌘+click to regenerate' : 'Generate management & evidence'}
                >
                  {generatingIcon === 'evidence' ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin" /> : copiedIcon === 'evidence' ? <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> : <BookOpen className={`w-3.5 h-3.5 ${patient.management || patient.evidence ? 'text-amber-600 dark:text-amber-400' : EMPTY}`} />}
                </span>
                {(patient.management || patient.evidence) && (
                  <IconTooltip anchorRef={tooltipRefs.evidence} visible={activeTooltip === 'evidence'}>
                    <div onMouseEnter={keepTooltip} onMouseLeave={hideTooltip}>
                      {patient.management && (
                        <>
                          <span className="text-amber-400 font-medium block mb-1">Management</span>
                          <p className="whitespace-pre-wrap leading-relaxed mb-2">{patient.management}</p>
                        </>
                      )}
                      {patient.evidence && (
                        <>
                          <div className="flex items-center justify-between mb-1 border-t border-white/10 pt-2">
                            <span className="text-amber-400 font-medium">Evidence</span>
                            {onSaveResource && (
                              <button onClick={(e) => { e.stopPropagation(); onSaveResource({ type: 'evidence', content: patient.evidence, patientName: patient.name, diagnosis: patient.diagnosis }); }} className="p-0.5 rounded hover:bg-white/10 transition-colors" title={savedResourceKey?.('evidence') ? 'Saved' : 'Save to library'}>
                                <Bookmark className="w-3.5 h-3.5 text-amber-400" fill={savedResourceKey?.('evidence') ? 'currentColor' : 'none'} />
                              </button>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed"><Linkified text={patient.evidence} /></p>
                        </>
                      )}
                    </div>
                  </IconTooltip>
                )}
              </div>

              {/* Education — emerald-green */}
              {showEducation && (
                <div className="relative flex-shrink-0">
                  <span
                    ref={tooltipRefs.education}
                    onMouseEnter={() => patient.education && showTooltip('education')}
                    onMouseLeave={hideTooltip}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!patient.education && onGenerateEducation && !generatingIcon) {
                        setGeneratingIcon('education');
                        onGenerateEducation().finally(() => setGeneratingIcon(null));
                      } else if (patient.education) {
                        if (e.metaKey || e.ctrlKey) {
                          if (onGenerateEducation && !generatingIcon) { setGeneratingIcon('education'); onGenerateEducation().finally(() => setGeneratingIcon(null)); }
                        } else {
                          await navigator.clipboard.writeText(patient.education);
                          setCopiedIcon('education');
                          setTimeout(() => setCopiedIcon(null), 1500);
                        }
                      }
                    }}
                    className={`p-0.5 rounded transition-colors inline-flex ${patient.education || onGenerateEducation ? 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 cursor-pointer' : ''}`}
                    title={patient.education ? 'Click to copy · ⌘+click to regenerate' : 'Generate learning resources'}
                  >
                    {generatingIcon === 'education' ? <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" /> : copiedIcon === 'education' ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <GraduationCap className={`w-3.5 h-3.5 ${patient.education ? 'text-emerald-600 dark:text-emerald-400' : EMPTY}`} />}
                  </span>
                  {patient.education && (
                    <IconTooltip anchorRef={tooltipRefs.education} visible={activeTooltip === 'education'}>
                      <div onMouseEnter={keepTooltip} onMouseLeave={hideTooltip}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-emerald-400 font-medium">Learning Resources</span>
                          {onSaveResource && (
                            <button onClick={(e) => { e.stopPropagation(); onSaveResource({ type: 'education', content: patient.education, patientName: patient.name, diagnosis: patient.diagnosis }); }} className="p-0.5 rounded hover:bg-white/10 transition-colors" title={savedResourceKey?.('education') ? 'Saved' : 'Save to library'}>
                              <Bookmark className="w-3.5 h-3.5 text-emerald-400" fill={savedResourceKey?.('education') ? 'currentColor' : 'none'} />
                            </button>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed"><Linkified text={patient.education} /></p>
                      </div>
                    </IconTooltip>
                  )}
                </div>
              )}
            </>
          )}

          {/* Clinical Q&A — cyan */}
          {onClinicalChat && (
            <div className="relative flex-shrink-0">
              <span
                ref={tooltipRefs.qa}
                onMouseEnter={() => patient.clinicalQA && showTooltip('qa')}
                onMouseLeave={hideTooltip}
                onClick={(e) => { e.stopPropagation(); onClinicalChat(); }}
                className="p-0.5 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded transition-colors cursor-pointer inline-flex"
                title="Clinical questions"
              >
                <MessageCircleQuestion className={`w-3.5 h-3.5 ${patient.clinicalQA ? 'text-cyan-600 dark:text-cyan-400' : EMPTY}`} />
              </span>
              {patient.clinicalQA && (() => {
                try {
                  const qa = JSON.parse(patient.clinicalQA);
                  if (!Array.isArray(qa) || qa.length < 2) return null;
                  const lastQ = qa[qa.length - 2];
                  const lastA = qa[qa.length - 1];
                  return (
                    <IconTooltip anchorRef={tooltipRefs.qa} visible={activeTooltip === 'qa'}>
                      <div onMouseEnter={keepTooltip} onMouseLeave={hideTooltip}>
                        <span className="text-cyan-400 font-medium block mb-1">Last Q&A</span>
                        <p className="text-cyan-300/80 mb-1"><strong>Q:</strong> {lastQ?.content}</p>
                        <p className="whitespace-pre-wrap leading-relaxed"><strong>A:</strong> {lastA?.content?.slice(0, 200)}{lastA?.content?.length > 200 ? '...' : ''}</p>
                      </div>
                    </IconTooltip>
                  );
                } catch { return null; }
              })()}
            </div>
          )}
          </div>{/* end hover icons wrapper */}
        </div>

        {/* Bottom row: metadata */}
        <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
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
                <Clock className="w-3 h-3 opacity-60" />
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
              <User className="w-3 h-3 opacity-60" />
              {patient.age}{patient.gender && ` ${patient.gender}`}
            </span>
          )}

          {editingDiagnosis ? (
            <span
              className="flex items-center gap-1 flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Stethoscope className="w-3 h-3 opacity-60" />
              <input
                ref={diagInputRef}
                type="text"
                value={editDiagnosis}
                onChange={(e) => setEditDiagnosis(e.target.value)}
                onBlur={handleDiagnosisSave}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleDiagnosisSave();
                  if (e.key === 'Escape') setEditingDiagnosis(false);
                }}
                autoFocus
                disabled={savingDiagnosis}
                className="w-32 px-1.5 py-0.5 border border-blue-400 rounded text-[12px] bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="Diagnosis..."
              />
              {savingDiagnosis && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
            </span>
          ) : patient.diagnosis ? (
            <span
              className="flex items-center gap-1 truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              onClick={(e) => {
                if (!onUpdateFields) return;
                e.stopPropagation();
                setEditDiagnosis(patient.diagnosis);
                setEditingDiagnosis(true);
              }}
            >
              <Stethoscope className="w-3 h-3 opacity-60" />
              {patient.diagnosis}
            </span>
          ) : onUpdateFields ? (
            <span
              className="flex items-center gap-1 truncate cursor-pointer text-[var(--text-muted)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors italic"
              onClick={(e) => {
                e.stopPropagation();
                setEditDiagnosis('');
                setEditingDiagnosis(true);
              }}
            >
              <Stethoscope className="w-3 h-3 opacity-60" />
              Add diagnosis
            </span>
          ) : null}
        </div>
      </button>

      {/* Quick record mic — between content and action buttons */}
      {onQuickRecordComplete && (
        <div className={`flex-shrink-0 self-center transition-all duration-200 ${quickRecording ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}>
          <QuickRecordButton
            patient={{ rowIndex: patient.rowIndex, sheetName: patient.sheetName, name: patient.name }}
            onRecordingComplete={onQuickRecordComplete}
            onRecordingStateChange={setQuickRecording}
          />
        </div>
      )}

      {/* Right section: action buttons — all on hover */}
      <div className="flex items-center gap-1.5 pr-1.5 flex-shrink-0 self-center opacity-0 group-hover/card:opacity-100 transition-all duration-200">
        {/* Inline time editor */}
        {editingTime && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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

        {/* Billing */}
        {onBillingToggle && (
          <button
            onClick={(e) => { e.stopPropagation(); onBillingToggle(); }}
            className="px-2 py-1 rounded-lg transition-colors hover:bg-teal-50 dark:hover:bg-teal-900/30"
            title="Billing"
          >
            {billingCodes ? (
              <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 max-w-[80px] truncate block">
                {billingCodes}
              </span>
            ) : (
              <DollarSign className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-teal-600 dark:hover:text-teal-400 transition-colors" />
            )}
          </button>
        )}

        {/* Merge — blue */}
        {onMerge && patient.name?.startsWith('New Encounter') && (
          <button
            onClick={(e) => { e.stopPropagation(); onMerge(); }}
            className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            title="Assign to existing patient"
          >
            <Merge className="w-4 h-4 text-[var(--text-muted)] hover:text-blue-500 dark:hover:text-blue-400 transition-colors" />
          </button>
        )}

      </div>

      {/* Full view icon — right side, before the split-view edge zone */}
      {onNavigate && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          className="group/full flex-shrink-0 self-center mr-1.5 opacity-0 group-hover/card:opacity-100 transition-all duration-200 active:scale-90"
          title="Open full view"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-[var(--text-muted)] group-hover/full:text-blue-400 transition-colors duration-200">
            {/* Page with folded corner */}
            <path d="M3 1.5h6.5L12.5 4.5V13a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M9.5 1.5V4a.5.5 0 00.5.5h2.5" stroke="currentColor" strokeWidth="1.2" fill="none"
              className="transition-opacity duration-200 opacity-60 group-hover/full:opacity-100" />
            {/* Arrow expanding outward on hover */}
            <path d="M5.5 9L8.5 6M8.5 6H6.5M8.5 6V8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
              className="transition-transform duration-250 ease-out origin-[8.5px_6px] group-hover/full:translate-x-[1px] group-hover/full:-translate-y-[1px]" />
          </svg>
        </button>
      )}

      {/* Split view — right edge bar, only appears on hover over the right edge zone */}
      {onSplitView && (
        <div
          className="split-view-zone"
          onClick={(e) => { e.stopPropagation(); onSplitView(); }}
          title="Open side-by-side"
        >
          <div className="patient-card-edge-right" />
        </div>
      )}

      {/* Demographics editor — portal so it isn't clipped by card width */}
      {editingDemo && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[199] bg-black/30" onClick={() => setEditingDemo(false)} />
          <div
            className="fixed z-[200] w-80 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-2xl animate-scaleIn"
            style={{
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: 'var(--card-shadow), 0 25px 50px -12px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
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
                  className="w-16 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                />
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value)}
                  className="w-24 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
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
                  className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
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
        </>,
        document.body
      )}
      </div>{/* end patient-card */}
    </div>
  );
});
