'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Plus, Pencil, RotateCcw, Loader2, X, Sun, Moon, Monitor, Search, ChevronRight, Check, Copy, Key, AlertCircle } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import {
  StyleGuide,
  fetchStyleGuide,
  persistStyleGuide,
  addExampleAsync,
  removeExampleAsync,
  getStyleGuide,
  clearLocalStyleGuide,
} from '@/lib/style-guide';
import {
  getSettings, saveSettings, AppSettings, DEFAULT_SETTINGS,
  PromptTemplates, DEFAULT_PROMPT_TEMPLATES, getPromptTemplates, savePromptTemplates,
  ParseRules, DEFAULT_PARSE_RULES, getParseRules, saveParseRules,
  EncounterType, DEFAULT_ENCOUNTER_TYPES, getEncounterTypes, saveEncounterTypes,
  getEncounterType, saveEncounterType,
  LiteratureSourcesConfig, DEFAULT_LITERATURE_SOURCES, getLiteratureSourcesConfig, saveLiteratureSourcesConfig,
} from '@/lib/settings';
import { getExamPresets, saveExamPresets, resetExamPresets, ExamPreset } from '@/lib/exam-presets';
import {
  BillingCode, BillingGroup,
  BILLING_REGIONS, BILLING_GROUPS,
  getRegion, saveRegion, isTimeBased,
  fetchBillingCodes,
  addBillingCodeAsync,
  updateBillingCodeAsync,
  deleteBillingCodeAsync,
  resetBillingCodesAsync,
  clearLocalBillingData,
} from '@/lib/billing';

type Tab = 'style' | 'settings' | 'billing' | 'prompts' | 'privacy';

