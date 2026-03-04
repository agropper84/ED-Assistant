'use client';

import { useState } from 'react';
import { Patient } from '@/lib/google-sheets';
import { Clock, User, FileText, ChevronRight, Trash2, MessageSquare, DollarSign, Stethoscope } from 'lucide-react';

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
          {patient.status === 'processed' && onViewNote ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onViewNote();
              }}
              className="flex-shrink-0 p-0.5 hover:bg-green-100 rounded transition-colors cursor-pointer"
              title="View note"
            >
              <FileText className="w-4 h-4 text-green-600" />
            </span>
          ) : (
            <span className={`badge ${statusColors[patient.status]}`}>
              {statusLabels[patient.status]}
            </span>
          )}
        </div>

        {patient.triageVitals && (
          <div className="relative group/triage inline-flex mb-1">
            <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover/triage:block w-72 max-h-48 overflow-y-auto p-3 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-lg whitespace-pre-wrap leading-relaxed">
              {patient.triageVitals}
            </div>
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
            className="w-24 p-1 border rounded text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}

      {onBillingToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBillingToggle();
          }}
          className="p-2 hover:bg-green-50 rounded-lg transition-colors flex-shrink-0"
          title="Billing"
        >
          {billingCodes ? (
            <span className="text-xs font-medium text-green-700 whitespace-nowrap">
              {billingCodes}
            </span>
          ) : (
            <DollarSign className="w-4 h-4 text-gray-400 hover:text-green-600" />
          )}
        </button>
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
