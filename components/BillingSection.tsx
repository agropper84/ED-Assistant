'use client';

import { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, DollarSign, Search } from 'lucide-react';
import {
  BillingItem, BillingCategory, BillingCode,
  addBillingCode, calculateTotal, getAdditionalCodes, filterAdditionalCodes,
  getCategoryForCode, BILLING_CATEGORIES,
} from '@/lib/billing';

interface BillingSectionProps {
  billingItems: BillingItem[];
  comments: string;
  onSave: (items: BillingItem[], comments?: string) => void;
  onSaveComments: (comments: string) => void;
  showBilling: boolean;
  setShowBilling: (v: boolean) => void;
}

export function BillingSection({
  billingItems, comments, onSave, onSaveComments, showBilling, setShowBilling,
}: BillingSectionProps) {
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
          <BillingBody
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
  return (
    <div className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
      <BillingBody
        billingItems={billingItems}
        comments={comments}
        onSave={onSave}
        onSaveComments={onSaveComments}
      />
    </div>
  );
}

/** Shared billing body */
function BillingBody({
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

  // Fetch billing codes from Google Sheet on mount
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

  // Use sheet codes if available, otherwise fall back to local defaults
  const additionalCodes = sheetCodes
    ? filterAdditionalCodes(sheetCodes)
    : getAdditionalCodes();

  const total = calculateTotal(billingItems);

  // Use code-based category lookup (source of truth) rather than the mutable .category property
  const currentVisit = billingItems.find(i => getCategoryForCode(i.code) === 'visitType');
  const currentAcuteCare = billingItems.find(i => getCategoryForCode(i.code) === 'acuteCare');
  const currentPremium = billingItems.find(i => getCategoryForCode(i.code) === 'premium');
  const additionalItems = billingItems.filter(i => getCategoryForCode(i.code) === 'additional');

  // Filter additional codes by search query
  const filteredCodes = searchQuery.trim()
    ? additionalCodes.filter(c =>
        c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : additionalCodes;

  const setCategoryItem = (category: BillingCategory, item: BillingItem | null) => {
    // Filter by code-based category lookup, not the .category property
    const filtered = billingItems.filter(i => getCategoryForCode(i.code) !== category);
    const updated = item ? [...filtered, item] : filtered;
    onSave(updated);
  };

  /** Select acute care fee: replaces any existing acute care, and by default removes visit type */
  const handleAcuteCareSelect = (item: BillingItem) => {
    // If already selected, toggle it off
    if (currentAcuteCare?.code === item.code) {
      const filtered = billingItems.filter(i => getCategoryForCode(i.code) !== 'acuteCare');
      onSave(filtered);
      return;
    }
    // Remove existing acute care AND visit type
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
              <div key={`${item.code}-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[var(--text-primary)]">{item.code}</span>
                  <span className="text-[var(--text-muted)] ml-2 truncate">{item.description}</span>
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
      </div>

      {/* Additional Fees */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Additional Fees</label>
        {/* Search */}
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
