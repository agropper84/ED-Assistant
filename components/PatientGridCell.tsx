'use client';

import { useState, useRef, memo } from 'react';
import { Clock, Stethoscope, Loader2 } from 'lucide-react';
import { Patient } from '@/lib/google-sheets';
import { BillingItem, parseBillingItems, serializeBillingItems } from '@/lib/billing';

interface PatientGridCellProps {
  patient: Patient;
  onClick: () => void;
  onTimeChange?: (time: string) => void;
  onUpdateFields?: (fields: Record<string, string>) => Promise<void>;
  onBillingSave?: (items: BillingItem[]) => void;
}

export const PatientGridCell = memo(function PatientGridCell({
  patient, onClick, onTimeChange, onUpdateFields, onBillingSave,
}: PatientGridCellProps) {
  const [editingTime, setEditingTime] = useState(false);
  const [timeValue, setTimeValue] = useState('');
  const [editingDiagnosis, setEditingDiagnosis] = useState(false);
  const [editDiagnosis, setEditDiagnosis] = useState('');
  const [savingDiagnosis, setSavingDiagnosis] = useState(false);
  const [editingBilling, setEditingBilling] = useState(false);
  const [editBillingCode, setEditBillingCode] = useState('');
  const diagInputRef = useRef<HTMLInputElement>(null);

  const billingItems = parseBillingItems(
    patient.visitProcedure || '', patient.procCode || '',
    patient.fee || '', patient.unit || ''
  );
  const billingText = billingItems.length > 0
    ? billingItems.map(i => i.code).join(', ')
    : '';

  const handleTimeSave = () => {
    setEditingTime(false);
    if (timeValue && timeValue !== patient.timestamp && onTimeChange) {
      onTimeChange(timeValue);
    }
  };

  const handleDiagnosisSave = async () => {
    if (!onUpdateFields) return;
    const trimmed = editDiagnosis.trim();
    if (trimmed === (patient.diagnosis || '')) {
      setEditingDiagnosis(false);
      return;
    }
    setSavingDiagnosis(true);
    try {
      await onUpdateFields({ diagnosis: trimmed });
    } finally {
      setSavingDiagnosis(false);
      setEditingDiagnosis(false);
    }
  };

  const handleBillingSave = () => {
    setEditingBilling(false);
    const trimmed = editBillingCode.trim();
    if (!trimmed || !onBillingSave) return;
    const codes = trimmed.split(/[,\s]+/).filter(Boolean);
    const newItems: BillingItem[] = codes.map(code => ({
      code,
      description: '',
      fee: '',
      unit: '1',
      category: 'additional' as const,
    }));
    onBillingSave(newItems);
  };

  return (
    <div
      className="patient-card-grid text-left p-4 flex flex-col gap-1.5 min-h-[120px] cursor-pointer"
      data-status={patient.status}
      onClick={onClick}
    >
      {/* Name */}
      <p className="font-semibold text-[14px] text-[var(--text-primary)] truncate leading-tight">
        {patient.name || 'Unknown'}
      </p>

      {/* Diagnosis — editable */}
      {editingDiagnosis ? (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={diagInputRef}
            type="text"
            value={editDiagnosis}
            onChange={(e) => setEditDiagnosis(e.target.value)}
            onBlur={handleDiagnosisSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDiagnosisSave();
              if (e.key === 'Escape') setEditingDiagnosis(false);
            }}
            autoFocus
            disabled={savingDiagnosis}
            className="w-full px-1.5 py-0.5 border border-blue-400 rounded text-[11px] bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
            placeholder="Diagnosis..."
          />
          {savingDiagnosis && <Loader2 className="w-3 h-3 animate-spin text-blue-400 flex-shrink-0" />}
        </div>
      ) : (
        <p
          className={`text-[11px] truncate leading-snug ${
            patient.diagnosis
              ? 'text-[var(--text-secondary)] hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer'
              : 'text-[var(--text-muted)] italic hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer'
          } transition-colors`}
          onClick={(e) => {
            if (!onUpdateFields) return;
            e.stopPropagation();
            setEditDiagnosis(patient.diagnosis || '');
            setEditingDiagnosis(true);
          }}
        >
          {patient.diagnosis || 'Add diagnosis'}
        </p>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: time + billing */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-light)]">
        {/* Time — editable */}
        {editingTime ? (
          <div onClick={(e) => e.stopPropagation()}>
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              onBlur={handleTimeSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTimeSave(); }}
              autoFocus
              className="w-20 px-1 py-0.5 border border-[var(--input-border)] rounded text-[10px] text-center focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
            />
          </div>
        ) : (
          <span
            className="text-[10px] text-[var(--text-muted)] tabular-nums flex items-center gap-1 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setTimeValue(patient.timestamp || '');
              setEditingTime(true);
            }}
          >
            <Clock className="w-2.5 h-2.5 opacity-50" />
            {patient.timestamp || '--:--'}
          </span>
        )}

        {/* Billing code — editable */}
        {editingBilling ? (
          <div onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editBillingCode}
              onChange={(e) => setEditBillingCode(e.target.value)}
              onBlur={handleBillingSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBillingSave();
                if (e.key === 'Escape') setEditingBilling(false);
              }}
              autoFocus
              className="w-16 px-1 py-0.5 border border-[var(--input-border)] rounded text-[9px] text-center focus:ring-1 focus:ring-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
              placeholder="Code"
            />
          </div>
        ) : billingText ? (
          <span
            className="text-[9px] font-medium text-[var(--text-muted)] tabular-nums truncate max-w-[60px] hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setEditBillingCode(billingText);
              setEditingBilling(true);
            }}
          >
            {billingText}
          </span>
        ) : (
          <span
            className="w-1.5 h-1.5 rounded-full cursor-pointer hover:scale-150 transition-transform"
            style={{
              background: patient.hasOutput ? 'var(--status-processed-border)'
                : patient.transcript ? 'var(--status-pending-border)'
                : 'var(--text-muted)'
            }}
            onClick={(e) => {
              if (!onBillingSave) return;
              e.stopPropagation();
              setEditBillingCode('');
              setEditingBilling(true);
            }}
          />
        )}
      </div>
    </div>
  );
});
