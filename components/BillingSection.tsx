'use client';

import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, DollarSign, Search, Info, Plus, Trash2 } from 'lucide-react';
import {
  BillingItem, BillingCategory, BillingCode,
  addBillingCode, calculateTotal, getAdditionalCodes, filterAdditionalCodes,
  getCategoryForCode, BILLING_CATEGORIES, isTimeBased,
} from '@/lib/billing';

/** Documentation requirements and billing tips per code, from the Yukon Fee Guide */
const BILLING_HINTS: Record<string, string[]> = {
  '1101': [
    'Min 20 min patient contact',
    'Requires complete detailed history & physical exam of all parts and systems',
    'Document: complaints, hx present/past illness, family hx, personal hx, functional inquiry, PE, DDx, provisional dx',
  ],
  '0081': [
    'Record start & end time',
    'Per ½ hr — active bedside treatment of acutely ill patients only',
    'Not for standby time (e.g. waiting for lab results)',
    'If billing with a consult, the consult fee covers the first ½ hr',
    '>6 units requires written report to Medical Advisor',
    'Includes POCUS — do not bill 0089 separately',
  ],
  '0080': [
    'Night hours only (2300–0800)',
    'Record start & end time',
    'Per ½ hr — active bedside treatment of acutely ill patients only',
    'Not for standby time (e.g. waiting for lab results)',
    'If billing with a consult, the consult fee covers the first ½ hr',
    '>6 units requires written report to Medical Advisor',
  ],
  '0082': [
    'Record start & end time',
    'Per ½ hr — physician presence needed but emergency care not required',
    'Not for waiting for lab/x-ray results or consultations',
    'This fee is inclusive of all other services',
    '>6 units requires written report to Medical Advisor',
    'Includes POCUS — do not bill 0089 separately',
  ],
  '0083': [
    'Per ½ hr — continuous medical assistance at exclusion of all other services',
    'Applies to: rape, sudden bereavement, suicidal behavior, acute psychosis',
    '>2 units requires written report to Medical Advisor',
  ],
  '0116': [
    'For critically ill patients only — not routine or post-anesthetic',
    'Requires immediate complete exam, investigation & close monitoring',
  ],
  '0089': [
    'Requires documented competency/training in portable ultrasound',
    'Already included in 0081/0082 — do not bill separately with those codes',
  ],
  '0113': [
    'Record start & end times on claim and in patient chart',
    'Per 15 min — billed on behalf of specific patient by MRP',
  ],
  '0120': [
    'Min 20 min patient contact',
    'Max 8 visits/patient/fiscal year (Apr 1–Mar 31)',
  ],
  '0121': ['Min 16 min patient contact'],
  '0122': ['31–45 min patient contact'],
  '0123': ['Over 45 min patient contact'],
  '0109': ['Psychiatric counselling'],
  '1153': [
    'Also applies 0800–2259 on weekends & statutory holidays',
  ],
};

interface BillingSectionProps {
  billingItems: BillingItem[];
  comments: string;
  onSave: (items: BillingItem[], comments?: string) => void;
  onSaveComments: (comments: string) => void;
  showBilling: boolean;
  setShowBilling: (v: boolean) => void;
}

