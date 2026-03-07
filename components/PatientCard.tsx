'use client';

import { useState } from 'react';
import { Patient } from '@/lib/google-sheets';
import { Clock, User, ChevronRight, Trash2, MessageSquare, DollarSign, Stethoscope, Brain, ClipboardList, BookOpen, Play, Loader2 } from 'lucide-react';

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

export function PatientCard({ patient, onClick, onDelete, anonymize, onTimeChange, onBillingToggle, billingCodes, onNavigate, onProcess, onGenerateAnalysis }: PatientCardProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [timeValue, setTimeValue] = useState(patient.timestamp || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const hasEncounterNote = !!(patient.hpi || patient.objective || patient.assessmentPlan);
  const hasAnalysis = !!(patient.synopsis || patient.management || patient.evidence);
  const hasInputData = !!(patient.transcript || patient.triageVitals || patient.additional || patient.diagnosis);
  const showInfoIcons = hasEncounterNote || hasAnalysis || (hasInputData && !!onGenerateAnalysis);

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 dark:border dark:border-blue-800',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:border dark:border-amber-800',
    processed: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300 dark:border dark:border-green-800',
  };

  const statusLabels: Record<string, string> = {
    new: 'New',
    pending: 'Create Encounter Note',
    processed: 'Processed',
  };

  const displayName = anonymize ? toInitials(patient.name) : (patient.name || 'No name');

  const handleTimeSave = () => {
    if (onTimeChange && timeValue !== patient.timestamp) {
      onTimeChange(timeValue);
    }
    setEditingTime(false);
  };

  const borderAccent: Record<string, string> = {
    new: 'border-l-blue-500',
    pending: 'border-l-amber-500',
    processed: 'border-l-emerald-500',
  };

  return (
    <div className={`patient-card flex items-center gap-4 hover:-translate-y-0.5 border-l-[3px] ${borderAccent[patient.status] || 'border-l-transparent'}`}>
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-[var(--text-primary)] truncate">
            {displayName}
          </span>
          {/* Status badge / process button */}
          {patient.status === 'pending' && onProcess ? (
            <span
              onClick={async (e) => {
                e.stopPropagation();
                if (isProcessing) return;
                setIsProcessing(true);
                try {
                  await onProcess();
                } finally {
                  setIsProcessing(false);
                }
              }}
              className={`badge ${statusColors[patient.status]} cursor-pointer hover:brightness-95 dark:hover:brightness-125 active:scale-[0.97] transition-all inline-flex items-center gap-1`}
            >
              {isProcessing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {isProcessing ? 'Processing...' : statusLabels[patient.status]}
            </span>
          ) : patient.status !== 'processed' ? (
            <span className={`badge ${statusColors[patient.status]}`}>
              {statusLabels[patient.status]}
            </span>
          ) : null}

          {/* Info icons — shown when any output exists or input data available for generation */}
          {showInfoIcons && (
            <>
              {/* Synopsis hover icon */}
              <div className="relative group/synopsis flex-shrink-0">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!patient.synopsis && onGenerateAnalysis && !isGenerating) {
                      setIsGenerating(true);
                      onGenerateAnalysis().finally(() => setIsGenerating(false));
                    }
                  }}
                  className={`p-0.5 rounded transition-colors inline-flex ${patient.synopsis || onGenerateAnalysis ? 'hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer' : ''}`}
                  title={patient.synopsis ? '' : 'Generate synopsis & analysis'}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  ) : (
                    <Brain className={`w-4 h-4 ${patient.synopsis ? 'text-blue-500 dark:text-blue-400' : 'text-gray-300 dark:text-gray-600'}`} />
                  )}
                </span>
                {patient.synopsis && (
                  <div
                    className="absolute left-0 top-full mt-1 z-50 hidden group-hover/synopsis:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-blue-400 font-medium block mb-1">Synopsis</span>
                    <p className="whitespace-pre-wrap leading-relaxed">{patient.synopsis}</p>
                  </div>
                )}
              </div>

              {/* Management hover icon */}
              <div className="relative group/mgmt flex-shrink-0">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!patient.management && onGenerateAnalysis && !isGenerating) {
                      setIsGenerating(true);
                      onGenerateAnalysis().finally(() => setIsGenerating(false));
                    }
                  }}
                  className={`p-0.5 rounded transition-colors inline-flex ${patient.management || onGenerateAnalysis ? 'hover:bg-purple-100 dark:hover:bg-purple-900/50 cursor-pointer' : ''}`}
                  title={patient.management ? '' : 'Generate synopsis & analysis'}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  ) : (
                    <ClipboardList className={`w-4 h-4 ${patient.management ? 'text-purple-500 dark:text-purple-400' : 'text-gray-300 dark:text-gray-600'}`} />
                  )}
                </span>
                {patient.management && (
                  <div
                    className="absolute left-0 top-full mt-1 z-50 hidden group-hover/mgmt:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-purple-400 font-medium block mb-1">Management</span>
                    <p className="whitespace-pre-wrap leading-relaxed">{patient.management}</p>
                  </div>
                )}
              </div>

              {/* Evidence hover icon */}
              <div className="relative group/evidence flex-shrink-0">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!patient.evidence && onGenerateAnalysis && !isGenerating) {
                      setIsGenerating(true);
                      onGenerateAnalysis().finally(() => setIsGenerating(false));
                    }
                  }}
                  className={`p-0.5 rounded transition-colors inline-flex ${patient.evidence || onGenerateAnalysis ? 'hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer' : ''}`}
                  title={patient.evidence ? '' : 'Generate synopsis & analysis'}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                  ) : (
                    <BookOpen className={`w-4 h-4 ${patient.evidence ? 'text-amber-500 dark:text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
                  )}
                </span>
                {patient.evidence && (
                  <div
                    className="absolute left-0 top-full mt-1 z-50 hidden group-hover/evidence:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-amber-400 font-medium block mb-1">Evidence</span>
                    <p className="whitespace-pre-wrap leading-relaxed">{patient.evidence}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {patient.triageVitals && (
          <div className="relative group/triage inline-flex mb-1">
            <MessageSquare className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
            <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover/triage:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-lg whitespace-pre-wrap leading-relaxed">
              {patient.triageVitals}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
          {patient.timestamp && !editingTime && (
            <span
              className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setTimeValue(patient.timestamp);
                setEditingTime(true);
              }}
            >
              <Clock className="w-3.5 h-3.5" />
              {patient.timestamp}
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

      {onBillingToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBillingToggle();
          }}
          className="p-2 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors flex-shrink-0"
          title="Billing"
        >
          {billingCodes ? (
            <span className="text-xs font-medium text-green-700 dark:text-green-400 whitespace-nowrap">
              {billingCodes}
            </span>
          ) : (
            <DollarSign className="w-4 h-4 text-[var(--text-muted)] hover:text-green-600 dark:hover:text-green-400" />
          )}
        </button>
      )}

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors flex-shrink-0"
        >
          <Trash2 className="w-4 h-4 text-[var(--text-muted)] hover:text-red-500 dark:hover:text-red-400" />
        </button>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate?.();
        }}
        className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors flex-shrink-0"
        title="Open full view"
      >
        <ChevronRight className="w-5 h-5 text-[var(--text-muted)]" />
      </button>
    </div>
  );
}
