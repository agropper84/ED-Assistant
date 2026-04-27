'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Patient } from '@/lib/google-sheets';
import {
  ArrowLeft, Loader2, Play, Copy, Check,
  FileText,
  ChevronDown, ChevronUp, Pencil, X, Save,
  RefreshCw, Send, Bookmark, Plus, Scissors, FilePlus, BookOpen, Printer
} from 'lucide-react';
import { ExamToggles } from '@/components/ExamToggles';
import { ReferralModal } from '@/components/ReferralModal';
import { AdmissionModal } from '@/components/AdmissionModal';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { fetchStyleGuide, addExampleAsync, persistStyleGuide, StyleGuide } from '@/lib/style-guide';
import {
  BillingItem,
  parseBillingItems,
  getDayRegion,
} from '@/lib/billing';
import { BillingSection } from '@/components/BillingSection';
import { PatientProfile } from '@/components/PatientProfile';
import { DiagnosisSection } from '@/components/DiagnosisSection';
import type { PatientProfile as ProfileData } from '@/app/api/profile/route';
import { getPromptTemplates, getEffectivePromptTemplates } from '@/lib/settings';

export default function PatientPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const rowIndex = params.rowIndex as string;
  const sheetName = searchParams.get('sheet') || undefined;
  const patientNameParam = searchParams.get('name') || undefined;
  const isEmbed = searchParams.get('embed') === '1';

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

  // Referral / Admission modals
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showAdmissionModal, setShowAdmissionModal] = useState(false);

  // Active tab for output view
  const [activeTab, setActiveTab] = useState<'encounter' | 'admission' | 'referral' | 'education'>('encounter');

  // Patient education handout
  const [eduTopic, setEduTopic] = useState('');
  const [eduInstructions, setEduInstructions] = useState('');
  const [eduLanguage, setEduLanguage] = useState('');
  const [generatingEdu, setGeneratingEdu] = useState(false);

  // Insights panel (replaces DDx tab)
  const [insightsExpanded, setInsightsExpanded] = useState(false);

  // Billing state
  const [showBilling, setShowBilling] = useState(false);
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [billingComments, setBillingComments] = useState('');

  // Synopsis state
  const [generatingSynopsis, setGeneratingSynopsis] = useState(false);

  // Profile state
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);

  // Update analysis state
  const [updatingAnalysis, setUpdatingAnalysis] = useState(false);

  // Source data section
  const [sourceDataExpanded, setSourceDataExpanded] = useState(false);

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

  // Parse profile JSON when patient loads
  useEffect(() => {
    if (patient?.profile) {
      try {
        setProfileData(JSON.parse(patient.profile));
      } catch {
        setProfileData(null);
      }
    } else {
      setProfileData(null);
    }
  }, [patient?.profile]);

  const fetchPatient = async () => {
    try {
      const queryParts: string[] = [];
      if (sheetName) queryParts.push(`sheet=${encodeURIComponent(sheetName)}`);
      if (patientNameParam) queryParts.push(`name=${encodeURIComponent(patientNameParam)}`);
      const queryStr = queryParts.length ? `?${queryParts.join('&')}` : '';
      const res = await fetch(`/api/patients/${rowIndex}${queryStr}`, { cache: 'no-store' });
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
          patientName: patient?.name,
          modifications: mods,
          settings,
          promptTemplates: getEffectivePromptTemplates(),
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
        body: JSON.stringify({ [field]: value, _sheetName: sheetName, _patientName: patient?.name }),
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
          _patientName: patient?.name,
        }),
      });
    } catch (error) {
      console.error('Failed to save billing:', error);
    }
  };

  const handleSaveStyleExample = async (section: string, content: string) => {
    const sectionKey = section as 'hpi' | 'objective' | 'assessmentPlan' | 'referral' | 'admission';
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
        patientName: patient?.name,
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
        body: JSON.stringify({ rowIndex: parseInt(rowIndex), sheetName, patientName: patient?.name }),
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

  const handleGenerateProfile = async () => {
    setGeneratingProfile(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: parseInt(rowIndex), sheetName, patientName: patient?.name }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfileData(data.profile);
        // Also refresh patient to get updated profile column
        await fetchPatient();
      }
    } catch (error) {
      console.error('Failed to generate profile:', error);
    } finally {
      setGeneratingProfile(false);
    }
  };

  const handleUpdateAnalysis = async () => {
    setUpdatingAnalysis(true);
    try {
      // Regenerate synopsis, profile, and DDx/management/evidence in parallel
      const pName = patient?.name;
      await Promise.all([
        fetch('/api/synopsis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndex: parseInt(rowIndex), sheetName, patientName: pName }),
        }),
        fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndex: parseInt(rowIndex), sheetName, patientName: pName }),
        }),
        fetch('/api/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndex: parseInt(rowIndex), sheetName, patientName: pName }),
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

  const handleAdmissionGenerated = async () => {
    await fetchPatient();
    setShowAdmissionModal(false);
    setActiveTab('admission');
  };

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(section);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyFullNote = async () => {
    if (!patient) return;
    // Clean blank lines from each section before copying
    const clean = (s: string) => s?.split('\n').filter(l => l.trim()).join('\n') || '';
    const fullNote = `HPI:\n${clean(patient.hpi)}\n\nOBJECTIVE:\n${clean(patient.objective)}\n\nASSESSMENT & PLAN:\n${clean(patient.assessmentPlan)}`;
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
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--page-accent)' }} />
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
    <div className={isEmbed ? 'pb-8' : 'min-h-screen pb-24'}>
      {/* Header */}
      {!isEmbed ? (
        <header className="warm-header px-4 py-3 sticky top-0 z-40" style={{ borderBottom: '1px solid rgba(120,113,108,0.12)' }}>
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-white/10 rounded-full -ml-2"
            >
              <ArrowLeft className="w-5 h-5" style={{ color: 'var(--page-header-sub)' }} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold truncate" style={{ color: 'var(--page-header-text)' }}>
                {patient.name || 'Unknown'}
              </h1>
              <div className="flex items-center gap-2 text-xs mt-0.5 flex-wrap" style={{ color: 'var(--page-header-sub)' }}>
                {patient.age && <span>{patient.age}</span>}
                {patient.gender && <span>{patient.gender}</span>}
                {patient.timestamp && <><span className="opacity-40">·</span><span style={{ color: 'var(--page-accent)' }}>{patient.timestamp}</span></>}
                {patient.birthday && <><span className="opacity-40">·</span><span>DOB {patient.birthday}</span></>}
                {patient.hcn && <><span className="opacity-40">·</span><span>HCN {patient.hcn}</span></>}
                {patient.mrn && <><span className="opacity-40">·</span><span>MRN {patient.mrn}</span></>}
              </div>
            </div>
          </div>
        </header>
      ) : (
        /* Compact embed header — no gradient, minimal height */
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] sticky top-0 z-40">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            {patient.birthday && <span>DOB: {patient.birthday}</span>}
            {patient.hcn && <><span className="opacity-30">|</span><span>HCN: {patient.hcn}</span></>}
            {patient.mrn && <><span className="opacity-30">|</span><span>MRN: {patient.mrn}</span></>}
          </div>
        </div>
      )}

      <main className={isEmbed ? 'px-3 py-3 space-y-3' : 'max-w-2xl mx-auto px-[var(--page-px)] py-4 space-y-4 animate-fadeIn'}>
        {/* Patient Profile Card */}
        <PatientProfile
          profile={profileData}
          age={patient.age}
          gender={patient.gender}
          onGenerate={handleGenerateProfile}
          generating={generatingProfile}
        />

        {/* Insights Section (DDx, Investigations, Management, Evidence) */}
        {(patient.ddx || patient.investigations || patient.management || patient.evidence || patient.education) && (
          <div className="warm-card rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-px transition-all duration-200" style={{ borderLeft: '2px solid var(--page-accent-border)' }}>
            {/* Insights Header */}
            <div
              className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none transition-colors"
              style={{ borderBottom: insightsExpanded ? '1px solid var(--page-divider)' : 'none' }}
              onClick={() => setInsightsExpanded(!insightsExpanded)}
            >
              <div className="flex items-center gap-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--page-accent)' }}>Insights</h3>
                {!insightsExpanded && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {[patient.ddx && 'DDx', patient.investigations && 'Investigations', patient.management && 'Management', patient.evidence && 'Evidence'].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleUpdateAnalysis(); }}
                  disabled={updatingAnalysis}
                  className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                  title="Refresh insights & profile"
                >
                  {updatingAnalysis ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  )}
                </button>
                {insightsExpanded ? (
                  <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                )}
              </div>
            </div>

            {/* Insights Body */}
            {insightsExpanded && (
              <div className="divide-y" style={{ borderColor: 'var(--page-divider)' }}>
                {patient.ddx && (
                  <OutputSection
                    title="Differential Diagnosis"
                    content={patient.ddx}
                    field="ddx"
                    expanded={expandedSections.has('ddx')}
                    onToggle={() => toggleSection('ddx')}
                    onCopy={() => copyToClipboard(patient.ddx, 'ddx')}
                    copied={copied === 'ddx'}
                    onSave={(value) => handleSaveField('ddx', value)}
                    variant="flat"
                  />
                )}
                {patient.investigations && (
                  <OutputSection
                    title="Recommended Investigations"
                    content={patient.investigations}
                    field="investigations"
                    expanded={expandedSections.has('investigations')}
                    onToggle={() => toggleSection('investigations')}
                    onCopy={() => copyToClipboard(patient.investigations, 'investigations')}
                    copied={copied === 'investigations'}
                    onSave={(value) => handleSaveField('investigations', value)}
                    variant="flat"
                  />
                )}
                {patient.management && (
                  <OutputSection
                    title="Recommended Management"
                    content={patient.management}
                    field="management"
                    expanded={expandedSections.has('management')}
                    onToggle={() => toggleSection('management')}
                    onCopy={() => copyToClipboard(patient.management, 'management')}
                    copied={copied === 'management'}
                    onSave={(value) => handleSaveField('management', value)}
                    variant="flat"
                  />
                )}
                {patient.evidence && (
                  <OutputSection
                    title="Pertinent Evidence"
                    content={patient.evidence}
                    field="evidence"
                    expanded={expandedSections.has('evidence')}
                    onToggle={() => toggleSection('evidence')}
                    onCopy={() => copyToClipboard(patient.evidence, 'evidence')}
                    copied={copied === 'evidence'}
                    onSave={(value) => handleSaveField('evidence', value)}
                    variant="flat"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Process Error */}
        {processError && (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)', color: 'var(--accent-red)' }}>
            <p className="font-medium">Processing failed</p>
            <p className="mt-1">{processError}</p>
          </div>
        )}

        {/* Tab Bar */}
        <div className={`flex gap-1 p-1 ${isEmbed ? 'rounded-xl' : 'rounded-2xl'}`} style={{ background: 'var(--page-card-bg)', border: '1px solid var(--page-card-border)', boxShadow: 'var(--page-card-shadow)', backdropFilter: 'blur(16px)' }}>
          {(['encounter', 'admission', 'referral', 'education'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 font-medium transition-all ${isEmbed ? 'py-1.5 text-[11px] rounded-lg' : 'py-2.5 text-xs sm:text-sm rounded-xl'}`}
              style={activeTab === tab ? {
                background: 'linear-gradient(135deg, var(--page-accent), color-mix(in srgb, var(--page-accent) 80%, #000))',
                color: '#fff',
                boxShadow: '0 2px 8px var(--page-accent-glow)',
              } : {
                color: 'var(--text-secondary)',
              }}
            >
              {tab === 'encounter' ? 'Note' : tab === 'admission' ? 'Consult' : tab === 'referral' ? 'Referral' : 'Education'}
            </button>
          ))}
        </div>

        {/* Encounter Note Tab */}
        {activeTab === 'encounter' && (
          <>
            {patient.hasOutput ? (
              <>
                {/* Action Buttons */}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={copyFullNote}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg active:scale-[0.97] transition-all"
                    style={{ border: '1px solid var(--page-card-border)', color: 'var(--text-secondary)' }}
                  >
                    {copied === 'full' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copied === 'full' ? 'Copied' : 'Copy Note'}
                  </button>
                  <button
                    onClick={() => setShowModify(!showModify)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg active:scale-[0.97] transition-all"
                    style={{ border: '1px solid var(--page-accent-border)', color: 'var(--page-accent)' }}
                  >
                    <Pencil className="w-3 h-3" />
                    Modify
                  </button>
                </div>

                {/* Modification Panel */}
                {showModify && (
                  <div className="warm-card rounded-2xl p-5 space-y-3 animate-slideUp">
                    <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--page-section-label)', letterSpacing: '0.12em' }}>Modifications</h3>
                    <textarea
                      value={modifications}
                      onChange={(e) => setModifications(e.target.value)}
                      placeholder="Describe what changes you want (e.g., 'Add chest pain to HPI', 'Change diagnosis to pneumonia')..."
                      className="w-full h-24 p-3 rounded-xl text-sm resize-y bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      style={{ border: '0.5px solid var(--page-card-border)' }}
                      onFocus={(e) => { e.target.style.outline = 'none'; e.target.style.boxShadow = '0 0 0 2px var(--page-accent-glow)'; e.target.style.borderColor = 'var(--page-accent-border)'; }}
                      onBlur={(e) => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = 'var(--page-card-border)'; }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleProcess(modifications)}
                        disabled={processing || !modifications.trim()}
                        className="flex-1 py-2.5 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.97] transition-all"
                        style={{ background: 'linear-gradient(135deg, var(--page-accent), color-mix(in srgb, var(--page-accent) 80%, #000))' }}
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
                        className="py-2.5 px-4 text-[var(--text-secondary)] rounded-xl font-medium active:scale-[0.97] transition-all"
                        style={{ border: '1px solid var(--page-card-border)' }}
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
                  accentBorder="warm"
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
                  accentBorder="warm"
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
                  accentBorder="warm"
                />

                {/* Physician Notes */}
                <div className="warm-card rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-px transition-all duration-200" style={{ borderLeft: '2px solid var(--page-accent-border)' }}>
                  <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--page-divider)' }}>
                    <FileText className="w-4 h-4" style={{ color: 'var(--page-accent)' }} />
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">Physician Notes</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="relative">
                      <textarea
                        value={apNotes}
                        onChange={(e) => setApNotes(e.target.value)}
                        placeholder="Add physician notes, observations, or corrections to incorporate into the Assessment & Plan..."
                        rows={3}
                        className="w-full rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] px-3 py-2 pr-10 text-sm resize-y placeholder:text-[var(--text-muted)]"
                        style={{ border: '0.5px solid var(--page-card-border)' }}
                        onFocus={(e) => { e.target.style.outline = 'none'; e.target.style.boxShadow = '0 0 0 2px var(--page-accent-glow)'; e.target.style.borderColor = 'var(--page-accent-border)'; }}
                        onBlur={(e) => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = 'var(--page-card-border)'; }}
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
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl text-white hover:brightness-110 disabled:opacity-50 active:scale-[0.97] transition-all"
                        style={{ background: 'linear-gradient(135deg, var(--page-accent), color-mix(in srgb, var(--page-accent) 80%, #000))' }}
                      >
                        {savingApNotes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save Notes
                      </button>
                      <button
                        onClick={async () => {
                          setRegeneratingAp(true);
                          try {
                            await handleSaveField('apNotes', apNotes);
                            await handleProcess(apNotes);
                          } catch (err) {
                            console.error('Failed to regenerate note with physician notes:', err);
                          } finally {
                            setRegeneratingAp(false);
                          }
                        }}
                        disabled={regeneratingAp || processing || !apNotes.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl text-[var(--text-secondary)] disabled:opacity-50 active:scale-[0.97] transition-all"
                        style={{ border: '1px solid var(--page-card-border)' }}
                      >
                        {regeneratingAp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Regenerate Note
                      </button>
                    </div>
                  </div>
                </div>

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
              </>
            ) : (
              <button
                onClick={() => handleProcess()}
                disabled={processing}
                className="w-full py-3 text-white rounded-2xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 active:scale-[0.97] transition-all"
                style={{ background: 'linear-gradient(135deg, var(--page-accent), color-mix(in srgb, var(--page-accent) 80%, #000))' }}
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
                onSaveStyle={() => handleSaveStyleExample('referral', patient.referral)}
                styleSaved={styleSaved === 'referral'}
              />
            ) : (
              <div className="warm-card rounded-2xl p-6 text-center">
                <p className="text-[var(--text-muted)] mb-3">No referral generated yet</p>
                <button
                  onClick={() => setShowReferralModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl font-medium hover:brightness-110 active:scale-[0.97] transition-all"
                  style={{ background: 'linear-gradient(135deg, var(--page-accent), color-mix(in srgb, var(--page-accent) 80%, #000))' }}
                >
                  <Send className="w-4 h-4" />
                  Generate Referral
                </button>
              </div>
            )}
          </>
        )}

        {/* Admission Tab */}
        {activeTab === 'admission' && (
          <>
            {patient.admission ? (
              <OutputSection
                title="Consult Note"
                content={patient.admission}
                field="admission"
                expanded={expandedSections.has('admission')}
                onToggle={() => toggleSection('admission')}
                onCopy={() => copyToClipboard(patient.admission, 'admission')}
                copied={copied === 'admission'}
                onSave={(value) => handleSaveField('admission', value)}
                onSaveStyle={() => handleSaveStyleExample('admission', patient.admission)}
                styleSaved={styleSaved === 'admission'}
              />
            ) : (
              <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-6 text-center" style={{ boxShadow: 'var(--card-shadow)' }}>
                <p className="text-[var(--text-muted)] mb-3">No consult note generated yet</p>
                <button
                  onClick={() => setShowAdmissionModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white rounded-xl font-medium hover:brightness-110 active:scale-[0.97] transition-all"
                >
                  <FilePlus className="w-4 h-4" />
                  Generate Consult Note
                </button>
              </div>
            )}
          </>
        )}

        {/* Patient Education Tab */}
        {activeTab === 'education' && (
          <>
            {patient.education ? (
              <>
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <div className="flex items-center justify-between p-5">
                    <h3 className="font-semibold text-[var(--text-primary)]">Patient Education Handout</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const printWindow = window.open('', '_blank');
                          if (printWindow) {
                            printWindow.document.write(`<html><head><title>Patient Education</title><style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1a1a1a}h1,h2,h3{margin-top:1.5em}ul,ol{padding-left:1.5em}</style></head><body>${patient.education.replace(/\n/g,'<br>')}</body></html>`);
                            printWindow.document.close();
                            printWindow.print();
                          }
                        }}
                        className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                        title="Print handout"
                      >
                        <Printer className="w-4 h-4 text-[var(--text-muted)]" />
                      </button>
                      <button
                        onClick={() => copyToClipboard(patient.education, 'education')}
                        className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                        title="Copy handout"
                      >
                        {copied === 'education' ? (
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-[var(--text-muted)]" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                      {patient.education}
                    </div>
                  </div>
                </div>

                {/* Regenerate with different parameters */}
                <button
                  onClick={() => {
                    // Clear existing to show the form again
                    handleSaveField('education', '');
                  }}
                  className="w-full py-2.5 border border-dashed border-[var(--border)] text-[var(--text-muted)] rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.99] transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Generate New Handout
                </button>
              </>
            ) : (
              <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Patient Education Handout</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Topic / Diagnosis</label>
                    <input
                      type="text"
                      value={eduTopic || patient.diagnosis || ''}
                      onChange={(e) => setEduTopic(e.target.value)}
                      placeholder="e.g. Ankle sprain, Pneumonia, Laceration care..."
                      className="w-full px-3 py-2 border border-[var(--input-border)] rounded-xl text-sm bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      Instructions <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={eduInstructions}
                      onChange={(e) => setEduInstructions(e.target.value)}
                      placeholder="e.g. Emphasize ice and elevation, include return precautions for compartment syndrome, mention follow-up with ortho in 1 week..."
                      className="w-full h-20 px-3 py-2 border border-[var(--input-border)] rounded-lg text-sm resize-y bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      Language <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={eduLanguage}
                      onChange={(e) => setEduLanguage(e.target.value)}
                      placeholder="e.g. French, Spanish, Simplified Chinese..."
                      className="w-full px-3 py-2 border border-[var(--input-border)] rounded-xl text-sm bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  onClick={async () => {
                    setGeneratingEdu(true);
                    try {
                      const res = await fetch('/api/patient-education', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          rowIndex: parseInt(rowIndex),
                          sheetName,
                          patientName: patient.name,
                          topic: eduTopic || patient.diagnosis,
                          instructions: eduInstructions || undefined,
                          language: eduLanguage || undefined,
                        }),
                      });
                      if (res.ok) {
                        await fetchPatient();
                      } else {
                        const err = await res.json().catch(() => ({}));
                        alert(err.error || 'Failed to generate handout');
                      }
                    } catch {
                      alert('Failed to generate handout — check connection');
                    } finally {
                      setGeneratingEdu(false);
                    }
                  }}
                  disabled={generatingEdu || !(eduTopic?.trim() || patient.diagnosis?.trim())}
                  className="w-full py-3 bg-emerald-600 dark:bg-emerald-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-emerald-700 dark:hover:bg-emerald-600 active:scale-[0.97] transition-all"
                >
                  {generatingEdu ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating Handout...
                    </>
                  ) : (
                    <>
                      <BookOpen className="w-4 h-4" />
                      Generate Handout
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {/* Billing Section — hidden when VCH time-based is active for this day */}
        {getDayRegion(sheetName || '') !== 'vch' && (
          <BillingSection
            billingItems={billingItems}
            comments={billingComments}
            onSave={handleBillingSave}
            onSaveComments={(c) => { setBillingComments(c); handleSaveField('comments', c); }}
            showBilling={showBilling}
            setShowBilling={setShowBilling}
          />
        )}

        {/* Source Data — collapsible card */}
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] border-l-2 border-l-slate-400/40 overflow-hidden hover:shadow-lg hover:-translate-y-px transition-all duration-200" style={{ boxShadow: 'var(--card-shadow)' }}>
          <div
            className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none hover:bg-[var(--bg-tertiary)]/50 transition-colors"
            onClick={() => setSourceDataExpanded(!sourceDataExpanded)}
          >
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">Source Data</h3>
            <div className="flex items-center gap-1">
              <VoiceRecorder
                mode="encounter"
                onTranscript={(text) => {
                  const current = patient.transcript || '';
                  const updated = current ? `${current}\n\n${text}` : text;
                  handleSaveField('transcript', updated);
                }}
              />
              {sourceDataExpanded ? (
                <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </div>
          </div>

          {sourceDataExpanded && (
            <div className="border-t border-[var(--card-border)] divide-y divide-[var(--card-border)]">
              {patient.triageVitals && (
                <OutputSection
                  title="Triage Notes"
                  content={patient.triageVitals}
                  field="triageVitals"
                  expanded={expandedSections.has('triage')}
                  onToggle={() => toggleSection('triage')}
                  onCopy={() => copyToClipboard(patient.triageVitals, 'triage')}
                  copied={copied === 'triage'}
                  variant="flat"
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
                variant="flat"
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
                variant="flat"
                onSave={(value) => handleSaveField('additional', value)}
              />

              {/* Quick-add Note */}
              <div className="px-5 py-3">
                {!showQuickAdd ? (
                  <button
                    onClick={() => setShowQuickAdd(true)}
                    className="w-full py-2 border border-dashed border-[var(--border)] text-[var(--text-muted)] rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.99] transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Note
                  </button>
                ) : (
                  <div className="space-y-3 animate-slideUp">
                    <div className="relative">
                      <textarea
                        value={quickAddText}
                        onChange={(e) => setQuickAddText(e.target.value)}
                        placeholder="Add exam findings, investigation results, or clinical notes..."
                        className="w-full h-24 p-3 pr-10 border border-[var(--input-border)] rounded-xl text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
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
                        className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:brightness-110 active:scale-[0.97] transition-all"
                      >
                        {savingQuickAdd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                      </button>
                      <button
                        onClick={() => { setShowQuickAdd(false); setQuickAddText(''); }}
                        className="flex items-center gap-1.5 px-4 py-2 text-[var(--text-muted)] rounded-xl text-sm font-medium hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Referral Modal */}
      {patient && (
        <>
          <ReferralModal
            isOpen={showReferralModal}
            onClose={() => setShowReferralModal(false)}
            rowIndex={parseInt(rowIndex)}
            sheetName={sheetName}
            onGenerated={handleReferralGenerated}
          />
          <AdmissionModal
            isOpen={showAdmissionModal}
            onClose={() => setShowAdmissionModal(false)}
            rowIndex={parseInt(rowIndex)}
            sheetName={sheetName}
            onGenerated={handleAdmissionGenerated}
          />
        </>
      )}
    </div>
  );
}

// Diagnosis & ICD Codes Section
// DiagnosisSection extracted to components/DiagnosisSection.tsx

// Output Section Component with inline editing
/** Convert markdown-style links [text](url) and bare URLs to clickable <a> elements */
function renderWithLinks(text: string): React.ReactNode[] {
  if (!text) return [text];
  // Match markdown links [text](url) or bare https:// URLs
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)<>]+)/g);
  return parts.map((part, i) => {
    // Markdown link: [text](url)
    const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (mdMatch) {
      return (
        <a key={i} href={mdMatch[2]} target="_blank" rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300"
        >{mdMatch[1]}</a>
      );
    }
    // Bare URL
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300"
        >{part}</a>
      );
    }
    return part;
  });
}

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
  accentBorder,
}: {
  title: string;
  content: string;
  field: string;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  variant?: 'default' | 'muted' | 'flat';
  onSave?: (value: string) => void;
  onSaveStyle?: () => void;
  styleSaved?: boolean;
  showExamToggles?: boolean;
  interactiveEdit?: boolean;
  onRegenerate?: (updates: string) => Promise<void>;
  accentBorder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const [regenerating, setRegenerating] = useState(false);
  const [preRecordText, setPreRecordText] = useState('');

  if (!content && !editing && !onSave) return null;

  const isFlat = variant === 'flat';
  const bgClass = isFlat ? '' : variant === 'muted' ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--card-bg)]';
  const borderClass = isFlat ? 'border-none' : variant === 'muted' ? 'border-[var(--border-light)]' : 'border-[var(--card-border)]';

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
    <div className={`${bgClass} ${isFlat ? '' : 'rounded-2xl border hover:shadow-lg hover:-translate-y-px'} ${borderClass} ${accentBorder && !isFlat ? `border-l-2 ${accentBorder}` : ''} overflow-hidden transition-all duration-200`} style={{ boxShadow: isFlat || variant === 'muted' ? 'none' : 'var(--card-shadow)' }}>
      <div className={`flex items-center justify-between ${isFlat ? 'px-5 py-3' : 'p-5'} cursor-pointer`} onClick={onToggle}>
        <h3 className={`${isFlat ? 'text-sm' : ''} font-semibold text-[var(--text-primary)]`}>{title}</h3>
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
                    mode="dictation"
                    onTranscript={(text) => {
                      const base = preRecordText || editValue;
                      setEditValue(base ? `${base}\n${text}` : text);
                    }}
                    onRecordingStart={() => setPreRecordText(editValue)}
                    onInterimTranscript={(text) => {
                      setEditValue(preRecordText ? `${preRecordText}\n${text}` : text);
                    }}
                    onProcessingChange={() => {}}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:brightness-110 active:scale-[0.97] transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>
                {onRegenerate && (
                  <button
                    onClick={handleSaveAndRegenerate}
                    disabled={regenerating}
                    className="flex items-center gap-1.5 px-4 py-2 border border-[var(--border)] text-[var(--text-secondary)] rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all"
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
                  className="flex items-center gap-1.5 px-4 py-2 text-[var(--text-muted)] rounded-xl text-sm font-medium hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all"
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
              {renderWithLinks(content)}
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
  // Remove consecutive breaks (prevents blank lines when sentences are deleted)
  const cleaned: ContentPart[] = [];
  for (const p of parts) {
    if (p.type === 'break' && (cleaned.length === 0 || cleaned[cleaned.length - 1].type === 'break')) continue;
    cleaned.push(p);
  }
  // Remove trailing break
  if (cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'break') cleaned.pop();

  const lines: string[] = [];
  let cur: string[] = [];
  for (const p of cleaned) {
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

      const templates = getEffectivePromptTemplates();
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
              {renderWithLinks(part.text)}
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
