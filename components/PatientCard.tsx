'use client';

import { useState } from 'react';
import { Patient } from '@/lib/google-sheets';
import { Clock, User, FileText, ChevronRight, Trash2, MessageSquare, DollarSign, Stethoscope, Copy, Check } from 'lucide-react';

interface PatientCardProps {
  patient: Patient;
  onClick: () => void;
  onDelete?: () => void;
  anonymize?: boolean;
  onTimeChange?: (time: string) => void;
  onBillingToggle?: () => void;
  billingCodes?: string;
  onViewNote?: () => void;
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

export function PatientCard({ patient, onClick, onDelete, anonymize, onTimeChange, onBillingToggle, billingCodes, onViewNote }: PatientCardProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [timeValue, setTimeValue] = useState(patient.timestamp || '');
  const [noteCopied, setNoteCopied] = useState(false);

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 dark:border dark:border-blue-800',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:border dark:border-amber-800',
    processed: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300 dark:border dark:border-green-800',
  };

  const statusLabels: Record<string, string> = {
    new: 'New',
    pending: 'Ready to Process',
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
          {patient.status === 'processed' && onViewNote ? (
            <div className="relative group/note flex-shrink-0">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onViewNote();
                }}
                className="p-0.5 hover:bg-green-100 dark:hover:bg-green-900/50 rounded transition-colors cursor-pointer inline-flex"
              >
                <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
              </span>
              <div
                className="absolute left-0 top-full mt-1 z-50 hidden group-hover/note:block w-80 max-h-64 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2 sticky top-0 bg-gray-900 pb-1">
                  <span className="text-gray-400 font-medium">Encounter Note</span>
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
                    <div><span className="text-green-400 font-medium">HPI:</span> {patient.hpi}</div>
                  )}
                  {patient.objective && (
                    <div><span className="text-green-400 font-medium">Objective:</span> {patient.objective}</div>
                  )}
                  {patient.assessmentPlan && (
                    <div><span className="text-green-400 font-medium">A&P:</span> {patient.assessmentPlan}</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <span className={`badge ${statusColors[patient.status]}`}>
              {statusLabels[patient.status]}
            </span>
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

      <ChevronRight className="w-5 h-5 text-[var(--text-muted)] opacity-40 flex-shrink-0" />
    </div>
  );
}
