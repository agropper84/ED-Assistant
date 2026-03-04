'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Patient } from '@/lib/google-sheets';
import {
  ArrowLeft, Loader2, Play, Copy, Check,
  User, Calendar, CreditCard, FileText,
  ChevronDown, ChevronUp, Pencil, X, Save,
  RefreshCw, Send, Bookmark
} from 'lucide-react';
import { ExamToggles } from '@/components/ExamToggles';
import { ReferralModal } from '@/components/ReferralModal';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { getStyleGuide, addExample } from '@/lib/style-guide';
import {
  BillingItem,
  parseBillingItems, serializeBillingItems,
} from '@/lib/billing';
import { BillingSection } from '@/components/BillingSection';

export default function PatientPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rowIndex = params.rowIndex as string;
  const sheetName = searchParams.get('sheet') || undefined;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['hpi', 'objective', 'assessmentPlan'])
  );

  // Modification state
  const [showModify, setShowModify] = useState(false);
  const [modifications, setModifications] = useState('');

  // Referral modal
  const [showReferralModal, setShowReferralModal] = useState(false);

  // Active tab for output view
  const [activeTab, setActiveTab] = useState<'encounter' | 'ddx' | 'referral'>('encounter');

  // Billing state
  const [showBilling, setShowBilling] = useState(false);
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [billingComments, setBillingComments] = useState('');

  // Error state
  const [processError, setProcessError] = useState('');

  // Style save confirmation
  const [styleSaved, setStyleSaved] = useState<string | null>(null);

  useEffect(() => {
    fetchPatient();
  }, [rowIndex, sheetName]);

  useEffect(() => {
    if (patient) {
      const items = parseBillingItems(
        patient.visitProcedure || '',
        patient.procCode || '',
        patient.fee || '',
        patient.unit || ''
      );
      setBillingItems(items);
      setBillingComments(patient.comments || '');
    }
  }, [patient]);

  const fetchPatient = async () => {
    try {
      const sheetParam = sheetName ? `?sheet=${encodeURIComponent(sheetName)}` : '';
      const res = await fetch(`/api/patients/${rowIndex}${sheetParam}`);
      const data = await res.json();
      setPatient(data.patient);
    } catch (error) {
      console.error('Failed to fetch patient:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async (mods?: string) => {
    setProcessing(true);
    setProcessError('');
    try {
      // Get style guidance from localStorage
      const styleGuide = getStyleGuide();
      let styleGuidance: string | undefined;
      if (styleGuide && Object.values(styleGuide.examples).some(arr => arr.length > 0)) {
        const parts: string[] = [];
        for (const [section, examples] of Object.entries(styleGuide.examples)) {
          if (examples.length > 0) {
            parts.push(`${section.toUpperCase()} style examples:\n${examples.map((e, i) => `Example ${i + 1}:\n${e}`).join('\n\n')}`);
          }
        }
        if (styleGuide.computedFeatures) {
          parts.push(`Computed style features: ${styleGuide.computedFeatures}`);
        }
        styleGuidance = parts.join('\n\n');
      }

      // Get settings from localStorage
      let settings: any;
      try {
        const stored = localStorage.getItem('ed-app-settings');
        if (stored) settings = JSON.parse(stored);
      } catch {}

      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: parseInt(rowIndex),
          sheetName,
          modifications: mods,
          styleGuidance,
          settings,
        }),
      });

      if (res.ok) {
        await fetchPatient();
        setShowModify(false);
        setModifications('');
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setProcessError(err.detail || err.error || `Failed (${res.status})`);
      }
    } catch (error: any) {
      console.error('Failed to process:', error);
      setProcessError(error?.message || 'Network error - check connection');
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveField = async (field: string, value: string) => {
    try {
      await fetch(`/api/patients/${rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value, _sheetName: sheetName }),
      });
      await fetchPatient();
    } catch (error) {
      console.error('Failed to save field:', error);
    }
  };

  const handleBillingSave = async (items: BillingItem[], comments?: string) => {
    setBillingItems(items);
    const serialized = serializeBillingItems(items);
    try {
      await fetch(`/api/patients/${rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitProcedure: serialized.visitProcedure,
          procCode: serialized.procCode,
          fee: serialized.fee,
          unit: serialized.unit,
          total: serialized.total,
          ...(comments !== undefined ? { comments } : {}),
          _sheetName: sheetName,
        }),
      });
    } catch (error) {
      console.error('Failed to save billing:', error);
    }
  };

  const handleSaveStyleExample = (section: string, content: string) => {
    const sectionKey = section as 'hpi' | 'objective' | 'assessmentPlan';
    addExample(sectionKey, content);
    setStyleSaved(section);
    setTimeout(() => setStyleSaved(null), 2000);
  };

  const handleReferralGenerated = async () => {
    await fetchPatient();
    setShowReferralModal(false);
    setActiveTab('referral');
  };

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(section);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyFullNote = async () => {
    if (!patient) return;
    const fullNote = `HPI:\n${patient.hpi}\n\nOBJECTIVE:\n${patient.objective}\n\nASSESSMENT & PLAN:\n${patient.assessmentPlan}`;
    await copyToClipboard(fullNote, 'full');
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Patient not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-4 sticky top-0 z-40">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-blue-500 rounded-full -ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">
              {patient.patientNum && `#${patient.patientNum} `}
              {patient.name || 'Unknown'}
            </h1>
            <p className="text-blue-100 text-sm">
              {patient.age && `${patient.age} `}
              {patient.gender && `${patient.gender} `}
              {patient.timestamp && `• ${patient.timestamp}`}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Patient Info Card */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">DOB:</span>
              <span className="font-medium">{patient.birthday || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">HCN:</span>
              <span className="font-medium">{patient.hcn || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">MRN:</span>
              <span className="font-medium">{patient.mrn || '—'}</span>
            </div>
            {patient.diagnosis && (
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Dx:</span>
                <span className="font-medium">{patient.diagnosis}</span>
              </div>
            )}
          </div>
        </div>

        {/* Process Button */}
        {!patient.hasOutput && (
          <button
            onClick={() => handleProcess()}
            disabled={processing}
            className="w-full py-4 bg-green-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Generate Encounter Note
              </>
            )}
          </button>
        )}

        {/* Process Error */}
        {processError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            <p className="font-medium">Processing failed</p>
            <p className="mt-1">{processError}</p>
          </div>
        )}

        {/* Output Sections */}
        {patient.hasOutput && (
          <>
            {/* Tab Bar */}
            <div className="flex bg-white rounded-xl shadow-sm border overflow-hidden">
              {(['encounter', 'ddx', 'referral'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tab === 'encounter' ? 'Encounter Note' : tab === 'ddx' ? 'DDx & Workup' : 'Referral'}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={copyFullNote}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                {copied === 'full' ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Full Note
                  </>
                )}
              </button>
              <button
                onClick={() => setShowModify(!showModify)}
                className="py-3 px-4 bg-amber-500 text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Modify
              </button>
              <button
                onClick={() => setShowReferralModal(true)}
                className="py-3 px-4 bg-purple-600 text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Refer
              </button>
            </div>

            {/* Modification Panel */}
            {showModify && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-amber-900">Modify & Regenerate</h3>
                <textarea
                  value={modifications}
                  onChange={(e) => setModifications(e.target.value)}
                  placeholder="Describe what changes you want (e.g., 'Add chest pain to HPI', 'Change diagnosis to pneumonia')..."
                  className="w-full h-24 p-3 border border-amber-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleProcess(modifications)}
                    disabled={processing || !modifications.trim()}
                    className="flex-1 py-2.5 bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Regenerate
                  </button>
                  <button
                    onClick={() => { setShowModify(false); setModifications(''); }}
                    className="py-2.5 px-4 bg-gray-200 text-gray-700 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Encounter Note Tab */}
            {activeTab === 'encounter' && (
              <>
                <OutputSection
                  title="HPI"
                  content={patient.hpi}
                  field="hpi"
                  expanded={expandedSections.has('hpi')}
                  onToggle={() => toggleSection('hpi')}
                  onCopy={() => copyToClipboard(patient.hpi, 'hpi')}
                  copied={copied === 'hpi'}
                  onSave={(value) => handleSaveField('hpi', value)}
                  onSaveStyle={() => handleSaveStyleExample('hpi', patient.hpi)}
                  styleSaved={styleSaved === 'hpi'}
                />

                <OutputSection
                  title="Objective"
                  content={patient.objective}
                  field="objective"
                  expanded={expandedSections.has('objective')}
                  onToggle={() => toggleSection('objective')}
                  onCopy={() => copyToClipboard(patient.objective, 'objective')}
                  copied={copied === 'objective'}
                  onSave={(value) => handleSaveField('objective', value)}
                  onSaveStyle={() => handleSaveStyleExample('objective', patient.objective)}
                  styleSaved={styleSaved === 'objective'}
                  showExamToggles
                />

                <OutputSection
                  title="Assessment & Plan"
                  content={patient.assessmentPlan}
                  field="assessmentPlan"
                  expanded={expandedSections.has('assessmentPlan')}
                  onToggle={() => toggleSection('assessmentPlan')}
                  onCopy={() => copyToClipboard(patient.assessmentPlan, 'assessmentPlan')}
                  copied={copied === 'assessmentPlan'}
                  onSave={(value) => handleSaveField('assessmentPlan', value)}
                  onSaveStyle={() => handleSaveStyleExample('assessmentPlan', patient.assessmentPlan)}
                  styleSaved={styleSaved === 'assessmentPlan'}
                />
              </>
            )}

            {/* DDx & Workup Tab */}
            {activeTab === 'ddx' && (
              <>
                <OutputSection
                  title="Differential Diagnosis"
                  content={patient.ddx}
                  field="ddx"
                  expanded={expandedSections.has('ddx')}
                  onToggle={() => toggleSection('ddx')}
                  onCopy={() => copyToClipboard(patient.ddx, 'ddx')}
                  copied={copied === 'ddx'}
                  onSave={(value) => handleSaveField('ddx', value)}
                />

                <OutputSection
                  title="Investigations"
                  content={patient.investigations}
                  field="investigations"
                  expanded={expandedSections.has('investigations')}
                  onToggle={() => toggleSection('investigations')}
                  onCopy={() => copyToClipboard(patient.investigations, 'investigations')}
                  copied={copied === 'investigations'}
                  onSave={(value) => handleSaveField('investigations', value)}
                />
              </>
            )}

            {/* Referral Tab */}
            {activeTab === 'referral' && (
              <>
                {patient.referral ? (
                  <OutputSection
                    title="Referral Letter"
                    content={patient.referral}
                    field="referral"
                    expanded={expandedSections.has('referral')}
                    onToggle={() => toggleSection('referral')}
                    onCopy={() => copyToClipboard(patient.referral, 'referral')}
                    copied={copied === 'referral'}
                    onSave={(value) => handleSaveField('referral', value)}
                  />
                ) : (
                  <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
                    <p className="text-gray-500 mb-3">No referral generated yet</p>
                    <button
                      onClick={() => setShowReferralModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium"
                    >
                      <Send className="w-4 h-4" />
                      Generate Referral
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Billing Section */}
        <BillingSection
          billingItems={billingItems}
          comments={billingComments}
          onSave={handleBillingSave}
          onSaveComments={(c) => { setBillingComments(c); handleSaveField('comments', c); }}
          showBilling={showBilling}
          setShowBilling={setShowBilling}
        />

        {/* Input Data (Triage, Transcript) */}
        <div className="mt-6 pt-6 border-t">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Source Data
            </h3>
            <VoiceRecorder
              onTranscript={(text) => {
                const current = patient.transcript || '';
                const updated = current ? `${current}\n\n${text}` : text;
                handleSaveField('transcript', updated);
              }}
            />
          </div>

          {patient.triageVitals && (
            <OutputSection
              title="Triage Notes"
              content={patient.triageVitals}
              field="triageVitals"
              expanded={expandedSections.has('triage')}
              onToggle={() => toggleSection('triage')}
              onCopy={() => copyToClipboard(patient.triageVitals, 'triage')}
              copied={copied === 'triage'}
              variant="muted"
              onSave={(value) => handleSaveField('triageVitals', value)}
            />
          )}

          <OutputSection
            title="Transcript"
            content={patient.transcript || ''}
            field="transcript"
            expanded={expandedSections.has('transcript')}
            onToggle={() => toggleSection('transcript')}
            onCopy={() => copyToClipboard(patient.transcript || '', 'transcript')}
            copied={copied === 'transcript'}
            variant="muted"
            onSave={(value) => handleSaveField('transcript', value)}
          />
        </div>
      </main>

      {/* Referral Modal */}
      {patient && (
        <ReferralModal
          isOpen={showReferralModal}
          onClose={() => setShowReferralModal(false)}
          rowIndex={parseInt(rowIndex)}
          sheetName={sheetName}
          onGenerated={handleReferralGenerated}
        />
      )}
    </div>
  );
}

// Output Section Component with inline editing
function OutputSection({
  title,
  content,
  field,
  expanded,
  onToggle,
  onCopy,
  copied,
  variant = 'default',
  onSave,
  onSaveStyle,
  styleSaved,
  showExamToggles,
}: {
  title: string;
  content: string;
  field: string;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  variant?: 'default' | 'muted';
  onSave?: (value: string) => void;
  onSaveStyle?: () => void;
  styleSaved?: boolean;
  showExamToggles?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);

  if (!content && !editing && !onSave) return null;

  const bgColor = variant === 'muted' ? 'bg-gray-50' : 'bg-white';
  const borderColor = variant === 'muted' ? 'border-gray-200' : 'border-gray-100';

  const handleStartEdit = () => {
    setEditValue(content);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    if (onSave) {
      onSave(editValue);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(content);
    setEditing(false);
  };

  return (
    <div className={`${bgColor} rounded-xl shadow-sm border ${borderColor} overflow-hidden`}>
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={onToggle}>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-1">
          {onSaveStyle && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSaveStyle();
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Save as style example"
            >
              {styleSaved ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Bookmark className="w-4 h-4 text-gray-400" />
              )}
            </button>
          )}
          {onSave && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStartEdit();
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Pencil className="w-4 h-4 text-gray-400" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4">
          {editing ? (
            <div className="space-y-2">
              {showExamToggles && (
                <ExamToggles
                  value={editValue}
                  onChange={setEditValue}
                />
              )}
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full h-40 p-3 border rounded-lg text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
              {content}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

