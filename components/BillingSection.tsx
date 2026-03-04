'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronUp, DollarSign } from 'lucide-react';
import {
  BillingItem, BillingCategory,
  addBillingCode, calculateTotal, getAdditionalCodes,
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
  billingItems,
  comments,
  onSave,
  onSaveComments,
  showBilling,
  setShowBilling,
}: BillingSectionProps) {
  const [showAddCode, setShowAddCode] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFee, setNewFee] = useState('');

  const additionalCodes = getAdditionalCodes();
  const total = calculateTotal(billingItems);

  const currentBase = billingItems.find(i => i.category === 'base');
  const currentVisit = billingItems.find(i => i.category === 'visitType');
  const currentPremium = billingItems.find(i => i.category === 'premium');
  const additionalItems = billingItems.filter(i => i.category === 'additional');

  const setCategoryItem = (category: BillingCategory, item: BillingItem | null) => {
    const filtered = billingItems.filter(i => i.category !== category);
    const updated = item ? [...filtered, item] : filtered;
    onSave(updated);
  };

  const addItem = (code: string, description: string, fee: string) => {
    const item: BillingItem = { code, description, fee, category: 'additional' };
    onSave([...billingItems, item]);
  };

  const removeItem = (index: number) => {
    const updated = billingItems.filter((_, i) => i !== index);
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
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <button
        onClick={() => setShowBilling(!showBilling)}
        className="w-full flex items-center justify-between p-4 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Billing</h3>
          {billingItems.length > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {billingItems.length} item{billingItems.length !== 1 ? 's' : ''}
            </span>
          )}
          {total && (
            <span className="text-sm font-semibold text-green-700">${total}</span>
          )}
        </div>
        {showBilling ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {showBilling && (
        <BillingBody
          billingItems={billingItems}
          comments={comments}
          total={total}
          currentBase={currentBase}
          currentVisit={currentVisit}
          currentPremium={currentPremium}
          additionalItems={additionalItems}
          additionalCodes={additionalCodes}
          setCategoryItem={setCategoryItem}
          addItem={addItem}
          removeItem={removeItem}
          onSaveComments={onSaveComments}
          showAddCode={showAddCode}
          setShowAddCode={setShowAddCode}
          newCode={newCode}
          setNewCode={setNewCode}
          newDesc={newDesc}
          setNewDesc={setNewDesc}
          newFee={newFee}
          setNewFee={setNewFee}
          handleAddCustomCode={handleAddCustomCode}
        />
      )}
    </div>
  );
}

/** Inline billing panel (no wrapper card, always visible) — for dashboard use */
export function InlineBilling({
  billingItems,
  comments,
  onSave,
  onSaveComments,
}: {
  billingItems: BillingItem[];
  comments: string;
  onSave: (items: BillingItem[], comments?: string) => void;
  onSaveComments: (comments: string) => void;
}) {
  const [showAddCode, setShowAddCode] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFee, setNewFee] = useState('');

  const additionalCodes = getAdditionalCodes();
  const total = calculateTotal(billingItems);

  const currentBase = billingItems.find(i => i.category === 'base');
  const currentVisit = billingItems.find(i => i.category === 'visitType');
  const currentPremium = billingItems.find(i => i.category === 'premium');
  const additionalItems = billingItems.filter(i => i.category === 'additional');

  const setCategoryItem = (category: BillingCategory, item: BillingItem | null) => {
    const filtered = billingItems.filter(i => i.category !== category);
    const updated = item ? [...filtered, item] : filtered;
    onSave(updated);
  };

  const addItem = (code: string, description: string, fee: string) => {
    const item: BillingItem = { code, description, fee, category: 'additional' };
    onSave([...billingItems, item]);
  };

  const removeItem = (index: number) => {
    const updated = billingItems.filter((_, i) => i !== index);
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
    <div className="bg-gray-50 border rounded-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
      <BillingBody
        billingItems={billingItems}
        comments={comments}
        total={total}
        currentBase={currentBase}
        currentVisit={currentVisit}
        currentPremium={currentPremium}
        additionalItems={additionalItems}
        additionalCodes={additionalCodes}
        setCategoryItem={setCategoryItem}
        addItem={addItem}
        removeItem={removeItem}
        onSaveComments={onSaveComments}
        showAddCode={showAddCode}
        setShowAddCode={setShowAddCode}
        newCode={newCode}
        setNewCode={setNewCode}
        newDesc={newDesc}
        setNewDesc={setNewDesc}
        newFee={newFee}
        setNewFee={setNewFee}
        handleAddCustomCode={handleAddCustomCode}
      />
    </div>
  );
}

