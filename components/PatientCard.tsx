'use client';

import { Patient } from '@/lib/google-sheets';
import { Clock, User, FileText, ChevronRight, Trash2 } from 'lucide-react';

interface PatientCardProps {
  patient: Patient;
  onClick: () => void;
  onDelete?: () => void;
}

export function PatientCard({ patient, onClick, onDelete }: PatientCardProps) {
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

  return (
    <div className="patient-card flex items-center gap-4">
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-gray-900 truncate">
            {patient.name || 'No name'}
          </span>
          <span className={`badge ${statusColors[patient.status]}`}>
            {statusLabels[patient.status]}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-500">
          {patient.timestamp && (
            <span className="flex items-center gap-1">
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