export default function SettingsPage() {
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('style');
  const [styleGuide, setStyleGuide] = useState<StyleGuide | null>(null);
  const [styleLoading, setStyleLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [addingTo, setAddingTo] = useState<'hpi' | 'objective' | 'assessmentPlan' | null>(null);
  const [newExample, setNewExample] = useState('');
  const [examPresets, setExamPresets] = useState<ExamPreset[]>([]);
  const [editingPreset, setEditingPreset] = useState<number | null>(null);
  const [addingPreset, setAddingPreset] = useState(false);
  const [presetLabel, setPresetLabel] = useState('');
  const [presetText, setPresetText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Billing tab state
  const [billingRegion, setBillingRegion] = useState('yukon');
  const [billingCodes, setBillingCodes] = useState<(BillingCode & { group: BillingGroup })[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSearch, setBillingSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editFee, setEditFee] = useState('');
  const [editGroup, setEditGroup] = useState<BillingGroup>('Other');
  const [addingCode, setAddingCode] = useState(false);
  const [newBillingCode, setNewBillingCode] = useState('');
  const [newBillingDesc, setNewBillingDesc] = useState('');
  const [newBillingFee, setNewBillingFee] = useState('');
  const [newBillingGroup, setNewBillingGroup] = useState<BillingGroup>('Other');

  // Shortcut token state
  const [shortcutHasToken, setShortcutHasToken] = useState(false);
  const [shortcutToken, setShortcutToken] = useState('');
  const [shortcutLoading, setShortcutLoading] = useState(false);
  const [shortcutCopied, setShortcutCopied] = useState(false);

  // Parse rules state
  const [parseRules, setParseRules] = useState<ParseRules>(DEFAULT_PARSE_RULES);
  const [sampleInput, setSampleInput] = useState('');
  const [testResult, setTestResult] = useState<Record<string, string> | null>(null);
  const [detecting, setDetecting] = useState(false);

  // Parse format training fields
  const [formatName, setFormatName] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [fieldAge, setFieldAge] = useState('');
  const [fieldGender, setFieldGender] = useState('');
  const [fieldDob, setFieldDob] = useState('');
  const [fieldMrn, setFieldMrn] = useState('');
  const [fieldHcn, setFieldHcn] = useState('');
  const [savedFormats, setSavedFormats] = useState<any[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [savingFormat, setSavingFormat] = useState(false);

  // Privacy settings state
  const [phiProtection, setPhiProtection] = useState(false);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(true);

  // API key state
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [claudeKeyMasked, setClaudeKeyMasked] = useState<string | null>(null);
  const [openaiKeyMasked, setOpenaiKeyMasked] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);

  // Prompt templates state
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplates>(DEFAULT_PROMPT_TEMPLATES);
  const [expandedPromptSections, setExpandedPromptSections] = useState<Set<string>>(new Set());

  // Encounter types state
  const [encounterTypesList, setEncounterTypesList] = useState<EncounterType[]>(() => getEncounterTypes());
  const [activeEncounterType, setActiveEncounterType] = useState(() => getEncounterType());
  const [editingEncounterType, setEditingEncounterType] = useState<string | null>(null);
  const [addingEncounterType, setAddingEncounterType] = useState(false);
  const [newEncounterLabel, setNewEncounterLabel] = useState('');

  // Literature sources state
  const [litSources, setLitSources] = useState<LiteratureSourcesConfig>(() => getLiteratureSourcesConfig());

  // Debounce timer for guidance textarea
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load style guide from API on mount, migrate localStorage if needed
  useEffect(() => {
    (async () => {
      try {
        let guide = await fetchStyleGuide();

        // One-time migration: if localStorage has data and sheet is empty, migrate
        if (typeof window !== 'undefined') {
          const local = getStyleGuide();
          const localHasData =
            Object.values(local.examples).some(arr => arr.length > 0) ||
            local.customGuidance;
          const sheetEmpty =
            !Object.values(guide.examples).some(arr => arr.length > 0) &&
            !guide.customGuidance &&
            guide.extractedFeatures.length === 0;

          if (localHasData && sheetEmpty) {
            // Migrate: merge local data into sheet guide
            guide = {
              examples: local.examples,
              extractedFeatures: guide.extractedFeatures,
              customGuidance: local.customGuidance,
            };
            await persistStyleGuide(guide);
            clearLocalStyleGuide();
          } else if (localHasData && !sheetEmpty) {
            // Sheet already has data — just clear localStorage
            clearLocalStyleGuide();
          }
        }

        setStyleGuide(guide);
      } catch (err) {
        console.error('Failed to load style guide:', err);
        setStyleGuide({
          examples: { hpi: [], objective: [], assessmentPlan: [] },
          extractedFeatures: [],
          customGuidance: '',
        });
      } finally {
        setStyleLoading(false);
      }
    })();
    setSettings(getSettings());
    setParseRules(getParseRules());
    setPromptTemplates(getPromptTemplates());
    setExamPresets(getExamPresets());
    // Check shortcut token status
    fetch('/api/shortcuts/token')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setShortcutHasToken(data.hasToken); })
      .catch(() => {});
    // Billing — clear localStorage (sheet is source of truth) and load from API
    clearLocalBillingData();
    const r = getRegion();
    setBillingRegion(r);
    loadBillingCodes(r);
  }, []);

  const loadBillingCodes = async (region: string) => {
    setBillingLoading(true);
    try {
      const codes = await fetchBillingCodes(region);
      setBillingCodes(codes as (BillingCode & { group: BillingGroup })[]);
    } catch (err) {
      console.error('Failed to load billing codes:', err);
    } finally {
      setBillingLoading(false);
    }
  };

  const handleAddExample = async (section: 'hpi' | 'objective' | 'assessmentPlan') => {
    if (!newExample.trim() || !styleGuide) return;
    setSaving(true);
    try {
      const updated = await addExampleAsync(section, newExample.trim(), styleGuide);
      setStyleGuide(updated);
      setNewExample('');
      setAddingTo(null);

      // Fire-and-forget: extract style features from the new example
      extractFeatures(newExample.trim(), section, updated);
    } catch (err) {
      console.error('Failed to add example:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveExample = async (section: 'hpi' | 'objective' | 'assessmentPlan', index: number) => {
    if (!styleGuide) return;
    try {
      const updated = await removeExampleAsync(section, index, styleGuide);
      setStyleGuide(updated);
    } catch (err) {
      console.error('Failed to remove example:', err);
    }
  };

  const extractFeatures = async (example: string, section: string, current: StyleGuide) => {
    setExtracting(true);
    try {
      const res = await fetch('/api/extract-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          example,
          section,
          existingFeatures: current.extractedFeatures,
        }),
      });
      if (!res.ok) return;
      const { features } = await res.json();
      if (features && features.length > 0) {
        const merged = {
          ...current,
          extractedFeatures: [...current.extractedFeatures, ...features],
        };
        setStyleGuide(merged);
        await persistStyleGuide(merged);
      }
    } catch (err) {
      console.error('Failed to extract features:', err);
    } finally {
      setExtracting(false);
    }
  };

  const handleRemoveFeature = async (index: number) => {
    if (!styleGuide) return;
    const updated = {
      ...styleGuide,
      extractedFeatures: styleGuide.extractedFeatures.filter((_, i) => i !== index),
    };
    setStyleGuide(updated);
    await persistStyleGuide(updated);
  };

  const debouncedSaveGuidance = useCallback((updated: StyleGuide) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await persistStyleGuide(updated);
      } catch (err) {
        console.error('Failed to save guidance:', err);
      }
    }, 800);
  }, []);

  const debouncedSavePrompts = useCallback((updated: PromptTemplates) => {
    if (promptDebounceRef.current) clearTimeout(promptDebounceRef.current);
    promptDebounceRef.current = setTimeout(() => {
      savePromptTemplates(updated);
    }, 800);
  }, []);

  const handlePromptChange = (key: keyof PromptTemplates, value: string) => {
    const updated = { ...promptTemplates, [key]: value };
    setPromptTemplates(updated);
    debouncedSavePrompts(updated);
  };

  const handleSettingChange = (key: keyof AppSettings, value: string | number | boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // Load privacy settings
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/privacy-settings');
        if (res.ok) {
          const data = await res.json();
          setPhiProtection(data.phiProtection || false);
          setEncryptionEnabled(data.encryptionEnabled || false);
          setClaudeKeyMasked(data.claudeApiKeyMasked || null);
          setOpenaiKeyMasked(data.openaiApiKeyMasked || null);
        }
      } catch {}
      setPrivacyLoading(false);
    })();
  }, []);

  const updatePrivacySetting = async (key: string, value: boolean) => {
    try {
      await fetch('/api/privacy-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (key === 'encryptionEnabled' && value) {
        await fetch('/api/privacy-settings/encryption', { method: 'POST' });
      }
    } catch {}
  };

  const saveApiKey = async (key: 'claudeApiKey' | 'openaiApiKey', value: string) => {
    setSavingKey(true);
    try {
      await fetch('/api/privacy-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value.trim() || '' }),
      });
      // Reload to get masked key
      const res = await fetch('/api/privacy-settings');
      if (res.ok) {
        const data = await res.json();
        setClaudeKeyMasked(data.claudeApiKeyMasked || null);
        setOpenaiKeyMasked(data.openaiApiKeyMasked || null);
      }
      if (key === 'claudeApiKey') setClaudeApiKey('');
      if (key === 'openaiApiKey') setOpenaiApiKey('');
    } catch {}
    setSavingKey(false);
  };

  // Load saved parse formats from Google Sheet
  const loadFormats = async () => {
    try {
      const res = await fetch('/api/parse-formats');
      if (res.ok) {
        const data = await res.json();
        setSavedFormats(Array.isArray(data) ? data : []);
      }
    } catch {}
  };

  useEffect(() => { loadFormats(); }, []);

  const handleDetectFormat = async () => {
    if (!sampleInput.trim()) return;
    const hasFields = fieldName || fieldAge || fieldGender || fieldDob || fieldMrn || fieldHcn;
    setDetecting(true);
    setTestResult(null);
    try {
      const name = formatName.trim() || 'Custom';

      if (hasFields) {
        // User has identified fields — test AI-based parsing directly
        // The format example IS the training data; no regex needed
        const formatExample = {
          sampleText: sampleInput,
          fieldName, fieldAge, fieldGender, fieldDob, fieldMrn, fieldHcn,
        };

        // Test parse the same sample to verify it works
        const parseRes = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sampleInput, formatExample }),
        });
        if (parseRes.ok) {
          setTestResult(await parseRes.json());
        }

        // Save the format name as active parse rules
        const rules: ParseRules = {
          formatName: name,
          ageDobPattern: '',
          hcnPattern: '',
          mrnPattern: '',
          nameCleanup: '',
        };
        setParseRules(rules);
        saveParseRules(rules);
      } else {
        // No fields identified — use legacy auto-detect (regex generation)
        const detectRes = await fetch('/api/detect-format', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sampleText: sampleInput }),
        });
        if (!detectRes.ok) throw new Error('Detection failed');
        const { rules: newRules } = await detectRes.json();
        newRules.formatName = name;

        setParseRules(newRules);
        saveParseRules(newRules);

        const parseRes = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sampleInput, parseRules: newRules }),
        });
        if (parseRes.ok) {
          setTestResult(await parseRes.json());
        }
      }
    } catch (err) {
      console.error('Format detection failed:', err);
    } finally {
      setDetecting(false);
    }
  };

  const handleSaveFormat = async () => {
    const name = formatName.trim() || parseRules.formatName || 'Custom';
    setSavingFormat(true);
    try {
      await fetch('/api/parse-formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sampleText: sampleInput,
          fieldName, fieldAge, fieldGender, fieldDob, fieldMrn, fieldHcn,
          ageDobPattern: parseRules.ageDobPattern || '',
          hcnPattern: parseRules.hcnPattern || '',
          mrnPattern: parseRules.mrnPattern || '',
          nameCleanup: parseRules.nameCleanup || '',
        }),
      });
      await loadFormats();
    } catch (err) {
      console.error('Failed to save format:', err);
    } finally {
      setSavingFormat(false);
    }
  };

  const handleLoadFormat = (format: any) => {
    setFormatName(format.name);
    setSampleInput(format.sampleText || '');
    setFieldName(format.fieldName || '');
    setFieldAge(format.fieldAge || '');
    setFieldGender(format.fieldGender || '');
    setFieldDob(format.fieldDob || '');
    setFieldMrn(format.fieldMrn || '');
    setFieldHcn(format.fieldHcn || '');
    const rules: ParseRules = {
      formatName: format.name,
      ageDobPattern: format.ageDobPattern || '',
      hcnPattern: format.hcnPattern || '',
      mrnPattern: format.mrnPattern || '',
      nameCleanup: format.nameCleanup || '',
    };
    setParseRules(rules);
    saveParseRules(rules);
    setTestResult(null);
  };

  const handleDeleteFormat = async (name: string) => {
    try {
      await fetch('/api/parse-formats', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await loadFormats();
    } catch (err) {
      console.error('Failed to delete format:', err);
    }
  };

  const sectionLabels: Record<string, string> = {
    hpi: 'HPI',
    objective: 'Objective',
    assessmentPlan: 'Assessment & Plan',
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="glass-header px-4 py-4 sticky top-0 z-40">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full -ml-2"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
          <h1 className="text-lg font-semibold flex-1 text-[var(--text-primary)]">Settings</h1>
          <div className="flex items-center bg-black/5 dark:bg-white/10 rounded-lg p-0.5 gap-0.5">
            {([
              { value: 'light' as const, icon: Sun, label: 'Light' },
              { value: 'dark' as const, icon: Moon, label: 'Dark' },
              { value: 'system' as const, icon: Monitor, label: 'System' },
            ]).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                className={`p-1.5 rounded-md transition-all ${
                  mode === value
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
                title={label}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="bg-[var(--bg-primary)] border-b border-[var(--border)] sticky top-[60px] z-30">
        <div className="flex max-w-2xl mx-auto">
          {([
            { id: 'style' as const, label: 'Style Guide' },
            { id: 'settings' as const, label: 'Processing' },
            { id: 'prompts' as const, label: 'Prompts' },
            { id: 'billing' as const, label: 'Billing' },
            { id: 'privacy' as const, label: 'Privacy' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-6 animate-fadeIn">
        {/* Style Guide Tab */}
        {activeTab === 'style' && (
          <>
            {styleLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="ml-2 text-[var(--text-muted)] text-sm">Loading style guide...</span>
              </div>
            ) : styleGuide && (
              <>
                {/* Custom Guidance */}
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-2" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <h3 className="font-semibold text-[var(--text-primary)]">Charting Guidance</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Specify preferences for voice, tone, language, formatting, abbreviations, level of detail, or any other charting conventions.
                  </p>
                  <textarea
                    value={styleGuide.customGuidance || ''}
                    onChange={(e) => {
                      const updated = { ...styleGuide, customGuidance: e.target.value };
                      setStyleGuide(updated);
                      debouncedSaveGuidance(updated);
                    }}
                    placeholder="e.g. Use third-person, past tense. Keep sentences concise. Use standard medical abbreviations (pt, hx, dx). Avoid hedging language. Use bullet points for assessment & plan."
                    className="w-full h-28 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  />
                </div>

                {/* Exam Presets */}
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[var(--text-primary)]">Physical Exam Presets</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const reset = resetExamPresets();
                          setExamPresets(reset);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs font-medium transition-colors"
                        title="Reset to defaults"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setAddingPreset(true); setPresetLabel(''); setPresetText(''); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>
                  </div>

                  {examPresets.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)] italic">No presets configured</p>
                  ) : (
                    <div className="space-y-2">
                      {examPresets.map((preset, idx) => (
                        <div key={idx} className="bg-[var(--bg-tertiary)] rounded-lg p-3 relative group">
                          {editingPreset === idx ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={presetLabel}
                                onChange={(e) => setPresetLabel(e.target.value)}
                                placeholder="Label (e.g. HEENT)"
                                className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                                autoFocus
                              />
                              <textarea
                                value={presetText}
                                onChange={(e) => setPresetText(e.target.value)}
                                placeholder="Normal exam text..."
                                className="w-full h-20 p-2 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    if (!presetLabel.trim() || !presetText.trim()) return;
                                    const updated = [...examPresets];
                                    updated[idx] = { label: presetLabel.trim(), text: presetText.trim() };
                                    saveExamPresets(updated);
                                    setExamPresets(updated);
                                    setEditingPreset(null);
                                  }}
                                  disabled={!presetLabel.trim() || !presetText.trim()}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingPreset(null)}
                                  className="px-3 py-1.5 bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded-lg text-xs font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start gap-2 pr-16">
                                <span className="inline-block px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs font-semibold flex-shrink-0 mt-0.5">
                                  {preset.label}
                                </span>
                                <p className="text-sm text-[var(--text-secondary)]">{preset.text}</p>
                              </div>
                              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setEditingPreset(idx);
                                    setPresetLabel(preset.label);
                                    setPresetText(preset.text);
                                  }}
                                  className="p-1 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    const updated = examPresets.filter((_, i) => i !== idx);
                                    saveExamPresets(updated);
                                    setExamPresets(updated);
                                  }}
                                  className="p-1 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Preset Form */}
                  {addingPreset && (
                    <div className="border-t border-[var(--border)] pt-3 space-y-2">
                      <input
                        type="text"
                        value={presetLabel}
                        onChange={(e) => setPresetLabel(e.target.value)}
                        placeholder="Label (e.g. GU, Vascular)"
                        className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                        autoFocus
                      />
                      <textarea
                        value={presetText}
                        onChange={(e) => setPresetText(e.target.value)}
                        placeholder="Normal exam findings text..."
                        className="w-full h-20 p-2 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!presetLabel.trim() || !presetText.trim()) return;
                            const updated = [...examPresets, { label: presetLabel.trim(), text: presetText.trim() }];
                            saveExamPresets(updated);
                            setExamPresets(updated);
                            setAddingPreset(false);
                            setPresetLabel('');
                            setPresetText('');
                          }}
                          disabled={!presetLabel.trim() || !presetText.trim()}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          Save Preset
                        </button>
                        <button
                          onClick={() => { setAddingPreset(false); setPresetLabel(''); setPresetText(''); }}
                          className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Extracted Features as deletable chips */}
                {(styleGuide.extractedFeatures.length > 0 || extracting) && (
                  <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Style Features</h3>
                      {extracting && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {styleGuide.extractedFeatures.map((feature, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium group"
                        >
                          {feature}
                          <button
                            onClick={() => handleRemoveFeature(idx)}
                            className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800/50 rounded-full transition-colors opacity-60 group-hover:opacity-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sections */}
                {(['hpi', 'objective', 'assessmentPlan'] as const).map((section) => (
                  <div key={section} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-[var(--text-primary)]">{sectionLabels[section]} Examples</h3>
                      <button
                        onClick={() => { setAddingTo(section); setNewExample(''); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>

                    {styleGuide.examples[section].length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)] italic">No examples saved yet</p>
                    ) : (
                      styleGuide.examples[section].map((example, idx) => (
                        <div key={idx} className="bg-[var(--bg-tertiary)] rounded-lg p-3 relative group">
                          <button
                            onClick={() => handleRemoveExample(section, idx)}
                            className="absolute top-2 right-2 p-1 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap pr-8 line-clamp-4">
                            {example}
                          </p>
                        </div>
                      ))
                    )}

                    {/* Add Example Form */}
                    {addingTo === section && (
                      <div className="border-t border-[var(--border)] pt-3 space-y-2">
                        <textarea
                          value={newExample}
                          onChange={(e) => setNewExample(e.target.value)}
                          placeholder={`Paste an example ${sectionLabels[section]} section...`}
                          className="w-full h-32 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAddExample(section)}
                            disabled={!newExample.trim() || saving}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                          >
                            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Save Example
                          </button>
                          <button
                            onClick={() => setAddingTo(null)}
                            className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <>
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Model</label>
                <select
                  value={settings.model}
                  onChange={(e) => handleSettingChange('model', e.target.value)}
                  className="w-full p-3 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                >
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Max Tokens: {settings.maxTokens}
                </label>
                <input
                  type="range"
                  min="1024"
                  max="8192"
                  step="512"
                  value={settings.maxTokens}
                  onChange={(e) => handleSettingChange('maxTokens', parseInt(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-[var(--text-muted)]">
                  <span>1024</span>
                  <span>8192</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Temperature: {settings.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(e) => handleSettingChange('temperature', parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-[var(--text-muted)]">
                  <span>0 (Precise)</span>
                  <span>1 (Creative)</span>
                </div>
              </div>
            </div>

            {/* Dictation */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
              <h3 className="font-semibold text-[var(--text-primary)]">Dictation</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-primary)]">Fast Dictation</p>
                  <p className="text-xs text-[var(--text-muted)]">Skip AI medical terminology correction for faster results</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.fastDictation}
                  onClick={() => handleSettingChange('fastDictation', !settings.fastDictation)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.fastDictation ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      settings.fastDictation ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Patient Data Format */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-[var(--text-primary)]">Patient Data Format</h3>
                  <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                    {parseRules.formatName || 'Custom'}
                  </span>
                </div>
                {/* Format dropdown */}
                <select
                  value={parseRules.formatName || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'Meditech') {
                      setParseRules(DEFAULT_PARSE_RULES);
                      saveParseRules(DEFAULT_PARSE_RULES);
                      setFormatName('Meditech');
                      setSampleInput(''); setFieldName(''); setFieldAge(''); setFieldGender('');
                      setFieldDob(''); setFieldMrn(''); setFieldHcn('');
                      setTestResult(null);
                    } else {
                      const f = savedFormats.find((f: any) => f.name === val);
                      if (f) handleLoadFormat(f);
                    }
                  }}
                  className="px-2 py-1 border border-[var(--input-border)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select format...</option>
                  <option value="Meditech">Meditech (built-in)</option>
                  {savedFormats.filter((f: any) => f.name !== 'Meditech').map((f: any) => (
                    <option key={f.name} value={f.name}>{f.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Paste sample patient data from your EMR on the left, then identify each field on the right. AI will learn the pattern.
              </p>

              {/* Format name */}
              <input
                type="text"
                value={formatName}
                onChange={(e) => setFormatName(e.target.value)}
                placeholder="Format name (e.g. Meditech, EPIC, Cerner)..."
                className="w-full p-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-[var(--text-muted)]"
              />

              {/* Side-by-side: paste area + field identification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Left: paste EMR data */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">EMR Sample Data</label>
                  <textarea
                    value={sampleInput}
                    onChange={(e) => setSampleInput(e.target.value)}
                    placeholder="Paste sample patient data from your EMR here..."
                    className="w-full h-48 p-3 border border-[var(--input-border)] rounded-lg text-xs font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  />
                </div>

                {/* Right: identify fields */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[var(--text-muted)]">Identify Fields</label>
                  <p className="text-[10px] text-[var(--text-muted)]">Type the exact values as they appear in the pasted text.</p>
                  {[
                    { label: 'Name', value: fieldName, setter: setFieldName, placeholder: 'e.g. SMITH, John' },
                    { label: 'Age', value: fieldAge, setter: setFieldAge, placeholder: 'e.g. 45' },
                    { label: 'Gender', value: fieldGender, setter: setFieldGender, placeholder: 'e.g. M or F' },
                    { label: 'DOB', value: fieldDob, setter: setFieldDob, placeholder: 'e.g. 01/15/1981' },
                    { label: 'MRN', value: fieldMrn, setter: setFieldMrn, placeholder: 'e.g. A12345' },
                    { label: 'HCN', value: fieldHcn, setter: setFieldHcn, placeholder: 'e.g. 9876543210' },
                  ].map(({ label, value, setter, placeholder }) => (
                    <div key={label} className="flex items-center gap-2">
                      <label className="w-10 text-xs font-medium text-[var(--text-secondary)] text-right flex-shrink-0">{label}</label>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        placeholder={placeholder}
                        className="flex-1 p-1.5 border border-[var(--input-border)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-[var(--text-muted)]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleDetectFormat}
                  disabled={detecting || !sampleInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-2"
                >
                  {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {detecting ? 'Testing...' : 'Test Format'}
                </button>
                <button
                  onClick={handleSaveFormat}
                  disabled={savingFormat || !parseRules.ageDobPattern}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-2"
                >
                  {savingFormat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Format
                </button>
                <button
                  onClick={() => {
                    setParseRules(DEFAULT_PARSE_RULES);
                    saveParseRules(DEFAULT_PARSE_RULES);
                    setTestResult(null);
                    setFormatName('');
                    setFieldName(''); setFieldAge(''); setFieldGender(''); setFieldDob(''); setFieldMrn(''); setFieldHcn('');
                    setSampleInput('');
                  }}
                  className="px-3 py-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>

              {/* Parse result */}
              {testResult && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 animate-fadeIn">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium mb-2 text-sm">
                    <Check className="w-4 h-4" />
                    Parse Result
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    <div><span className="text-[var(--text-muted)]">Name:</span> <span className="text-[var(--text-primary)]">{testResult.name || '—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">Age:</span> <span className="text-[var(--text-primary)]">{testResult.age || '—'} {testResult.gender || ''}</span></div>
                    <div><span className="text-[var(--text-muted)]">DOB:</span> <span className="text-[var(--text-primary)]">{testResult.birthday || '—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">HCN:</span> <span className="text-[var(--text-primary)]">{testResult.hcn || '—'}</span></div>
                    <div><span className="text-[var(--text-muted)]">MRN:</span> <span className="text-[var(--text-primary)]">{testResult.mrn || '—'}</span></div>
                  </div>
                </div>
              )}

              {/* Saved formats list */}
              {savedFormats.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Saved Formats</label>
                  <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
                    {savedFormats.map((f: any) => (
                      <div key={f.name} className="flex items-center justify-between px-3 py-2">
                        <button
                          onClick={() => handleLoadFormat(f)}
                          className={`text-sm font-medium ${
                            parseRules.formatName === f.name
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-[var(--text-primary)] hover:text-blue-600'
                          }`}
                        >
                          {f.name}
                        </button>
                        <button
                          onClick={() => handleDeleteFormat(f.name)}
                          className="p-1 text-[var(--text-muted)] hover:text-red-500 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* API Token (used by Watch app) */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-[var(--text-secondary)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">API Token</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Token for Watch app and external integrations.
              </p>

              <div className="space-y-3">
                {shortcutToken ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        Copy this token now — it won&apos;t be shown again
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2.5 bg-[var(--bg-tertiary)] rounded-lg text-xs font-mono text-[var(--text-primary)] break-all select-all">
                        {shortcutToken}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(shortcutToken);
                          setShortcutCopied(true);
                          setTimeout(() => setShortcutCopied(false), 2000);
                        }}
                        className="p-2 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg flex-shrink-0"
                      >
                        {shortcutCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : shortcutHasToken ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm text-green-700 dark:text-green-400 font-medium">Token active</span>
                    </div>
                    <button
                      onClick={async () => {
                        setShortcutLoading(true);
                        try {
                          await fetch('/api/shortcuts/token', { method: 'DELETE' });
                          setShortcutHasToken(false);
                          setShortcutToken('');
                        } catch {} finally {
                          setShortcutLoading(false);
                        }
                      }}
                      disabled={shortcutLoading}
                      className="px-3 py-1.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                ) : null}

                <button
                  onClick={async () => {
                    setShortcutLoading(true);
                    setShortcutToken('');
                    try {
                      const res = await fetch('/api/shortcuts/token', { method: 'POST' });
                      if (res.ok) {
                        const { token } = await res.json();
                        setShortcutToken(token);
                        setShortcutHasToken(true);
                      }
                    } catch {} finally {
                      setShortcutLoading(false);
                    }
                  }}
                  disabled={shortcutLoading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {shortcutLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Key className="w-4 h-4" />
                  )}
                  {shortcutHasToken ? 'Regenerate Token' : 'Generate Token'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Prompts Tab */}
        {activeTab === 'prompts' && (
          <>
            {/* Encounter Types */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Encounter Types</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Each type has its own section instruction overrides. Select the active type from the dashboard header.</p>
                </div>
                <button
                  onClick={() => {
                    setEncounterTypesList(DEFAULT_ENCOUNTER_TYPES);
                    saveEncounterTypes(DEFAULT_ENCOUNTER_TYPES);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>

              {/* List of encounter types */}
              <div className="space-y-2">
                {encounterTypesList.map(et => {
                  const isEditing = editingEncounterType === et.id;
                  const isActive = activeEncounterType === et.id;
                  const overrideCount = Object.keys(et.prompts).length;
                  const isDefault = DEFAULT_ENCOUNTER_TYPES.some(d => d.id === et.id);

                  return (
                    <div key={et.id} className="border border-[var(--border)] rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setActiveEncounterType(et.id);
                              saveEncounterType(et.id);
                            }}
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-blue-500' : 'bg-[var(--border)]'}`}
                            title={isActive ? 'Active' : 'Click to activate'}
                          />
                          <span className="text-sm font-medium text-[var(--text-primary)]">{et.label}</span>
                          {overrideCount > 0 && (
                            <span className="text-[10px] text-[var(--text-muted)]">{overrideCount} override{overrideCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingEncounterType(isEditing ? null : et.id)}
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {!isDefault && (
                            <button
                              onClick={() => {
                                const updated = encounterTypesList.filter(t => t.id !== et.id);
                                setEncounterTypesList(updated);
                                saveEncounterTypes(updated);
                                if (activeEncounterType === et.id) {
                                  setActiveEncounterType('er');
                                  saveEncounterType('er');
                                }
                              }}
                              className="p-1 text-[var(--text-muted)] hover:text-red-500 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded edit panel */}
                      {isEditing && (
                        <div className="border-t border-[var(--border)] px-3 py-3 space-y-3 bg-[var(--bg-tertiary)]">
                          <p className="text-xs text-[var(--text-muted)]">
                            Override section instructions for &quot;{et.label}&quot;. Leave blank to use the default prompt.
                          </p>
                          {([
                            { key: 'generalRules', label: 'General Rules' },
                            { key: 'hpi', label: 'HPI' },
                            { key: 'objective', label: 'Objective' },
                            { key: 'assessmentPlan', label: 'Assessment & Plan' },
                            { key: 'ddx', label: 'DDx' },
                            { key: 'investigations', label: 'Investigations' },
                            { key: 'management', label: 'Management' },
                            { key: 'evidence', label: 'Evidence' },
                            { key: 'diagnosis', label: 'Diagnosis' },
                          ] as { key: keyof PromptTemplates; label: string }[]).map(({ key, label }) => {
                            const hasOverride = key in et.prompts;
                            return (
                              <div key={key}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <label className="text-xs font-medium text-[var(--text-secondary)]">{label}</label>
                                  {hasOverride && (
                                    <button
                                      onClick={() => {
                                        const updated = encounterTypesList.map(t => {
                                          if (t.id !== et.id) return t;
                                          const newPrompts = { ...t.prompts };
                                          delete newPrompts[key];
                                          return { ...t, prompts: newPrompts };
                                        });
                                        setEncounterTypesList(updated);
                                        saveEncounterTypes(updated);
                                      }}
                                      className="text-[10px] text-red-500 hover:text-red-400"
                                    >
                                      Clear override
                                    </button>
                                  )}
                                </div>
                                <textarea
                                  value={(et.prompts[key] as string) || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = encounterTypesList.map(t => {
                                      if (t.id !== et.id) return t;
                                      const newPrompts = { ...t.prompts };
                                      if (val.trim()) {
                                        newPrompts[key] = val;
                                      } else {
                                        delete newPrompts[key];
                                      }
                                      return { ...t, prompts: newPrompts };
                                    });
                                    setEncounterTypesList(updated);
                                    saveEncounterTypes(updated);
                                  }}
                                  placeholder={`Default: ${DEFAULT_PROMPT_TEMPLATES[key].substring(0, 80)}...`}
                                  className="w-full h-20 p-2 border border-[var(--input-border)] rounded-lg text-xs resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono leading-relaxed"
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add new encounter type */}
              {addingEncounterType ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newEncounterLabel}
                    onChange={(e) => setNewEncounterLabel(e.target.value)}
                    placeholder="Encounter type name..."
                    className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newEncounterLabel.trim()) {
                        const id = newEncounterLabel.trim().toLowerCase().replace(/\s+/g, '-');
                        if (encounterTypesList.some(t => t.id === id)) return;
                        const updated = [...encounterTypesList, { id, label: newEncounterLabel.trim(), prompts: {} }];
                        setEncounterTypesList(updated);
                        saveEncounterTypes(updated);
                        setNewEncounterLabel('');
                        setAddingEncounterType(false);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!newEncounterLabel.trim()) return;
                      const id = newEncounterLabel.trim().toLowerCase().replace(/\s+/g, '-');
                      if (encounterTypesList.some(t => t.id === id)) return;
                      const updated = [...encounterTypesList, { id, label: newEncounterLabel.trim(), prompts: {} }];
                      setEncounterTypesList(updated);
                      saveEncounterTypes(updated);
                      setNewEncounterLabel('');
                      setAddingEncounterType(false);
                    }}
                    disabled={!newEncounterLabel.trim()}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setAddingEncounterType(false); setNewEncounterLabel(''); }}
                    className="px-3 py-2 bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingEncounterType(true)}
                  className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add encounter type
                </button>
              )}
            </div>

            {/* Reset All */}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setPromptTemplates(DEFAULT_PROMPT_TEMPLATES);
                  savePromptTemplates(DEFAULT_PROMPT_TEMPLATES);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs font-medium transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset All to Defaults
              </button>
            </div>

            {/* General Rules */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-2" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[var(--text-primary)]">General Rules</h3>
                <button
                  onClick={() => handlePromptChange('generalRules', DEFAULT_PROMPT_TEMPLATES.generalRules)}
                  className="flex items-center gap-1 px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Overall behavior rules applied to every generated note.
              </p>
              <textarea
                value={promptTemplates.generalRules}
                onChange={(e) => handlePromptChange('generalRules', e.target.value)}
                className="w-full h-40 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono text-xs leading-relaxed"
              />
            </div>

            {/* Inline Edit Instructions */}
            <h3 className="font-semibold text-[var(--text-primary)] text-sm">Inline Edit Instructions</h3>
            <p className="text-xs text-[var(--text-muted)] -mt-4">Customize how &quot;Add Detail&quot; and &quot;Shorten&quot; behave when editing sentences in the encounter note.</p>
            {([
              { key: 'editExpand' as const, label: 'Add Detail' },
              { key: 'editShorten' as const, label: 'Shorten' },
            ]).map(({ key, label }) => {
              const isExpanded = expandedPromptSections.has(key);
              return (
                <div key={key} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <button
                    onClick={() => {
                      const next = new Set(expandedPromptSections);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      setExpandedPromptSections(next);
                    }}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <h4 className="font-medium text-sm text-[var(--text-primary)]">{label}</h4>
                    </div>
                    {promptTemplates[key] !== DEFAULT_PROMPT_TEMPLATES[key] && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Modified</span>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-[var(--border)] px-5 py-4 space-y-2">
                      <textarea
                        value={promptTemplates[key]}
                        onChange={(e) => handlePromptChange(key, e.target.value)}
                        className="w-full h-32 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] font-mono text-xs leading-relaxed"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => handlePromptChange(key, DEFAULT_PROMPT_TEMPLATES[key])}
                          className="flex items-center gap-1 px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset to Default
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Literature Sources */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Literature Sources</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Narrow the scope of sources used for investigations, management, and evidence sections.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                  <span className="text-xs text-[var(--text-muted)]">{litSources.enabled ? 'On' : 'Off'}</span>
                  <input
                    type="checkbox"
                    checked={litSources.enabled}
                    onChange={(e) => {
                      const updated = { ...litSources, enabled: e.target.checked };
                      setLitSources(updated);
                      saveLiteratureSourcesConfig(updated);
                    }}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 accent-teal-600"
                  />
                </label>
              </div>

              {litSources.enabled && (
                <div className="space-y-3">
                  {encounterTypesList.map(et => {
                    const sources = litSources.sources[et.id] || DEFAULT_LITERATURE_SOURCES[et.id] || '';
                    return (
                      <div key={et.id}>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{et.label}</label>
                        <textarea
                          value={sources}
                          onChange={(e) => {
                            const updated = {
                              ...litSources,
                              sources: { ...litSources.sources, [et.id]: e.target.value },
                            };
                            setLitSources(updated);
                            saveLiteratureSourcesConfig(updated);
                          }}
                          placeholder="e.g. UpToDate, NEJM, BMJ..."
                          className="w-full h-16 p-2 border border-[var(--input-border)] rounded-lg text-xs resize-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                      </div>
                    );
                  })}
                  <button
                    onClick={() => {
                      const updated = { ...litSources, sources: { ...DEFAULT_LITERATURE_SOURCES } };
                      setLitSources(updated);
                      saveLiteratureSourcesConfig(updated);
                    }}
                    className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>

            {/* Section Instructions */}
            <h3 className="font-semibold text-[var(--text-primary)] text-sm">Section Instructions</h3>
            {([
              { key: 'ddx' as const, label: 'DDx (Differential Diagnosis)' },
              { key: 'investigations' as const, label: 'Investigations' },
              { key: 'management' as const, label: 'Management' },
              { key: 'evidence' as const, label: 'Evidence' },
              { key: 'hpi' as const, label: 'HPI' },
              { key: 'objective' as const, label: 'Objective' },
              { key: 'assessmentPlan' as const, label: 'Assessment & Plan' },
              { key: 'diagnosis' as const, label: 'Diagnosis' },
            ]).map(({ key, label }) => {
              const isExpanded = expandedPromptSections.has(key);
              return (
                <div key={key} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <button
                    onClick={() => {
                      const next = new Set(expandedPromptSections);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      setExpandedPromptSections(next);
                    }}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <h4 className="font-medium text-sm text-[var(--text-primary)]">{label}</h4>
                    </div>
                    {promptTemplates[key] !== DEFAULT_PROMPT_TEMPLATES[key] && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Modified</span>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-[var(--border)] px-5 py-4 space-y-2">
                      <textarea
                        value={promptTemplates[key]}
                        onChange={(e) => handlePromptChange(key, e.target.value)}
                        className="w-full h-32 p-3 border border-[var(--input-border)] rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] font-mono text-xs leading-relaxed"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => handlePromptChange(key, DEFAULT_PROMPT_TEMPLATES[key])}
                          className="flex items-center gap-1 px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset to Default
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <>
            {/* Region selector */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[var(--text-primary)]">Fee Region</h3>
                {!isTimeBased(billingRegion) && (
                  <button
                    onClick={async () => {
                      setBillingLoading(true);
                      try {
                        const codes = await resetBillingCodesAsync(billingRegion);
                        setBillingCodes(codes as (BillingCode & { group: BillingGroup })[]);
                      } catch (err) {
                        console.error('Failed to reset billing codes:', err);
                      } finally {
                        setBillingLoading(false);
                      }
                    }}
                    disabled={billingLoading}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    title="Reset all billing codes to defaults"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${billingLoading ? 'animate-spin' : ''}`} />
                    Reset
                  </button>
                )}
              </div>
              <select
                value={billingRegion}
                onChange={async (e) => {
                  const r = e.target.value;
                  setBillingRegion(r);
                  saveRegion(r);
                  if (!isTimeBased(r)) {
                    await loadBillingCodes(r);
                  }
                }}
                className="w-full p-3 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
              >
                {BILLING_REGIONS.map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* VCH Configuration */}
            {isTimeBased(billingRegion) && (
              <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
                <h3 className="font-semibold text-[var(--text-primary)]">VCH Configuration</h3>
                <div className="space-y-3">
                  {([
                    { key: 'vchCprpId' as const, label: 'CPRP ID', placeholder: 'e.g. 12345' },
                    { key: 'vchSiteFacility' as const, label: 'Site / Facility', placeholder: 'e.g. Vancouver General Hospital' },
                    { key: 'vchPracNumber' as const, label: 'PRAC #', placeholder: 'e.g. 67890' },
                    { key: 'vchPractitionerName' as const, label: 'Practitioner Name', placeholder: 'e.g. Dr. Jane Smith' },
                  ]).map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">{label}</label>
                      <input
                        type="text"
                        value={settings[key] || ''}
                        onChange={(e) => handleSettingChange(key, e.target.value)}
                        placeholder={placeholder}
                        className="w-full p-3 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search + Add (Yukon only) */}
            {!isTimeBased(billingRegion) && (<>
            {/* Search + Add */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={billingSearch}
                  onChange={(e) => setBillingSearch(e.target.value)}
                  placeholder="Search codes..."
                  className="w-full pl-9 pr-8 py-2.5 border border-[var(--input-border)] rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                {billingSearch && (
                  <button
                    onClick={() => setBillingSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setAddingCode(true);
                  setNewBillingCode('');
                  setNewBillingDesc('');
                  setNewBillingFee('');
                  setNewBillingGroup('Other');
                }}
                className="flex items-center gap-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            {/* Add Custom Code Form */}
            {addingCode && (
              <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-4 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Add Custom Code</h4>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newBillingCode}
                    onChange={(e) => setNewBillingCode(e.target.value)}
                    placeholder="Code"
                    className="p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={newBillingDesc}
                    onChange={(e) => setNewBillingDesc(e.target.value)}
                    placeholder="Description"
                    className="col-span-2 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBillingFee}
                    onChange={(e) => setNewBillingFee(e.target.value)}
                    placeholder="Fee (e.g. 50.00)"
                    className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                  />
                  <select
                    value={newBillingGroup}
                    onChange={(e) => setNewBillingGroup(e.target.value as BillingGroup)}
                    className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                  >
                    {BILLING_GROUPS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!newBillingCode.trim() || !newBillingDesc.trim()) return;
                      try {
                        await addBillingCodeAsync(
                          newBillingCode.trim(),
                          newBillingDesc.trim(),
                          newBillingFee.trim(),
                          newBillingGroup
                        );
                        await loadBillingCodes(billingRegion);
                        setAddingCode(false);
                      } catch (err) {
                        console.error('Failed to add billing code:', err);
                      }
                    }}
                    disabled={!newBillingCode.trim() || !newBillingDesc.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setAddingCode(false)}
                    className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Loading spinner */}
            {billingLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="ml-2 text-[var(--text-muted)] text-sm">Loading billing codes...</span>
              </div>
            )}

            {/* Grouped code list */}
            {!billingLoading && (() => {
              const query = billingSearch.toLowerCase().trim();
              const filtered = query
                ? billingCodes.filter(c =>
                    c.code.toLowerCase().includes(query) ||
                    c.description.toLowerCase().includes(query)
                  )
                : billingCodes;

              // Derive groups from the data; use canonical order when possible
              const dataGroups = new Set(billingCodes.map(c => c.group));
              const groups = BILLING_GROUPS.filter(g => dataGroups.has(g));
              // Add any non-standard groups that might be in the data
              Array.from(dataGroups).forEach(g => {
                if (!groups.includes(g as BillingGroup)) groups.push(g as BillingGroup);
              });
              // When searching, auto-expand all groups
              const effectiveExpanded = query ? new Set(groups) : expandedGroups;

              return groups.map(group => {
                const groupCodes = filtered.filter(c => c.group === group);
                if (groupCodes.length === 0) return null;
                const isExpanded = effectiveExpanded.has(group);

                return (
                  <div key={group} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden" style={{ boxShadow: 'var(--card-shadow)' }}>
                    <button
                      onClick={() => {
                        const next = new Set(expandedGroups);
                        if (next.has(group)) next.delete(group);
                        else next.add(group);
                        setExpandedGroups(next);
                      }}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        <h3 className="font-semibold text-sm text-[var(--text-primary)]">{group}</h3>
                        <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
                          {groupCodes.length}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                        {groupCodes.map(item => (
                          <div key={item.code} className="px-5 py-2.5 group">
                            {editingCode === item.code ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs font-mono font-semibold flex-shrink-0">
                                    {item.code}
                                  </span>
                                  <input
                                    type="text"
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    className="flex-1 p-1.5 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                                    autoFocus
                                  />
                                  <input
                                    type="text"
                                    value={editFee}
                                    onChange={(e) => setEditFee(e.target.value)}
                                    placeholder="Fee"
                                    className="w-24 p-1.5 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                                  />
                                </div>
                                <div className="flex gap-2 items-center">
                                  <select
                                    value={editGroup}
                                    onChange={(e) => setEditGroup(e.target.value as BillingGroup)}
                                    className="p-1.5 border border-[var(--input-border)] rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)]"
                                  >
                                    {BILLING_GROUPS.map(g => (
                                      <option key={g} value={g}>{g}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await updateBillingCodeAsync(
                                          item.code,
                                          editDesc.trim(),
                                          editFee.trim(),
                                          editGroup
                                        );
                                        await loadBillingCodes(billingRegion);
                                        setEditingCode(null);
                                      } catch (err) {
                                        console.error('Failed to update billing code:', err);
                                      }
                                    }}
                                    className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingCode(null)}
                                    className="px-3 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg text-xs font-medium"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="px-2 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded text-xs font-mono font-semibold flex-shrink-0">
                                    {item.code}
                                  </span>
                                  <span className="text-sm text-[var(--text-primary)] truncate">{item.description}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {item.fee && (
                                    <span className="text-sm text-[var(--text-secondary)] font-medium">${item.fee}</span>
                                  )}
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => {
                                        setEditingCode(item.code);
                                        setEditDesc(item.description);
                                        setEditFee(item.fee);
                                        setEditGroup(item.group);
                                      }}
                                      className="p-1 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={async () => {
                                        try {
                                          await deleteBillingCodeAsync(item.code);
                                          await loadBillingCodes(billingRegion);
                                        } catch (err) {
                                          console.error('Failed to delete billing code:', err);
                                        }
                                      }}
                                      className="p-1 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
            </>)}
          </>
        )}
        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <>
            {privacyLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : (
              <>
                {/* API Keys */}
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">API Keys</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Add your API keys to use AI features (note generation, transcription, clinical questions).
                    </p>
                  </div>

                  {/* Claude API Key */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-secondary)]">Claude API Key (Anthropic)</label>
                    {claudeKeyMasked ? (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 p-2 bg-[var(--bg-tertiary)] rounded-lg text-xs font-mono text-[var(--text-muted)]">
                          {claudeKeyMasked}
                        </code>
                        <button
                          onClick={() => saveApiKey('claudeApiKey', '')}
                          disabled={savingKey}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={claudeApiKey}
                          onChange={(e) => setClaudeApiKey(e.target.value)}
                          placeholder="sk-ant-..."
                          className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                        />
                        <button
                          onClick={() => saveApiKey('claudeApiKey', claudeApiKey)}
                          disabled={savingKey || !claudeApiKey.trim()}
                          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>

                  {/* OpenAI API Key */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--text-secondary)]">OpenAI API Key (Whisper transcription)</label>
                    {openaiKeyMasked ? (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 p-2 bg-[var(--bg-tertiary)] rounded-lg text-xs font-mono text-[var(--text-muted)]">
                          {openaiKeyMasked}
                        </code>
                        <button
                          onClick={() => saveApiKey('openaiApiKey', '')}
                          disabled={savingKey}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={openaiApiKey}
                          onChange={(e) => setOpenaiApiKey(e.target.value)}
                          placeholder="sk-..."
                          className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                        />
                        <button
                          onClick={() => saveApiKey('openaiApiKey', openaiApiKey)}
                          disabled={savingKey || !openaiApiKey.trim()}
                          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-[var(--text-muted)]">
                    Keys are stored securely server-side and never exposed to the browser. Both keys are required for full functionality.
                  </p>
                </div>

                {/* PHI Protection */}
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{
                      background: phiProtection ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
                      border: `1px solid ${phiProtection ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    }}
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={phiProtection}
                        onChange={(e) => {
                          setPhiProtection(e.target.checked);
                          updatePrivacySetting('phiProtection', e.target.checked);
                        }}
                        className="rounded w-4 h-4 flex-shrink-0"
                      />
                      <div>
                        <span className="text-sm font-medium block text-[var(--text-primary)]">
                          De-identify data before sending to AI
                        </span>
                        <span className="text-[11px] block mt-0.5 text-[var(--text-muted)]">
                          Strips patient names, MRN, HCN, and DOB from prompts sent to Claude. The AI receives only clinical data (age, gender, diagnoses, labs, vitals, medications). Identifying info is restored in the response automatically.
                        </span>
                      </div>
                    </label>
                  </div>
                  <div className="text-[10px] space-y-1 text-[var(--text-muted)]">
                    <p><strong>What gets stripped:</strong> Patient name, MRN, HCN, DOB, and these values wherever they appear in document text.</p>
                    <p><strong>What stays:</strong> Age, gender, all clinical data (labs, vitals, medications, diagnoses, exam findings, imaging).</p>
                    <p><strong>Quality impact:</strong> None. Clinical reasoning does not depend on patient identity. Names are restored in the generated output.</p>
                  </div>
                </div>

                {/* Encryption */}
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{
                      background: encryptionEnabled ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
                      border: `1px solid ${encryptionEnabled ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    }}
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={encryptionEnabled}
                        onChange={(e) => {
                          setEncryptionEnabled(e.target.checked);
                          updatePrivacySetting('encryptionEnabled', e.target.checked);
                        }}
                        className="rounded w-4 h-4 flex-shrink-0"
                      />
                      <div>
                        <span className="text-sm font-medium block text-[var(--text-primary)]">
                          Encrypt patient data at rest (HIPAA)
                        </span>
                        <span className="text-[11px] block mt-0.5 text-[var(--text-muted)]">
                          All patient data written to Google Sheets will be encrypted with AES-256-GCM. Data is encrypted before leaving the server and decrypted on read. The encryption key is stored securely in the server database.
                        </span>
                      </div>
                    </label>
                  </div>
                  <div className="text-[10px] space-y-1 text-[var(--text-muted)]">
                    <p><strong>What gets encrypted:</strong> All patient fields in Google Sheets — demographics, clinical notes, generated output, billing data.</p>
                    <p><strong>What stays readable:</strong> Sheet tab names and column headers (structural data only, no PHI).</p>
                    <p><strong>Backward compatible:</strong> Unencrypted data (written before enabling) is still readable. New writes will be encrypted.</p>
                    <p><strong>Warning:</strong> If you lose access to your account, encrypted data cannot be recovered. The encryption key is tied to your user account.</p>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
