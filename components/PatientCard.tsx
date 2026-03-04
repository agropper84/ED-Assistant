'use client';

import { useState } from 'react';
import { Patient } from '@/lib/google-sheets';
import { Clock, User, FileText, ChevronRight, Trash2, AlertCircle } from 'lucide-react';

interface PatientCardProps {
  patient: Patient;
  onClick: () => void;
  onDelete?: () => void;
  anonymize?: boolean;
  onTimeChange?: (time: string) => void;
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

/** Extract presenting issue from triage vitals (first line / first sentence) */
function getPresentingIssue(triageVitals: string): string {
  if (!triageVitals) return '';
  // Take first line, then truncate at ~60 chars
  const firstLine = triageVitals.split('\n')[0].trim();
  if (firstLine.length <= 60) return firstLine;
  return firstLine.substring(0, 57) + '...';
}

export function PatientCard({ patient, onClick, onDelete, anonymize, onTimeChange }: PatientCardProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [timeValue, setTimeValue] = useState(patient.timestamp || '');

  const statusColors = {
    new: 'bg-blue-100 text-blue-800',
    pending: 'bg-amber-100 text-amber-800',
    processed: 'bg-green-100 text-green-800',
  };

  const statusLabels = {
    new: 'New',
    pending: 'Ready to Process',
    processed: 'Processed',
  };

  const displayName = anonymize ? toInitials(patient.name) : (patient.name || 'No name');
  const presentingIssue = getPresentingIssue(patient.triageVitals);

  const handleTimeSave = () => {
    if (onTimeChange && timeValue !== patient.timestamp) {
      onTimeChange(timeValue);
    }
    setEditingTime(false);
  };

  return (
    <div className="patient-card flex items-center gap-4">
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-gray-900 truncate">
            {displayName}
          </span>
          <span className={`badge ${statusColors[patient.status]}`}>
            {statusLabels[patient.status]}
          </span>
        </div>

        {presentingIssue && (
          <div className="flex items-center gap-1 text-sm text-gray-700 mb-1">
            <AlertCircle className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="truncate">{presentingIssue}</span>
          </div>
        )}

        <div className="flex items-center gap-4 text-sm text-gray-500">
          {patient.timestamp && !editingTime && (
            <span
              className="flex items-center gap-1 hover:text-blue-600 cursor-pointer"
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
              <FileText className="w-3.5 h-3.5" />
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
            className="w-24 p-1 border rounded text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
        >
          <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
        </button>
      )}

      <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
    </div>
  );
}
