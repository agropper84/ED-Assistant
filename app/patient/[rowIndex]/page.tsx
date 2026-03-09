'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Patient } from '@/lib/google-sheets';
import {
  ArrowLeft, Loader2, Play, Copy, Check,
  User, Calendar, CreditCard, FileText,
  ChevronDown, ChevronUp, Pencil, X, Save,
  RefreshCw, Send, Bookmark, Plus, Scissors
} from 'lucide-react';
import { ExamToggles } from '@/components/ExamToggles';
import { ReferralModal } from '@/components/ReferralModal';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { fetchStyleGuide, addExampleAsync, persistStyleGuide, StyleGuide } from '@/lib/style-guide';
import {
  BillingItem,
  parseBillingItems,
} from '@/lib/billing';
import { BillingSection } from '@/components/BillingSection';
import { getPromptTemplates } from '@/lib/settings';

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

  // Synopsis state
  const [generatingSynopsis, setGeneratingSynopsis] = useState(false);

  // Update analysis state
  const [updatingAnalysis, setUpdatingAnalysis] = useState(false);

  // Quick-add note state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [savingQuickAdd, setSavingQuickAdd] = useState(false);
  const [preRecordQuickAdd, setPreRecordQuickAdd] = useState('');

  // Physician notes (A&P)
  const [apNotes, setApNotes] = useState('');
  const [savingApNotes, setSavingApNotes] = useState(false);
  const [regeneratingAp, setRegeneratingAp] = useState(false);
  const [preRecordApNotes, setPreRecordApNotes] = useState('');

  // Error state
  const [processError, setProcessError] = useState('');

  // Style save confirmation
  const [styleSaved, setStyleSaved] = useState<string | null>(null);

  useEffect(() => {
    fetchPatient();
  }, [rowIndex, sheetName]);

  useEffect(() => {
    if (patient) {
      setApNotes(patient.apNotes || '');
    }
  }, [patient?.apNotes]);

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
      const res = await fetch(`/api/patients/${rowIndex}${sheetParam}`, { cache: 'no-store' });
      if (res.status === 403) { window.location.href = '/pending'; return; }
      if (res.status === 401) { window.location.href = '/login'; return; }
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
      // Get settings from localStorage
      let settings: any;
      try {
        const stored = localStorage.getItem('ed-app-settings');
        if (stored) settings = JSON.parse(stored);
      } catch {}

      // Style guide is now fetched server-side in the process route
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: parseInt(rowIndex),
          sheetName,
          modifications: mods,
          settings,
          promptTemplates: getPromptTemplates(),
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
    try {
      await fetch(`/api/patients/${rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _billingItems: items,
          ...(comments !== undefined ? { comments } : {}),
          _sheetName: sheetName,
        }),
      });
    } catch (error) {
      console.error('Failed to save billing:', error);
    }
  };

  const handleSaveStyleExample = async (section: string, content: string) => {
    const sectionKey = section as 'hpi' | 'objective' | 'assessmentPlan';
    setStyleSaved(section);
    setTimeout(() => setStyleSaved(null), 2000);

    try {
      const current = await fetchStyleGuide();
      const updated = await addExampleAsync(sectionKey, content, current);

      // Fire-and-forget: extract style features
      fetch('/api/extract-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          example: content,
          section: sectionKey,
          existingFeatures: updated.extractedFeatures,
        }),
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.features?.length > 0) {
            const merged: StyleGuide = {
              ...updated,
              extractedFeatures: [...updated.extractedFeatures, ...data.features],
            };
            persistStyleGuide(merged);
          }
        })
        .catch(() => {}); // silently ignore
    } catch (err) {
      console.error('Failed to save style example:', err);
    }
  };

  const handleRegenerateSection = async (section: string, updates: string) => {
    const res = await fetch('/api/regenerate-section', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowIndex: parseInt(rowIndex),
        sheetName,
        section,
        updates,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to regenerate');
    }
    await fetchPatient();
  };

  const handleGenerateSynopsis = async () => {
    setGeneratingSynopsis(true);
    try {
      const res = await fetch('/api/synopsis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: parseInt(rowIndex), sheetName }),
      });
      if (res.ok) {
        await fetchPatient();
      }
    } catch (error) {
      console.error('Failed to generate synopsis:', error);
    } finally {
      setGeneratingSynopsis(false);
    }
  };

  const handleUpdateAnalysis = async () => {
    setUpdatingAnalysis(true);
    try {
      // Regenerate synopsis and DDx/management/evidence in parallel
      await Promise.all([
        fetch('/api/synopsis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndex: parseInt(rowIndex), sheetName }),
        }),
        fetch('/api/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndex: parseInt(rowIndex), sheetName }),
        }),
      ]);

      await fetchPatient();
    } catch (error) {
      console.error('Failed to update analysis:', error);
    } finally {
      setUpdatingAnalysis(false);
    }
  };

  const handleQuickAddSave = async () => {
    if (!quickAddText.trim() || !patient) return;
    setSavingQuickAdd(true);
    try {
      const current = patient.additional || '';
      const updated = current ? `${current}\n${quickAddText.trim()}` : quickAddText.trim();
      await handleSaveField('additional', updated);
      setQuickAddText('');
      setShowQuickAdd(false);
    } finally {
      setSavingQuickAdd(false);
    }
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
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Patient not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="dash-header px-4 py-4 sticky top-0 z-40">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-white/10 rounded-full -ml-2"
          >
            <ArrowLeft className="w-5 h-5" style={{ color: 'var(--dash-text-sub)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate" style={{ color: 'var(--dash-text)' }}>
              {patient.name || 'Unknown'}
            </h1>
            <p className="text-sm" style={{ color: 'var(--dash-text-muted)' }}>
              {patient.age && `${patient.age} `}
              {patient.gender && `${patient.gender} `}
              {patient.timestamp && `• ${patient.timestamp}`}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-[var(--page-px)] py-4 space-y-4 animate-fadeIn">
        {/* Patient Info Card */}
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5" style={{ boxShadow: 'var(--card-shadow)' }}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-secondary)]">DOB:</span>
              <span className="font-medium text-[var(--text-primary)]">{patient.birthday || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-secondary)]">HCN:</span>
              <span className="font-medium text-[var(--text-primary)]">{patient.hcn || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-secondary)]">MRN:</span>
              <span className="font-medium text-[var(--text-primary)]">{patient.mrn || '—'}</span>
            </div>
            {patient.diagnosis && (
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                <span className="text-[var(--text-secondary)]">Dx:</span>
                <span className="font-medium text-[var(--text-primary)]">{patient.diagnosis}</span>
              </div>
            )}
          </div>
        </div>

        {/* Synopsis Card — always visible */}
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5" style={{ boxShadow: 'var(--card-shadow)' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest">AI Synopsis</h3>
            {patient.synopsis && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copyToClipboard(patient.synopsis, 'synopsis')}
                  className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                >
                  {copied === 'synopsis' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  )}
                </button>
                <button
                  onClick={handleGenerateSynopsis}
                  disabled={generatingSynopsis}
                  className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                >
                  {generatingSynopsis ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  )}
                </button>
              </div>
            )}
          </div>
          {patient.synopsis ? (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{patient.synopsis}</p>
          ) : (
            <button
              onClick={handleGenerateSynopsis}
              disabled={generatingSynopsis}
              className="w-full py-2.5 border border-dashed border-[var(--border)] text-[var(--text-muted)] rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingSynopsis ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Generate Synopsis
                </>
              )}
            </button>
          )}
        </div>

        {/* Update AI Analysis Button */}
        <button
          onClick={handleUpdateAnalysis}
          disabled={updatingAnalysis}
          className="w-full py-3 border border-[var(--border)] text-[var(--text-secondary)] rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.99] transition-all disabled:opacity-50"
        >
          {updatingAnalysis ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Updating Analysis...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Update AI Analysis
            </>
          )}
        </button>

        {/* Process Error */}
        {processError && (
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300 text-sm">
            <p className="font-medium">Processing failed</p>
            <p className="mt-1">{processError}</p>
          </div>
        )}

        {/* Tab Bar — always visible */}
        <div className="flex gap-1 bg-[var(--bg-tertiary)] rounded-2xl p-1" style={{ boxShadow: 'var(--card-shadow)' }}>
          {(['encounter', 'ddx', 'referral'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all ${
                activeTab === tab
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab === 'encounter' ? 'Encounter Note' : tab === 'ddx' ? 'DDx & Management' : 'Referral'}
            </button>
          ))}
        </div>

        {/* Encounter Note Tab */}
        {activeTab === 'encounter' && (
          <>
            {patient.hasOutput ? (
              <>
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={copyFullNote}
                    className="flex-1 py-3 bg-[var(--accent)] text-white rounded-2xl font-medium flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.97] transition-all"
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
                    className="py-3 px-4 border border-[var(--border)] text-[var(--text-secondary)] rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Modify
                  </button>
                  <button
                    onClick={() => setShowReferralModal(true)}
                    className="py-3 px-4 border border-[var(--border)] text-[var(--text-secondary)] rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all"
                  >
                    <Send className="w-4 h-4" />
                    Refer
                  </button>
                </div>

                {/* Modification Panel */}
                {showModify && (
                  <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3 animate-slideUp">
                    <h3 className="font-semibold text-amber-900 dark:text-amber-200">Modify & Regenerate</h3>
                    <textarea
                      value={modifications}
                      onChange={(e) => setModifications(e.target.value)}
                      placeholder="Describe what changes you want (e.g., 'Add chest pain to HPI', 'Change diagnosis to pneumonia')..."
                      className="w-full h-24 p-3 border border-amber-300 dark:border-amber-700 rounded-lg text-sm resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleProcess(modifications)}
                        disabled={processing || !modifications.trim()}
                        className="flex-1 py-2.5 bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
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
                        className="py-2.5 px-4 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg font-medium active:scale-[0.97] transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

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
                  interactiveEdit
                  onRegenerate={(updates) => handleRegenerateSection('hpi', updates)}
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
                  interactiveEdit
                  onRegenerate={(updates) => handleRegenerateSection('objective', updates)}
                />

                {/* Diagnosis & ICD Codes */}
                <DiagnosisSection
                  patient={patient}
                  onSave={async (fields) => {
                    await fetch(`/api/patients/${rowIndex}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ...fields,
                        _sheetName: sheetName,
                        _upsertDiagnosis: fields.diagnosis ? { diagnosis: fields.diagnosis, icd9: fields.icd9 || '', icd10: fields.icd10 || '' } : undefined,
                      }),
                    });
                    await fetchPatient();
                  }}
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
                  interactiveEdit
                  onRegenerate={(updates) => handleRegenerateSection('assessmentPlan', updates)}
                />

                {/* Physician Notes for A&P */}
                <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">Physician Notes</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="relative">
                      <textarea
                        value={apNotes}
                        onChange={(e) => setApNotes(e.target.value)}
                        placeholder="Add physician notes, observations, or corrections to incorporate into the Assessment & Plan..."
                        rows={3}
                        className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y placeholder:text-[var(--text-muted)]"
                      />
                      <div className="absolute top-1.5 right-1.5">
                        <VoiceRecorder
                          onTranscript={(text) => {
                            const base = preRecordApNotes || apNotes;
                            setApNotes(base ? `${base}\n${text}` : text);
                          }}
                          onRecordingStart={() => setPreRecordApNotes(apNotes)}
                          onInterimTranscript={(text) => {
                            setApNotes(preRecordApNotes ? `${preRecordApNotes}\n${text}` : text);
                          }}
                          mode="dictation"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setSavingApNotes(true);
                          await handleSaveField('apNotes', apNotes);
                          setSavingApNotes(false);
                        }}
                        disabled={savingApNotes}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 active:scale-[0.97] transition-all"
                      >
                        {savingApNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save Notes
                      </button>
                      <button
                        onClick={async () => {
                          setRegeneratingAp(true);
                          try {
                            await handleSaveField('apNotes', apNotes);
                            await handleRegenerateSection('assessmentPlan', apNotes);
                          } catch (err) {
                            console.error('Failed to regenerate A&P with notes:', err);
                          } finally {
                            setRegeneratingAp(false);
                          }
                        }}
                        disabled={regeneratingAp || !apNotes.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-600 dark:bg-amber-500 text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 active:scale-[0.97] transition-all"
                      >
                        {regeneratingAp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Regenerate Note
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <button
                onClick={() => handleProcess()}
                disabled={processing}
                className="w-full py-4 bg-blue-600 dark:bg-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-blue-700 dark:hover:bg-blue-600 active:scale-[0.99] transition-all"
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
          </>
        )}

        {/* DDx & Management Tab */}
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
              title="Recommended Investigations"
              content={patient.investigations}
              field="investigations"
              expanded={expandedSections.has('investigations')}
              onToggle={() => toggleSection('investigations')}
              onCopy={() => copyToClipboard(patient.investigations, 'investigations')}
              copied={copied === 'investigations'}
              onSave={(value) => handleSaveField('investigations', value)}
            />

            <OutputSection
              title="Recommended Management"
              content={patient.management}
              field="management"
              expanded={expandedSections.has('management')}
              onToggle={() => toggleSection('management')}
              onCopy={() => copyToClipboard(patient.management, 'management')}
              copied={copied === 'management'}
              onSave={(value) => handleSaveField('management', value)}
            />

            <OutputSection
              title="Pertinent Evidence"
              content={patient.evidence}
              field="evidence"
              expanded={expandedSections.has('evidence')}
              onToggle={() => toggleSection('evidence')}
              onCopy={() => copyToClipboard(patient.evidence, 'evidence')}
              copied={copied === 'evidence'}
              onSave={(value) => handleSaveField('evidence', value)}
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
              <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-6 text-center" style={{ boxShadow: 'var(--card-shadow)' }}>
                <p className="text-[var(--text-muted)] mb-3">No referral generated yet</p>
                <button
                  onClick={() => setShowReferralModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 dark:bg-violet-500 text-white rounded-lg font-medium hover:bg-violet-700 dark:hover:bg-violet-600 active:scale-[0.97] transition-all"
                >
                  <Send className="w-4 h-4" />
                  Generate Referral
                </button>
              </div>
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
        <div className="mt-8 pt-6 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">
              Source Data
            </h3>
            <VoiceRecorder
              mode="encounter"
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

          <OutputSection
            title="Additional Findings"
            content={patient.additional || ''}
            field="additional"
            expanded={expandedSections.has('additional')}
            onToggle={() => toggleSection('additional')}
            onCopy={() => copyToClipboard(patient.additional || '', 'additional')}
            copied={copied === 'additional'}
            variant="muted"
            onSave={(value) => handleSaveField('additional', value)}
          />

          {/* Quick-add Note */}
          <div className="mt-3">
            {!showQuickAdd ? (
              <button
                onClick={() => setShowQuickAdd(true)}
                className="w-full py-2.5 border border-dashed border-[var(--border)] text-[var(--text-muted)] rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.99] transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Note
              </button>
            ) : (
              <div className="bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-light)] p-4 space-y-3 animate-slideUp">
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">Quick Add Note</h4>
                <div className="relative">
                  <textarea
                    value={quickAddText}
                    onChange={(e) => setQuickAddText(e.target.value)}
                    placeholder="Add exam findings, investigation results, or clinical notes..."
                    className="w-full h-24 p-3 pr-10 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    autoFocus
                  />
                  <div className="absolute top-1.5 right-1.5">
                    <VoiceRecorder
                      onTranscript={(text) => {
                        const base = preRecordQuickAdd || quickAddText;
                        setQuickAddText(base ? `${base}\n${text}` : text);
                      }}
                      onRecordingStart={() => setPreRecordQuickAdd(quickAddText)}
                      onInterimTranscript={(text) => {
                        setQuickAddText(preRecordQuickAdd ? `${preRecordQuickAdd}\n${text}` : text);
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleQuickAddSave}
                    disabled={savingQuickAdd || !quickAddText.trim()}
                    className="flex items-center gap-1 px-4 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 active:scale-[0.97] transition-all"
                  >
                    {savingQuickAdd ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Save
                  </button>
                  <button
                    onClick={() => { setShowQuickAdd(false); setQuickAddText(''); }}
                    className="flex items-center gap-1 px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg text-sm font-medium border border-[var(--border)] active:scale-[0.97] transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
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

// Diagnosis & ICD Codes Section
function DiagnosisSection({
  patient,
  onSave,
}: {
  patient: Patient;
  onSave: (fields: Record<string, string>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [diagnosis, setDiagnosis] = useState(patient.diagnosis || '');
  const [icd9, setIcd9] = useState(patient.icd9 || '');
  const [icd10, setIcd10] = useState(patient.icd10 || '');
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync when patient changes
  useEffect(() => {
    setDiagnosis(patient.diagnosis || '');
    setIcd9(patient.icd9 || '');
    setIcd10(patient.icd10 || '');
  }, [patient.diagnosis, patient.icd9, patient.icd10]);

  const handleLookup = async () => {
    if (!diagnosis.trim()) return;
    setLookingUp(true);
    try {
      const res = await fetch('/api/icd-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosis: diagnosis.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setDiagnosis(data.diagnosis || diagnosis);
        setIcd9(data.icd9 || '');
        setIcd10(data.icd10 || '');
      }
    } catch (err) {
      console.error('ICD lookup failed:', err);
    } finally {
      setLookingUp(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ diagnosis, icd9, icd10 });
      setEditing(false);
    } catch (err) {
      console.error('Failed to save diagnosis:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasDiagnosis = patient.diagnosis || patient.icd9 || patient.icd10;

  if (!hasDiagnosis && !editing) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <h3 className="font-semibold text-sm text-[var(--text-primary)]">Diagnosis & ICD Codes</h3>
        </div>
        {!editing && hasDiagnosis && (
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
        )}
      </div>
      <div className="p-4">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Diagnosis</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Enter diagnosis..."
                  className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                  autoFocus
                />
                <button
                  onClick={handleLookup}
                  disabled={lookingUp || !diagnosis.trim()}
                  className="px-3 py-2 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                  title="Look up ICD codes"
                >
                  {lookingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  ICD Lookup
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">ICD-9</label>
                <input
                  type="text"
                  value={icd9}
                  onChange={(e) => setIcd9(e.target.value)}
                  placeholder="e.g. 462"
                  className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">ICD-10</label>
                <input
                  type="text"
                  value={icd10}
                  onChange={(e) => setIcd10(e.target.value)}
                  placeholder="e.g. J02.9"
                  className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 active:scale-[0.97] transition-all"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                onClick={() => {
                  setDiagnosis(patient.diagnosis || '');
                  setIcd9(patient.icd9 || '');
                  setIcd10(patient.icd10 || '');
                  setEditing(false);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="font-medium text-[var(--text-primary)]">{patient.diagnosis}</div>
            {(patient.icd9 || patient.icd10) && (
              <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                {patient.icd9 && (
                  <span className="px-2 py-0.5 bg-[var(--bg-tertiary)] rounded font-mono">
                    ICD-9: {patient.icd9}
                  </span>
                )}
                {patient.icd10 && (
                  <span className="px-2 py-0.5 bg-[var(--bg-tertiary)] rounded font-mono">
                    ICD-10: {patient.icd10}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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
  interactiveEdit,
  onRegenerate,
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
  interactiveEdit?: boolean;
  onRegenerate?: (updates: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const [regenerating, setRegenerating] = useState(false);
  const [preRecordText, setPreRecordText] = useState('');

  if (!content && !editing && !onSave) return null;

  const bgClass = variant === 'muted' ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--card-bg)]';
  const borderClass = variant === 'muted' ? 'border-[var(--border-light)]' : 'border-[var(--card-border)]';

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

  const handleSaveAndRegenerate = async () => {
    if (!onRegenerate) return;
    setRegenerating(true);
    try {
      // Save edits first so the API sees updated content
      if (onSave && editValue !== content) {
        onSave(editValue);
      }
      // Regenerate using the edited text as context for updates
      const diff = editValue !== content ? editValue : '';
      await onRegenerate(diff);
      setEditing(false);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className={`${bgClass} rounded-2xl border ${borderClass} overflow-hidden`} style={{ boxShadow: variant === 'muted' ? 'none' : 'var(--card-shadow)' }}>
      <div className="flex items-center justify-between p-5 cursor-pointer" onClick={onToggle}>
        <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
        <div className="flex items-center gap-1">
          {onSaveStyle && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSaveStyle();
              }}
              className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
              title="Save as style example"
            >
              {styleSaved ? (
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Bookmark className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </button>
          )}
          {onSave && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStartEdit();
              }}
              className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
            >
              <Pencil className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4 text-[var(--text-muted)]" />
            )}
          </button>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-5">
          {editing ? (
            <div className="space-y-2">
              {showExamToggles && (
                <ExamToggles
                  value={editValue}
                  onChange={setEditValue}
                />
              )}
              <div className="relative">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full h-40 p-3 pr-10 border border-[var(--input-border)] rounded-lg text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                />
                <div className="absolute top-1.5 right-1.5">
                  <VoiceRecorder
                    onTranscript={(text) => {
                      const base = preRecordText || editValue;
                      setEditValue(base ? `${base}\n\n${text}` : text);
                    }}
                    onRecordingStart={() => setPreRecordText(editValue)}
                    onInterimTranscript={(text) => {
                      const base = preRecordText;
                      setEditValue(base ? `${base}\n\n${text}` : text);
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white rounded-lg text-sm font-medium active:scale-[0.97] transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>
                {onRegenerate && (
                  <button
                    onClick={handleSaveAndRegenerate}
                    disabled={regenerating}
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 dark:bg-amber-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 active:scale-[0.97] transition-all"
                  >
                    {regenerating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Regenerate
                  </button>
                )}
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg text-sm font-medium active:scale-[0.97] transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          ) : interactiveEdit && onSave ? (
            <InteractiveContent content={content} onSave={onSave} />
          ) : (
            <p className="text-[var(--text-secondary)] whitespace-pre-wrap text-sm leading-relaxed">
              {content}
            </p>
          )}

        </div>
      )}
    </div>
  );
}

// --- Sentence-level interactive content editor ---

type ContentPart = { text: string; type: 'sentence' | 'break' };

/** Split text into sentence-level parts, preserving line breaks */
function splitContent(text: string): ContentPart[] {
  if (!text) return [];
  const result: ContentPart[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      result.push({ text: '', type: 'break' });
      continue;
    }
    // Split sentences at ". " followed by uppercase letter, requiring 10+ chars
    // before the period to avoid splitting abbreviations (Dr., i.e., etc.)
    const sentences = line.split(/(?<=.{10,}\.)\s+(?=[A-Z])/);
    for (const s of sentences) {
      if (s.trim()) result.push({ text: s.trim(), type: 'sentence' });
    }
    if (i < lines.length - 1) {
      result.push({ text: '', type: 'break' });
    }
  }
  return result;
}

/** Reconstruct text from parts, joining same-paragraph sentences with spaces */
function partsToText(parts: ContentPart[]): string {
  const lines: string[] = [];
  let cur: string[] = [];
  for (const p of parts) {
    if (p.type === 'break') {
      lines.push(cur.join(' '));
      cur = [];
    } else {
      cur.push(p.text);
    }
  }
  if (cur.length > 0) lines.push(cur.join(' '));
  return lines.join('\n');
}

function truncateSentence(text: string): string {
  // 1. Remove parenthetical content
  let truncated = text.replace(/\s*\([^)]*\)/g, '');
  // 2. Truncate at first comma (if enough content before it)
  const commaIdx = truncated.indexOf(', ');
  if (commaIdx > 10) {
    truncated = truncated.substring(0, commaIdx) + '.';
  }
  if (truncated === text) {
    // If nothing changed, try truncating at semicolon
    const semiIdx = truncated.indexOf('; ');
    if (semiIdx > 10) {
      truncated = truncated.substring(0, semiIdx) + '.';
    }
  }
  return truncated;
}

function InteractiveContent({
  content,
  onSave,
}: {
  content: string;
  onSave: (newContent: string) => void;
}) {
  const [parts, setParts] = useState<ContentPart[]>(() => splitContent(content));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addingDetail, setAddingDetail] = useState(false);
  const [detailText, setDetailText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Sync parts when content prop changes (after save round-trip)
  useEffect(() => {
    setParts(splitContent(content));
    setSelected(new Set());
    setAddingDetail(false);
    setDetailText('');
  }, [content]);

  function save(newParts: ContentPart[]) {
    setParts(newParts);
    onSave(partsToText(newParts));
  }

  function toggleSelect(idx: number) {
    const next = new Set(selected);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelected(next);
    setAddingDetail(false);
    setDetailText('');
  }

  function handleRemove(idx: number) {
    const newParts = parts.filter((_, i) => i !== idx);
    const next = new Set<number>();
    // Shift selected indices that are above the removed one
    Array.from(selected).forEach(s => {
      if (s < idx) next.add(s);
      else if (s > idx) next.add(s - 1);
    });
    setSelected(next);
    save(newParts);
  }

  function handleRemoveSelected() {
    const newParts = parts.filter((_, i) => !selected.has(i));
    setSelected(new Set());
    save(newParts);
  }

  async function handleAiEdit(operation: 'expand' | 'shorten', hint?: string) {
    if (selected.size === 0) return;
    setAiLoading(true);
    try {
      const sorted = Array.from(selected).sort((a, b) => a - b);
      const selectedText = sorted
        .map(i => parts[i]?.text)
        .filter(Boolean)
        .join(' ');
      const fullContext = partsToText(parts);

      const templates = getPromptTemplates();
      const res = await fetch('/api/edit-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: selectedText,
          operation,
          hint: hint || undefined,
          context: fullContext,
          expandInstructions: templates.editExpand,
          shortenInstructions: templates.editShorten,
        }),
      });
      if (!res.ok) throw new Error('AI edit failed');
      const { result } = await res.json();

      // Replace selected sentences with AI result
      const newParts = parts.filter((_, i) => !selected.has(i));
      // Insert new sentences where the first selected sentence was
      const insertAt = sorted[0];
      const newSentenceParts = splitContent(result).filter(p => p.type === 'sentence');
      newParts.splice(insertAt, 0, ...newSentenceParts);

      setSelected(new Set());
      setAddingDetail(false);
      setDetailText('');
      save(newParts);
    } catch (err) {
      console.error('AI edit error:', err);
    } finally {
      setAiLoading(false);
    }
  }

  function handleShortenSelected() {
    handleAiEdit('shorten');
  }

  function handleAddDetailToSelection() {
    if (selected.size === 0) return;
    handleAiEdit('expand', detailText.trim() || undefined);
  }

  const hasSelection = selected.size > 0;

  return (
    <div className="text-[var(--text-secondary)] text-sm leading-relaxed">
      {parts.map((part, idx) => {
        if (part.type === 'break') return <br key={idx} />;

        const isSelected = selected.has(idx);

        return (
          <span key={idx}>
            <span
              className={`relative transition-colors duration-150 cursor-pointer rounded-sm px-0.5 -mx-0.5 ${
                isSelected
                  ? 'bg-violet-200 dark:bg-violet-800/50'
                  : 'hover:bg-violet-100 dark:hover:bg-violet-900/30'
              }`}
              onClick={(e) => { e.stopPropagation(); toggleSelect(idx); }}
            >
              {part.text}
            </span>
            {' '}
          </span>
        );
      })}

      {/* AI loading indicator */}
      {aiLoading && (
        <div className="flex items-center gap-2 mt-3 p-2 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 rounded-lg">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600 dark:text-violet-400" />
          <span className="text-xs text-violet-700 dark:text-violet-300 font-medium">AI is editing...</span>
        </div>
      )}

      {/* Selection action bar */}
      {hasSelection && !addingDetail && !aiLoading && (
        <div className="flex items-center gap-2 mt-3 p-2 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 rounded-lg">
          <span className="text-xs text-violet-700 dark:text-violet-300 font-medium">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={handleRemoveSelected}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
          >
            <X className="w-3 h-3" />
            Remove
          </button>
          <button
            onClick={() => { setAddingDetail(true); setDetailText(''); }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Detail
          </button>
          <button
            onClick={handleShortenSelected}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded transition-colors"
          >
            <Scissors className="w-3 h-3" />
            Shorten
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Add detail input */}
      {addingDetail && !aiLoading && (
        <div className="flex items-center gap-1 mt-2 p-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg">
          <input
            type="text"
            value={detailText}
            onChange={(e) => setDetailText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddDetailToSelection();
              if (e.key === 'Escape') { setAddingDetail(false); setDetailText(''); }
            }}
            placeholder="What detail should AI add? (optional — leave blank for general expansion)"
            autoFocus
            className="flex-1 p-1.5 border border-[var(--input-border)] rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); handleAddDetailToSelection(); }}
            className="text-xs text-blue-600 dark:text-blue-400 font-medium px-2.5 py-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded"
          >
            Add
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setAddingDetail(false); setDetailText(''); }}
            className="text-xs text-[var(--text-muted)] px-2.5 py-1.5 hover:bg-[var(--bg-tertiary)] rounded"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