/** Compact hint panel shown when a code with requirements is selected */
function BillingHints({ code }: { code: string | undefined }) {
  if (!code || !BILLING_HINTS[code]) return null;
  const hints = BILLING_HINTS[code];
  return (
    <div className="mt-1.5 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg">
      <div className="flex gap-1.5 items-start">
        <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
          {hints.map((hint, i) => (
            <li key={i}>{hint}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function BillingSection({
  billingItems, comments, onSave, onSaveComments, showBilling, setShowBilling,
}: BillingSectionProps) {
  // Hide billing section entirely when VCH time-based is active
  if (isTimeBased()) return null;

  const total = calculateTotal(billingItems);

  return (
    <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden" style={{ boxShadow: 'var(--card-shadow)' }}>
      <button
        onClick={() => setShowBilling(!showBilling)}
        className="w-full flex items-center justify-between p-4 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-[var(--text-muted)]" />
          <h3 className="font-semibold text-[var(--text-primary)]">Billing</h3>
          {billingItems.length > 0 && (
            <span className="text-xs bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
              {billingItems.length} item{billingItems.length !== 1 ? 's' : ''}
            </span>
          )}
          {total && (
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">${total}</span>
          )}
        </div>
        {showBilling ? (
          <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
        )}
      </button>
      {showBilling && (
        <div className="px-4 pb-4">
          <PatientBasedBilling
            billingItems={billingItems}
            comments={comments}
            onSave={onSave}
            onSaveComments={onSaveComments}
          />
        </div>
      )}
    </div>
  );
}

/** Inline billing panel (no wrapper card, always visible) — for dashboard use */
export function InlineBilling({
  billingItems, comments, onSave, onSaveComments,
}: {
  billingItems: BillingItem[];
  comments: string;
  onSave: (items: BillingItem[], comments?: string) => void;
  onSaveComments: (comments: string) => void;
}) {
  // Hide when VCH time-based is active
  if (isTimeBased()) return null;

  return (
    <div className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
      <PatientBasedBilling
        billingItems={billingItems}
        comments={comments}
        onSave={onSave}
        onSaveComments={onSaveComments}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// VCH Time-Based Shift Billing (day-level, displayed below header)
// ────────────────────────────────────────────────────────────────────────────

import {
  TimeSegment, calculateSegmentHours, getSegmentRatePeriod,
} from '@/lib/billing';

export function VchTimeBasedShiftPanel({
  segments,
  onSaveSegments,
}: {
  segments: TimeSegment[];
  onSaveSegments: (segments: TimeSegment[]) => void;
}) {
  const addSegment = () => {
    const lastSeg = segments[segments.length - 1];
    const newSeg: TimeSegment = {
      start: lastSeg?.end || '08:00',
      end: '',
      scheduled: true,
      onsite: true,
      directPct: 50,
    };
    onSaveSegments([...segments, newSeg]);
  };

  const updateSegment = (index: number, updates: Partial<TimeSegment>) => {
    onSaveSegments(segments.map((seg, i) =>
      i === index ? { ...seg, ...updates } : seg
    ));
  };

  const removeSegment = (index: number) => {
    onSaveSegments(segments.filter((_, i) => i !== index));
  };

  // Summary
  let totalHrs = 0, directHrs = 0, indirectHrs = 0;
  for (const seg of segments) {
    if (seg.start && seg.end) {
      const h = calculateSegmentHours(seg);
      totalHrs += h.totalHrs;
      directHrs += h.directHrs;
      indirectHrs += h.indirectHrs;
    }
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, idx) => {
        const hrs = seg.start && seg.end ? calculateSegmentHours(seg) : null;
        const ratePeriod = seg.start ? getSegmentRatePeriod(seg.start, new Date().getDay()) : '';

        return (
          <div
            key={idx}
            className="border border-[var(--border)] rounded-lg p-3 bg-[var(--card-bg)] space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Segment {idx + 1}
              </span>
              <button
                onClick={() => removeSegment(idx)}
                className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-[var(--text-muted)] hover:text-red-500 dark:hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Start / End */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-0.5">Start</label>
                <input
                  type="time"
                  value={seg.start}
                  onChange={(e) => updateSegment(idx, { start: e.target.value })}
                  className="w-full p-1.5 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-0.5">End</label>
                <input
                  type="time"
                  value={seg.end}
                  onChange={(e) => updateSegment(idx, { end: e.target.value })}
                  className="w-full p-1.5 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Scheduled / Onsite */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-0.5">Schedule</label>
                <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
                  <button
                    onClick={() => updateSegment(idx, { scheduled: true })}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                      seg.scheduled ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    Scheduled
                  </button>
                  <button
                    onClick={() => updateSegment(idx, { scheduled: false })}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                      !seg.scheduled ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    Unscheduled
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-0.5">Location</label>
                <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
                  <button
                    onClick={() => updateSegment(idx, { onsite: true })}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                      seg.onsite ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    Onsite
                  </button>
                  <button
                    onClick={() => updateSegment(idx, { onsite: false })}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                      !seg.onsite ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    Offsite
                  </button>
                </div>
              </div>
            </div>

            {/* Direct % */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] font-medium text-[var(--text-muted)]">Direct %</label>
                <span className="text-[10px] text-[var(--text-muted)]">{seg.directPct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={seg.directPct}
                onChange={(e) => updateSegment(idx, { directPct: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 bg-[var(--border)] rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-0.5">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Summary */}
            {hrs && (
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] rounded-lg px-2.5 py-1.5">
                {ratePeriod && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                    {ratePeriod.split(' (')[0]}
                  </span>
                )}
                <span>
                  {hrs.totalHrs.toFixed(2)}h
                  <span className="mx-1 text-[var(--text-muted)]">|</span>
                  D: {hrs.directHrs.toFixed(2)}h
                  <span className="mx-1 text-[var(--text-muted)]">|</span>
                  I: {hrs.indirectHrs.toFixed(2)}h
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Add Segment */}
      <button
        onClick={addSegment}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-[var(--border)] rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Time Segment
      </button>

      {/* Grand Total */}
      {segments.length > 0 && totalHrs > 0 && (
        <div className="flex justify-end border-t border-[var(--border)] pt-2">
          <span className="text-sm font-bold text-[var(--text-primary)]">
            Total: {totalHrs.toFixed(2)}h
            <span className="font-normal text-[var(--text-muted)] ml-2">
              (D: {directHrs.toFixed(2)}h / I: {indirectHrs.toFixed(2)}h)
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Patient-Based Billing (Yukon codes)
// ────────────────────────────────────────────────────────────────────────────

function PatientBasedBilling({
  billingItems, comments, onSave, onSaveComments,
}: {
  billingItems: BillingItem[];
  comments: string;
  onSave: (items: BillingItem[]) => void;
  onSaveComments: (c: string) => void;
}) {
  const [showAddCode, setShowAddCode] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFee, setNewFee] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sheetCodes, setSheetCodes] = useState<BillingCode[] | null>(null);

  useEffect(() => {
    fetch('/api/billing-codes')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setSheetCodes(data);
        }
      })
      .catch(() => {});
  }, []);

  const additionalCodes = sheetCodes
    ? filterAdditionalCodes(sheetCodes)
    : getAdditionalCodes();

  const total = calculateTotal(billingItems);

  const currentVisit = billingItems.find(i => getCategoryForCode(i.code) === 'visitType');
  const currentAcuteCare = billingItems.find(i => getCategoryForCode(i.code) === 'acuteCare');
  const currentPremium = billingItems.find(i => getCategoryForCode(i.code) === 'premium');
  const additionalItems = billingItems.filter(i => getCategoryForCode(i.code) === 'additional');

  const filteredCodes = searchQuery.trim()
    ? additionalCodes.filter(c =>
        c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : additionalCodes;

  const setCategoryItem = (category: BillingCategory, item: BillingItem | null) => {
    const filtered = billingItems.filter(i => getCategoryForCode(i.code) !== category);
    const updated = item ? [...filtered, item] : filtered;
    onSave(updated);
  };

  const handleAcuteCareSelect = (item: BillingItem) => {
    if (currentAcuteCare?.code === item.code) {
      const filtered = billingItems.filter(i => getCategoryForCode(i.code) !== 'acuteCare');
      onSave(filtered);
      return;
    }
    const filtered = billingItems.filter(i => {
      const cat = getCategoryForCode(i.code);
      return cat !== 'acuteCare' && cat !== 'visitType';
    });
    onSave([...filtered, item]);
  };

  const addItem = (code: string, description: string, fee: string) => {
    const item: BillingItem = { code, description, fee, unit: '1', category: 'additional' };
    onSave([...billingItems, item]);
  };

  const removeItem = (index: number) => {
    onSave(billingItems.filter((_, i) => i !== index));
  };

  const updateItemUnit = (index: number, unit: string) => {
    const updated = billingItems.map((item, i) => i === index ? { ...item, unit } : item);
    onSave(updated);
  };

  const handleAddCustomCode = () => {
    if (!newCode.trim() || !newDesc.trim()) return;
    addBillingCode(newCode.trim(), newDesc.trim(), newFee.trim());
    addItem(newCode.trim(), newDesc.trim(), newFee.trim());
    setNewCode('');
    setNewDesc('');
    setNewFee('');
    setShowAddCode(false);
  };

  return (
    <div className="space-y-4">
      {/* Current Items */}
      {billingItems.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Current Items</label>
          <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] bg-[var(--card-bg)]">
            {billingItems.map((item, idx) => (
              <div key={`${item.code}-${idx}`} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 flex items-center gap-1">
                  <span className="font-medium text-[var(--text-primary)]">{item.code}</span>
                  <span className="text-[var(--text-muted)] ml-1 truncate">{item.description}</span>
                  {BILLING_HINTS[item.code] && (
                    <Info className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type="number"
                    min="1"
                    value={item.unit || '1'}
                    onChange={(e) => updateItemUnit(idx, e.target.value)}
                    className="w-12 p-1 border border-[var(--input-border)] rounded text-xs text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                    title="Units"
                  />
                  {item.fee && <span className="text-[var(--text-secondary)]">${item.fee}</span>}
                  <button
                    onClick={() => removeItem(idx)}
                    className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-[var(--text-muted)] hover:text-red-500 dark:hover:text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                </div>
                {BILLING_HINTS[item.code] && (
                  <div className="mt-1 flex gap-1.5 items-start">
                    <Info className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
                      {BILLING_HINTS[item.code].join(' · ')}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {total && (
            <div className="flex justify-end mt-1">
              <span className="text-sm font-bold text-[var(--text-primary)]">Total: ${total}</span>
            </div>
          )}
        </div>
      )}

      {/* Visit Type Toggle */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Visit Type</label>
        <div className="flex gap-2">
          <button
            onClick={() => setCategoryItem('visitType', currentVisit?.code === '1100' ? null : { code: '1100', description: 'ED Visit', fee: '50.90', unit: '1', category: 'visitType' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentVisit?.code === '1100' ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            ED Visit ($50.90)
          </button>
          <button
            onClick={() => setCategoryItem('visitType', currentVisit?.code === '1101' ? null : { code: '1101', description: 'Complete Examination', fee: '111.50', unit: '1', category: 'visitType' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentVisit?.code === '1101' ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            Complete Examination ($111.50)
          </button>
        </div>
        <BillingHints code={currentVisit?.code} />
      </div>

      {/* Acute Care Fees */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Acute Care</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleAcuteCareSelect({ code: '0081', description: 'Prolonged ED care (day)', fee: '147.10', unit: '1', category: 'acuteCare' })}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentAcuteCare?.code === '0081' ? 'bg-red-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            Prolonged EC Day ($147.10)
          </button>
          <button
            onClick={() => handleAcuteCareSelect({ code: '0080', description: 'Prolonged ED care (night)', fee: '230.60', unit: '1', category: 'acuteCare' })}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentAcuteCare?.code === '0080' ? 'bg-red-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            Prolonged EC Night ($230.60)
          </button>
          <button
            onClick={() => handleAcuteCareSelect({ code: '0082', description: 'Acute Care Detention', fee: '118.50', unit: '1', category: 'acuteCare' })}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentAcuteCare?.code === '0082' ? 'bg-red-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            Acute Care Detention ($118.50)
          </button>
          <button
            onClick={() => handleAcuteCareSelect({ code: '0083', description: 'Personal/Family Crisis', fee: '107.30', unit: '1', category: 'acuteCare' })}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentAcuteCare?.code === '0083' ? 'bg-red-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            Crisis Intervention ($107.30)
          </button>
        </div>
        <BillingHints code={currentAcuteCare?.code} />
      </div>

      {/* Premium Toggle */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Time Premium</label>
        <div className="flex gap-2">
          <button
            onClick={() => setCategoryItem('premium', null)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              !currentPremium ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            None
          </button>
          <button
            onClick={() => setCategoryItem('premium', { code: '1153', description: 'Evening/Weekend premium', fee: '50.00', unit: '1', category: 'premium' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPremium?.code === '1153' ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            Eve/Wknd ($50)
          </button>
          <button
            onClick={() => setCategoryItem('premium', { code: '1154', description: 'Night (2300-0759) premium', fee: '107.40', unit: '1', category: 'premium' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPremium?.code === '1154' ? 'bg-blue-600 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            Night ($107.40)
          </button>
        </div>
        <BillingHints code={currentPremium?.code} />
      </div>

      {/* Additional Fees */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Additional Fees</label>
        <div className="relative mb-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search fees..."
            className="w-full pl-8 pr-8 py-1.5 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="max-h-40 overflow-y-auto border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] bg-[var(--card-bg)]">
          {filteredCodes.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--text-muted)] italic">
              {searchQuery ? 'No matching fees' : 'No billing codes available'}
            </div>
          ) : (
            filteredCodes.map((item) => {
              const isAdded = additionalItems.some(a => a.code === item.code);
              return (
                <button
                  key={item.code}
                  onClick={() => {
                    if (!isAdded) addItem(item.code, item.description, item.fee);
                  }}
                  disabled={isAdded}
                  className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center ${
                    isAdded ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'hover:bg-blue-50 dark:hover:bg-blue-950/30 text-[var(--text-primary)]'
                  }`}
                >
                  <span className="truncate">{item.description}</span>
                  <span className="text-[var(--text-muted)] flex-shrink-0 ml-2 text-xs">
                    {item.code} {item.fee && `• $${item.fee}`}
                    {isAdded && ' (added)'}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <button
          onClick={() => setShowAddCode(!showAddCode)}
          className="mt-1 text-xs text-blue-600 dark:text-blue-400 font-medium"
        >
          + Add custom code
        </button>
      </div>

      {/* Add Custom Code */}
      {showAddCode && (
        <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Code"
              className="p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description"
              className="col-span-2 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFee}
              onChange={(e) => setNewFee(e.target.value)}
              placeholder="Fee (e.g. 50.00)"
              className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
            />
            <button
              onClick={handleAddCustomCode}
              disabled={!newCode.trim() || !newDesc.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddCode(false)}
              className="px-3 py-2 bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Comments */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Comments</label>
        <input
          type="text"
          value={comments}
          onChange={(e) => onSaveComments(e.target.value)}
          onBlur={(e) => onSaveComments(e.target.value)}
          className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
        />
      </div>
    </div>
  );
}