/** Shared billing body used by both BillingSection and InlineBilling */
function BillingBody({
  billingItems, comments, total,
  currentBase, currentVisit, currentPremium,
  additionalItems, additionalCodes,
  setCategoryItem, addItem, removeItem, onSaveComments,
  showAddCode, setShowAddCode,
  newCode, setNewCode, newDesc, setNewDesc, newFee, setNewFee,
  handleAddCustomCode,
}: {
  billingItems: BillingItem[];
  comments: string;
  total: string;
  currentBase?: BillingItem;
  currentVisit?: BillingItem;
  currentPremium?: BillingItem;
  additionalItems: BillingItem[];
  additionalCodes: { code: string; description: string; fee: string }[];
  setCategoryItem: (cat: BillingCategory, item: BillingItem | null) => void;
  addItem: (code: string, desc: string, fee: string) => void;
  removeItem: (idx: number) => void;
  onSaveComments: (c: string) => void;
  showAddCode: boolean;
  setShowAddCode: (v: boolean) => void;
  newCode: string;
  setNewCode: (v: string) => void;
  newDesc: string;
  setNewDesc: (v: string) => void;
  newFee: string;
  setNewFee: (v: string) => void;
  handleAddCustomCode: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Current Items */}
      {billingItems.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Current Items</label>
          <div className="border rounded-lg divide-y bg-white">
            {billingItems.map((item, idx) => (
              <div key={`${item.code}-${idx}`} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{item.code}</span>
                  <span className="text-gray-500 ml-2 truncate">{item.description}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.fee && <span className="text-gray-700">${item.fee}</span>}
                  <button
                    onClick={() => removeItem(idx)}
                    className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {total && (
            <div className="flex justify-end mt-1">
              <span className="text-sm font-bold text-gray-900">Total: ${total}</span>
            </div>
          )}
        </div>
      )}

      {/* Base Fee Toggle */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Base Fee</label>
        <div className="flex gap-2">
          <button
            onClick={() => setCategoryItem('base', { code: '0145', description: 'Base Fee 0800-2300', fee: '81.80', category: 'base' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentBase?.code === '0145' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            0800-2300 ($81.80)
          </button>
          <button
            onClick={() => setCategoryItem('base', { code: '0146', description: 'Base Fee 2300-0800', fee: '119.60', category: 'base' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentBase?.code === '0146' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            2300-0800 ($119.60)
          </button>
        </div>
      </div>

      {/* Visit Type Toggle */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Visit Type</label>
        <div className="flex gap-2">
          <button
            onClick={() => setCategoryItem('visitType', { code: '1100', description: 'ED Visit', fee: '50.90', category: 'visitType' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentVisit?.code === '1100' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ED Visit ($50.90)
          </button>
          <button
            onClick={() => setCategoryItem('visitType', { code: '1101', description: 'Complete examination', fee: '111.50', category: 'visitType' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentVisit?.code === '1101' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Complete ($111.50)
          </button>
          <button
            onClick={() => setCategoryItem('visitType', { code: '0081', description: 'Critical Care', fee: '147.10', category: 'visitType' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentVisit?.code === '0081' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Critical ($147.10)
          </button>
        </div>
      </div>

      {/* Premium Toggle */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Time Premium</label>
        <div className="flex gap-2">
          <button
            onClick={() => setCategoryItem('premium', null)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              !currentPremium ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            None
          </button>
          <button
            onClick={() => setCategoryItem('premium', { code: '1153', description: 'Evening/Weekend premium', fee: '50.00', category: 'premium' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPremium?.code === '1153' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Eve/Wknd ($50)
          </button>
          <button
            onClick={() => setCategoryItem('premium', { code: '1154', description: 'Night (2300-0759) premium', fee: '107.40', category: 'premium' })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPremium?.code === '1154' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Night ($107.40)
          </button>
        </div>
      </div>

      {/* Additional Procedures */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Additional Procedures</label>
        <div className="max-h-40 overflow-y-auto border rounded-lg divide-y bg-white">
          {additionalCodes.map((item) => {
            const isAdded = additionalItems.some(a => a.code === item.code);
            return (
              <button
                key={item.code}
                onClick={() => {
                  if (!isAdded) addItem(item.code, item.description, item.fee);
                }}
                disabled={isAdded}
                className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center ${
                  isAdded ? 'bg-green-50 text-green-700' : 'hover:bg-blue-50'
                }`}
              >
                <span className="truncate">{item.description}</span>
                <span className="text-gray-500 flex-shrink-0 ml-2 text-xs">
                  {item.code} {item.fee && `• $${item.fee}`}
                  {isAdded && ' (added)'}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowAddCode(!showAddCode)}
          className="mt-1 text-xs text-blue-600 font-medium"
        >
          + Add custom code
        </button>
      </div>

      {/* Add Custom Code */}
      {showAddCode && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Code"
              className="p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description"
              className="col-span-2 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFee}
              onChange={(e) => setNewFee(e.target.value)}
              placeholder="Fee (e.g. 50.00)"
              className="flex-1 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Comments */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Comments</label>
        <input
          type="text"
          value={comments}
          onChange={(e) => onSaveComments(e.target.value)}
          onBlur={(e) => onSaveComments(e.target.value)}
          className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  );
}
