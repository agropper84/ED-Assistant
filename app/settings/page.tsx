'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Plus, Pencil, RotateCcw, Loader2, X, Sun, Moon, Monitor, Search, ChevronRight, Check, Copy, Key, AlertCircle, Brain, Sparkles } from 'lucide-react';
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
  getSettings, saveSettings, AppSettings, NamedTemplate, DEFAULT_SETTINGS, DEFAULT_NOTE_STYLE_STANDARD, DEFAULT_NOTE_STYLE_DETAILED, DEFAULT_NOTE_STYLE_COMPLETE_EXAM, DEFAULT_REFERRAL_INSTRUCTIONS, DEFAULT_ADMISSION_INSTRUCTIONS,
  PromptTemplates, DEFAULT_PROMPT_TEMPLATES, getPromptTemplates, savePromptTemplates,
  ParseRules, DEFAULT_PARSE_RULES, getParseRules, saveParseRules,
  EncounterType, DEFAULT_ENCOUNTER_TYPES, getEncounterTypes, saveEncounterTypes,
  getEncounterType, saveEncounterType,
  LiteratureSourcesConfig, DEFAULT_LITERATURE_SOURCES, getLiteratureSourcesConfig, saveLiteratureSourcesConfig,
  EducationConfig, getEducationConfig, saveEducationConfig,
  getAutoAnalysis, saveAutoAnalysis,
  SpeechAPI, getSpeechAPI, saveSpeechAPI,
  TranscribeAPI, getTranscribeAPI, saveTranscribeAPI,
  getTranscribeWebAPI, saveTranscribeWebAPI,
  getTranscribeWatchAPI, saveTranscribeWatchAPI,
  MedicalizeDictationMode, getMedicalizeDictationMode, saveMedicalizeDictationMode,
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

type Tab = 'style' | 'settings' | 'billing' | 'prompts' | 'privacy' | 'keys';

/** PIN setup/change/remove component */
function PinSetup() {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'idle' | 'enter' | 'confirm'>('idle');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (pin !== confirmPin) { setStatus('PINs do not match'); return; }
    if (!/^\d{4}$/.test(pin)) { setStatus('PIN must be 4 digits'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/pin-set', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) { setStatus('PIN saved'); setStep('idle'); setPin(''); setConfirmPin(''); }
      else { const d = await res.json(); setStatus(d.error || 'Failed'); }
    } catch { setStatus('Error'); }
    finally { setLoading(false); }
  };

  const handleRemove = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/pin-set', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove' }),
      });
      setStatus('PIN removed');
    } catch { setStatus('Error'); }
    finally { setLoading(false); }
  };

  if (step === 'idle') {
    return (
      <div className="flex items-center gap-2">
        <button onClick={() => setStep('enter')} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Set PIN
        </button>
        <button onClick={handleRemove} disabled={loading} className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
          Remove PIN
        </button>
        {status && <span className="text-[10px] text-emerald-500">{status}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="tel" inputMode="numeric" maxLength={4} value={step === 'enter' ? pin : confirmPin}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
          if (step === 'enter') { setPin(v); if (v.length === 4) setStep('confirm'); }
          else setConfirmPin(v);
        }}
        placeholder={step === 'enter' ? 'Enter 4-digit PIN' : 'Confirm PIN'}
        autoFocus
        className="w-32 px-3 py-2 text-center text-lg font-mono tracking-[0.3em] border border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
      <div className="flex gap-2">
        {step === 'confirm' && (
          <button onClick={handleSave} disabled={confirmPin.length !== 4 || loading} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg disabled:opacity-40">
            {loading ? 'Saving...' : 'Save PIN'}
          </button>
        )}
        <button onClick={() => { setStep('idle'); setPin(''); setConfirmPin(''); setStatus(''); }} className="px-3 py-1.5 text-xs text-[var(--text-muted)]">
          Cancel
        </button>
      </div>
      {status && <span className="text-[10px] text-red-500">{status}</span>}
    </div>
  );
}

/** TOTP setup component */
function TotpSetup() {
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'setup' | 'verify'>('idle');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    setLoading(true); setStatus('');
    try {
      const res = await fetch('/api/auth/totp-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup' }),
      });
      if (res.ok) {
        const data = await res.json();
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setStep('verify');
      } else { setStatus('Setup failed'); }
    } catch { setStatus('Error'); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(code)) { setStatus('Enter 6-digit code'); return; }
    setLoading(true); setStatus('');
    try {
      const res = await fetch('/api/auth/totp-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) { setStatus('2FA enabled'); setStep('idle'); setQrCode(''); setSecret(''); setCode(''); }
      else { const d = await res.json(); setStatus(d.error || 'Invalid code'); setCode(''); }
    } catch { setStatus('Error'); }
    finally { setLoading(false); }
  };

  const handleDisable = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/totp-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable' }),
      });
      setStatus('2FA disabled');
    } catch { setStatus('Error'); }
    finally { setLoading(false); }
  };

  if (step === 'idle') {
    return (
      <div className="flex items-center gap-2">
        <button onClick={handleSetup} disabled={loading} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          {loading ? 'Setting up...' : 'Enable 2FA'}
        </button>
        <button onClick={handleDisable} disabled={loading} className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
          Disable 2FA
        </button>
        {status && <span className="text-[10px] text-emerald-500">{status}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {qrCode && (
        <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-xl">
          <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48" />
        </div>
      )}
      {secret && (
        <div className="text-[10px] text-[var(--text-muted)]">
          Manual entry: <code className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)] select-all">{secret}</code>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="tel" inputMode="numeric" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6-digit code"
          autoFocus
          className="w-32 px-3 py-2 text-center text-lg font-mono tracking-[0.3em] border border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <button onClick={handleVerify} disabled={code.length !== 6 || loading} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg disabled:opacity-40">
          Verify
        </button>
        <button onClick={() => { setStep('idle'); setStatus(''); }} className="px-3 py-1.5 text-xs text-[var(--text-muted)]">
          Cancel
        </button>
      </div>
      {status && <span className="text-[10px] text-red-500">{status}</span>}
    </div>
  );
}

function TemplateManager({ label, templates, defaultInstructions, onChange }: {
  label: string;
  templates: NamedTemplate[];
  defaultInstructions: string;
  onChange: (templates: NamedTemplate[]) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editInstructions, setEditInstructions] = useState('');

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditName(templates[idx].name);
    setEditInstructions(templates[idx].instructions);
  };

  const saveEdit = () => {
    if (editingIdx === null || !editName.trim()) return;
    const updated = [...templates];
    updated[editingIdx] = { name: editName.trim(), instructions: editInstructions };
    onChange(updated);
    setEditingIdx(null);
  };

  const addTemplate = () => {
    const newTemplate = { name: `${label} Template ${templates.length + 1}`, instructions: defaultInstructions };
    const updated = [...templates, newTemplate];
    onChange(updated);
    startEdit(updated.length - 1);
  };

  const removeTemplate = (idx: number) => {
    if (templates.length <= 1) return;
    onChange(templates.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{label} Templates</label>
        <button
          onClick={addTemplate}
          className="flex items-center gap-1 px-2 py-1 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
      <div className="space-y-2">
        {templates.map((t, idx) => (
          <div key={idx} className="border border-[var(--border)] rounded-xl overflow-hidden">
            {editingIdx === idx ? (
              <div className="p-3 space-y-2 bg-[var(--bg-tertiary)]">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Template name..."
                  className="w-full px-2.5 py-1.5 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  autoFocus
                />
                <textarea
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  className="w-full h-32 p-2.5 border border-[var(--input-border)] rounded-lg text-xs resize-y bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="flex items-center gap-1 px-3 py-1.5 bg-[var(--accent)] text-white rounded-lg text-xs font-medium active:scale-[0.97] transition-all">
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setEditingIdx(null)} className="flex items-center gap-1 px-3 py-1.5 text-[var(--text-muted)] rounded-lg text-xs font-medium hover:bg-[var(--bg-tertiary)] active:scale-[0.97] transition-all">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{t.name}</span>
                  <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{t.instructions.substring(0, 80)}...</p>
                </div>
                <div className="flex items-center gap-0.5 ml-2">
                  <button onClick={() => startEdit(idx)} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors" title="Edit">
                    <Pencil className="w-3 h-3 text-[var(--text-muted)]" />
                  </button>
                  {templates.length > 1 && (
                    <button onClick={() => removeTemplate(idx)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors" title="Delete">
                      <Trash2 className="w-3 h-3 text-[var(--text-muted)] hover:text-red-500" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('style');
  const [styleGuide, setStyleGuide] = useState<StyleGuide | null>(null);
  const [styleLoading, setStyleLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [addingTo, setAddingTo] = useState<'hpi' | 'objective' | 'assessmentPlan' | 'referral' | 'admission' | null>(null);
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

  // Education mode state
  const [eduConfig, setEduConfig] = useState<EducationConfig>(() => getEducationConfig());

  // Auto-analysis state
  const [autoAnalysis, setAutoAnalysis] = useState(() => getAutoAnalysis());

  // Speech API state
  const [speechApi, setSpeechApi] = useState<SpeechAPI>(() => getSpeechAPI());
  const [transcribeApi, setTranscribeApi] = useState<TranscribeAPI>(() => getTranscribeAPI());
  const [transcribeWebApi, setTranscribeWebApi] = useState<TranscribeAPI>(() => getTranscribeWebAPI());
  const [transcribeWatchApi, setTranscribeWatchApi] = useState<TranscribeAPI>(() => getTranscribeWatchAPI());
  const [medDictMode, setMedDictMode] = useState<MedicalizeDictationMode>(() => getMedicalizeDictationMode());

  // AI Calibration state
  const [aiLearningEnabled, setAiLearningEnabled] = useState(true);
  const [dictationCal, setDictationCal] = useState<{ rules: string; terminology: string; style: string; lastCalibrated?: string; samplesUsed?: string } | null>(null);
  const [encounterCal, setEncounterCal] = useState<{ rules: string; terminology: string; speakerLabeling: string; lastCalibrated?: string; samplesUsed?: string } | null>(null);
  const [calibrating, setCalibrating] = useState<string | null>(null);

  // Load calibration from server settings
  useEffect(() => {
    fetch('/api/privacy-settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.aiLearningEnabled !== undefined) setAiLearningEnabled(data.aiLearningEnabled);
        if (data.dictationCalibration) setDictationCal(data.dictationCalibration);
        if (data.encounterCalibration) setEncounterCal(data.encounterCalibration);
      })
      .catch(() => {});
  }, []);

  const saveCalSetting = async (key: string, value: any) => {
    await fetch('/api/privacy-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  };

  const runCalibration = async (mode: 'dictation' | 'encounter') => {
    setCalibrating(mode);
    try {
      const res = await fetch('/api/calibrate-transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Calibration failed');
        return;
      }
      const data = await res.json();
      if (mode === 'dictation') {
        setDictationCal(data.calibration);
      } else {
        setEncounterCal(data.calibration);
      }
      // Already saved by the API route
    } catch (e: any) {
      alert(e.message || 'Calibration failed');
    } finally {
      setCalibrating(null);
    }
  };
  const [deepgramApiKey, setDeepgramApiKey] = useState('');
  const [deepgramKeyMasked, setDeepgramKeyMasked] = useState<string | null>(null);
  const [wisprApiKey, setWisprApiKey] = useState('');
  const [wisprKeyMasked, setWisprKeyMasked] = useState<string | null>(null);
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('');
  const [elevenlabsKeyMasked, setElevenlabsKeyMasked] = useState<string | null>(null);
  const [medicalKeyterms, setMedicalKeyterms] = useState('');

  // VCH config loading state
  const [vchConfigLoaded, setVchConfigLoaded] = useState(false);

  // Debounce timer for guidance textarea
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const billingConfigDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          examples: { hpi: [], objective: [], assessmentPlan: [], referral: [], admission: [] },
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
    // Billing — load config from Google Sheet, then load codes
    clearLocalBillingData();
    fetch('/api/billing-config')
      .then(res => res.ok ? res.json() : null)
      .then(config => {
        if (config) {
          const r = config.billingRegion || 'yukon';
          setBillingRegion(r);
          saveRegion(r); // sync to localStorage for dashboard
          setSettings(prev => ({
            ...prev,
            vchCprpId: config.vchCprpId || '',
            vchSiteFacility: config.vchSiteFacility || '',
            vchPracNumber: config.vchPracNumber || '',
            vchPractitionerName: config.vchPractitionerName || '',
          }));
          setVchConfigLoaded(true);
          loadBillingCodes(r);
        } else {
          const r = getRegion();
          setBillingRegion(r);
          loadBillingCodes(r);
          setVchConfigLoaded(true);
        }
      })
      .catch(() => {
        const r = getRegion();
        setBillingRegion(r);
        loadBillingCodes(r);
        setVchConfigLoaded(true);
      });
  }, []);

  // Save billing config to Google Sheet (debounced)
  const saveBillingConfigToSheet = useCallback((updatedSettings: AppSettings, region: string) => {
    if (billingConfigDebounceRef.current) clearTimeout(billingConfigDebounceRef.current);
    billingConfigDebounceRef.current = setTimeout(() => {
      fetch('/api/billing-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingRegion: region,
          vchCprpId: updatedSettings.vchCprpId || '',
          vchSiteFacility: updatedSettings.vchSiteFacility || '',
          vchPracNumber: updatedSettings.vchPracNumber || '',
          vchPractitionerName: updatedSettings.vchPractitionerName || '',
        }),
      }).catch(err => console.error('Failed to save billing config:', err));
    }, 800);
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

  const handleAddExample = async (section: 'hpi' | 'objective' | 'assessmentPlan' | 'referral' | 'admission') => {
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

  const handleRemoveExample = async (section: 'hpi' | 'objective' | 'assessmentPlan' | 'referral' | 'admission', index: number) => {
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
          setDeepgramKeyMasked(data.deepgramApiKeyMasked || null);
          setWisprKeyMasked(data.wisprApiKeyMasked || null);
          setElevenlabsKeyMasked(data.elevenlabsApiKeyMasked || null);
          setMedicalKeyterms(data.medicalKeyterms || '');
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

  const saveApiKey = async (key: 'claudeApiKey' | 'openaiApiKey' | 'deepgramApiKey' | 'wisprApiKey' | 'elevenlabsApiKey', value: string) => {
    setSavingKey(true);
    try {
      await fetch('/api/privacy-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value.trim() || '' }),
      });
      const res = await fetch('/api/privacy-settings');
      if (res.ok) {
        const data = await res.json();
        setClaudeKeyMasked(data.claudeApiKeyMasked || null);
        setOpenaiKeyMasked(data.openaiApiKeyMasked || null);
        setDeepgramKeyMasked(data.deepgramApiKeyMasked || null);
        setWisprKeyMasked(data.wisprApiKeyMasked || null);
        setElevenlabsKeyMasked(data.elevenlabsApiKeyMasked || null);
      }
      if (key === 'claudeApiKey') setClaudeApiKey('');
      if (key === 'openaiApiKey') setOpenaiApiKey('');
      if (key === 'deepgramApiKey') setDeepgramApiKey('');
      if (key === 'wisprApiKey') setWisprApiKey('');
      if (key === 'elevenlabsApiKey') setElevenlabsApiKey('');
    } catch {}
    setSavingKey(false);
  };

  const saveMedicalKeyterms = async (value: string) => {
    try {
      await fetch('/api/privacy-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicalKeyterms: value }),
      });
    } catch {}
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
    referral: 'Referral Letter',
    admission: 'Consult Note',
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
            { id: 'privacy' as const, label: 'Privacy & Security' },
            { id: 'keys' as const, label: 'API Keys' },
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
                {(['hpi', 'objective', 'assessmentPlan', 'referral', 'admission'] as const).map((section) => (
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

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Audio Backup Retention: {settings.audioRetentionHours || 12}h
                </label>
                <input
                  type="range"
                  min="2"
                  max="24"
                  step="1"
                  value={settings.audioRetentionHours || 12}
                  onChange={(e) => handleSettingChange('audioRetentionHours', parseInt(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-[var(--text-muted)]">
                  <span>2h</span>
                  <span>24h</span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">How long encrypted audio recordings are kept for re-transcription</p>
              </div>
            </div>

            {/* Auto-generate analysis */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5" style={{ boxShadow: 'var(--card-shadow)' }}>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)] block">Auto-generate synopsis &amp; analysis</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {autoAnalysis
                      ? 'Synopsis, management, and evidence generate automatically when a patient is processed'
                      : 'Click each icon on the patient card to generate individually'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={autoAnalysis}
                  onChange={(e) => {
                    setAutoAnalysis(e.target.checked);
                    saveAutoAnalysis(e.target.checked);
                  }}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600 flex-shrink-0 ml-3"
                />
              </label>
            </div>

            {/* Dictation */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
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

              {/* Medicalize dictation mode */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Medicalize Dictation Mode</label>
                <select
                  value={medDictMode}
                  onChange={(e) => { const v = e.target.value as MedicalizeDictationMode; setMedDictMode(v); saveMedicalizeDictationMode(v); }}
                  className="w-full p-2.5 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500"
                >
                  <option value="hold">Hold to dictate (release to transcribe)</option>
                  <option value="toggle">Click to start / click to stop</option>
                </select>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {medDictMode === 'hold'
                    ? 'Press and hold the mic — icon changes to stethoscope. Release to get medicalized text.'
                    : 'Click once to start recording, click again to stop. Same as non-medicalize mode.'}
                </p>
              </div>

              <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider pt-1">Dictation Engines</h4>

              {/* Speech API (non-medicalize) */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Fast Dictation (no medicalize)</label>
                <select
                  value={speechApi}
                  onChange={(e) => { const v = e.target.value as SpeechAPI; setSpeechApi(v); saveSpeechAPI(v); }}
                  className="w-full p-2.5 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500"
                >
                  <option value="webspeech">Web Speech API (instant, browser-based)</option>
                  <option value="deepgram">Deepgram Nova-3 Medical</option>
                  <option value="elevenlabs">ElevenLabs Scribe v2 (live text)</option>
                </select>
              </div>

              {/* Medicalize dictation */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Medicalize Dictation</label>
                <select
                  value={transcribeApi}
                  onChange={(e) => { const v = e.target.value as TranscribeAPI; setTranscribeApi(v); saveTranscribeAPI(v); }}
                  className="w-full p-2.5 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500"
                >
                  <option value="whisper">OpenAI Whisper + Claude</option>
                  <option value="deepgram">Deepgram Nova-3 Medical + Claude</option>
                  <option value="elevenlabs">ElevenLabs Scribe v2 + Claude</option>
                </select>
              </div>

              <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider pt-2">Transcription Engines</h4>

              {/* Transcribe — web/phone */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Encounter Recording (Web / Phone)</label>
                <select
                  value={transcribeWebApi}
                  onChange={(e) => { const v = e.target.value as TranscribeAPI; setTranscribeWebApi(v); saveTranscribeWebAPI(v); }}
                  className="w-full p-2.5 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500"
                >
                  <option value="whisper">OpenAI Whisper</option>
                  <option value="deepgram">Deepgram Nova-3 Medical</option>
                  <option value="elevenlabs">ElevenLabs Scribe v2</option>
                </select>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Used for full encounter recordings in the Add Patient modal</p>
              </div>

              {/* Transcribe — watch */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Watch App</label>
                <select
                  value={transcribeWatchApi}
                  onChange={(e) => {
                    const v = e.target.value as TranscribeAPI;
                    setTranscribeWatchApi(v);
                    saveTranscribeWatchAPI(v);
                    // Also save to server for watch endpoints
                    fetch('/api/privacy-settings', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ watchTranscribeApi: v }),
                    }).catch(() => {});
                  }}
                  className="w-full p-2.5 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500"
                >
                  <option value="whisper">OpenAI Whisper</option>
                  <option value="deepgram">Deepgram Nova-3 Medical</option>
                  <option value="elevenlabs">ElevenLabs Scribe v2</option>
                </select>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Used for audio uploaded from the Watch app</p>
              </div>
            </div>

            {/* AI Transcription Calibration */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-500" />
                  <h3 className="font-semibold text-[var(--text-primary)]">AI Transcription Learning</h3>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={aiLearningEnabled}
                  onClick={() => { setAiLearningEnabled(!aiLearningEnabled); saveCalSetting('aiLearningEnabled', !aiLearningEnabled); }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${aiLearningEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${aiLearningEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                AI analyzes your past dictations and encounter recordings to learn your terminology, speaking patterns, and writing style — improving transcription accuracy over time.
              </p>

              {aiLearningEnabled && (
                <div className="space-y-4 pt-1">
                  {/* Dictation Calibration */}
                  <div className="border border-[var(--border-light)] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Dictation Rules</h4>
                        <p className="text-[11px] text-[var(--text-muted)]">How you dictate clinical notes</p>
                      </div>
                      {dictationCal?.lastCalibrated && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">
                          {dictationCal.samplesUsed} samples · {new Date(dictationCal.lastCalibrated).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {dictationCal ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Processing Rules</label>
                          <textarea value={dictationCal.rules} onChange={(e) => { const updated = { ...dictationCal, rules: e.target.value }; setDictationCal(updated); saveCalSetting('dictationCalibration', updated); }}
                            className="w-full mt-1 p-2.5 border border-[var(--input-border)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-primary)] resize-y" rows={3} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Terminology</label>
                          <textarea value={dictationCal.terminology} onChange={(e) => { const updated = { ...dictationCal, terminology: e.target.value }; setDictationCal(updated); saveCalSetting('dictationCalibration', updated); }}
                            className="w-full mt-1 p-2.5 border border-[var(--input-border)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-primary)] resize-y" rows={2} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Writing Style</label>
                          <textarea value={dictationCal.style} onChange={(e) => { const updated = { ...dictationCal, style: e.target.value }; setDictationCal(updated); saveCalSetting('dictationCalibration', updated); }}
                            className="w-full mt-1 p-2.5 border border-[var(--input-border)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-primary)] resize-y" rows={2} />
                        </div>
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        onClick={() => runCalibration('dictation')}
                        disabled={calibrating !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 active:scale-[0.97] transition-all disabled:opacity-40"
                      >
                        {calibrating === 'dictation' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {dictationCal ? 'Update from New Dictations' : 'Learn from Stored Dictations'}
                      </button>
                      {dictationCal && (
                        <button
                          onClick={() => { setDictationCal(null); saveCalSetting('dictationCalibration', null); }}
                          className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Encounter Calibration */}
                  <div className="border border-[var(--border-light)] rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Encounter Transcript Rules</h4>
                        <p className="text-[11px] text-[var(--text-muted)]">How you record patient encounters</p>
                      </div>
                      {encounterCal?.lastCalibrated && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">
                          {encounterCal.samplesUsed} samples · {new Date(encounterCal.lastCalibrated).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {encounterCal ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Processing Rules</label>
                          <textarea value={encounterCal.rules} onChange={(e) => { const updated = { ...encounterCal, rules: e.target.value }; setEncounterCal(updated); saveCalSetting('encounterCalibration', updated); }}
                            className="w-full mt-1 p-2.5 border border-[var(--input-border)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-primary)] resize-y" rows={3} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Terminology</label>
                          <textarea value={encounterCal.terminology} onChange={(e) => { const updated = { ...encounterCal, terminology: e.target.value }; setEncounterCal(updated); saveCalSetting('encounterCalibration', updated); }}
                            className="w-full mt-1 p-2.5 border border-[var(--input-border)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-primary)] resize-y" rows={2} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Speaker Identification</label>
                          <textarea value={encounterCal.speakerLabeling} onChange={(e) => { const updated = { ...encounterCal, speakerLabeling: e.target.value }; setEncounterCal(updated); saveCalSetting('encounterCalibration', updated); }}
                            className="w-full mt-1 p-2.5 border border-[var(--input-border)] rounded-lg text-xs bg-[var(--input-bg)] text-[var(--text-primary)] resize-y" rows={2} />
                        </div>
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        onClick={() => runCalibration('encounter')}
                        disabled={calibrating !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 active:scale-[0.97] transition-all disabled:opacity-40"
                      >
                        {calibrating === 'encounter' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {encounterCal ? 'Update from New Encounters' : 'Learn from Stored Encounters'}
                      </button>
                      {encounterCal && (
                        <button
                          onClick={() => { setEncounterCal(null); saveCalSetting('encounterCalibration', null); }}
                          className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
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

          </>
        )}

        {/* Prompts Tab */}
        {activeTab === 'prompts' && (
          <>
            {/* Note Style Instructions */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Note Style Instructions</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Customize how AI generates notes for each style. These are the instructions shown under the Generate Note button.</p>
                </div>
                <button
                  onClick={() => {
                    handleSettingChange('noteStyleStandard', DEFAULT_NOTE_STYLE_STANDARD);
                    handleSettingChange('noteStyleDetailed', DEFAULT_NOTE_STYLE_DETAILED);
                    handleSettingChange('noteStyleCompleteExam', DEFAULT_NOTE_STYLE_COMPLETE_EXAM);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg text-xs transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset All
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Standard</label>
                <textarea
                  value={settings.noteStyleStandard || DEFAULT_NOTE_STYLE_STANDARD}
                  onChange={(e) => handleSettingChange('noteStyleStandard', e.target.value)}
                  className="w-full h-20 p-2.5 border border-[var(--input-border)] rounded-lg text-xs resize-y bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Detailed</label>
                <textarea
                  value={settings.noteStyleDetailed || DEFAULT_NOTE_STYLE_DETAILED}
                  onChange={(e) => handleSettingChange('noteStyleDetailed', e.target.value)}
                  className="w-full h-20 p-2.5 border border-[var(--input-border)] rounded-lg text-xs resize-y bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Complete Exam</label>
                <textarea
                  value={settings.noteStyleCompleteExam || DEFAULT_NOTE_STYLE_COMPLETE_EXAM}
                  onChange={(e) => handleSettingChange('noteStyleCompleteExam', e.target.value)}
                  className="w-full h-32 p-2.5 border border-[var(--input-border)] rounded-lg text-xs resize-y bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Referral & Consult Templates */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-5" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">Referral & Consult Templates</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Create multiple templates for different referral and consult scenarios. Select which template to use when generating.</p>
              </div>

              {/* Referral Templates */}
              <TemplateManager
                label="Referral"
                templates={settings.referralTemplates || [{ name: 'Default', instructions: settings.referralInstructions || DEFAULT_REFERRAL_INSTRUCTIONS }]}
                defaultInstructions={DEFAULT_REFERRAL_INSTRUCTIONS}
                onChange={(templates) => {
                  const updated = { ...settings, referralTemplates: templates, referralInstructions: templates[0]?.instructions || DEFAULT_REFERRAL_INSTRUCTIONS };
                  setSettings(updated);
                  saveSettings(updated);
                }}
              />

              {/* Consult Templates */}
              <TemplateManager
                label="Consult"
                templates={settings.consultTemplates || [{ name: 'Default', instructions: settings.admissionInstructions || DEFAULT_ADMISSION_INSTRUCTIONS }]}
                defaultInstructions={DEFAULT_ADMISSION_INSTRUCTIONS}
                onChange={(templates) => {
                  const updated = { ...settings, consultTemplates: templates, admissionInstructions: templates[0]?.instructions || DEFAULT_ADMISSION_INSTRUCTIONS };
                  setSettings(updated);
                  saveSettings(updated);
                }}
              />
            </div>

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

            {/* Education Mode */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Education Mode</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Generate recommended reading (textbook chapters, guidelines, key studies) for each case.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
                  <span className="text-xs text-[var(--text-muted)]">{eduConfig.enabled ? 'On' : 'Off'}</span>
                  <input
                    type="checkbox"
                    checked={eduConfig.enabled}
                    onChange={(e) => {
                      const updated = { ...eduConfig, enabled: e.target.checked };
                      setEduConfig(updated);
                      saveEducationConfig(updated);
                    }}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                  />
                </label>
              </div>
              {eduConfig.enabled && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">Narrow sources (optional)</label>
                  <textarea
                    value={eduConfig.sources}
                    onChange={(e) => {
                      const updated = { ...eduConfig, sources: e.target.value };
                      setEduConfig(updated);
                      saveEducationConfig(updated);
                    }}
                    placeholder="Leave empty for all sources, or specify: e.g. Rosen's, Tintinalli's, UpToDate, NEJM..."
                    className="w-full h-16 p-2 border border-[var(--input-border)] rounded-lg text-xs resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  />
                  <p className="text-[10px] text-[var(--text-muted)]">
                    When enabled, a graduation cap icon appears on each patient card. Click it to generate learning resources for that case.
                  </p>
                </div>
              )}
            </div>
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
                  saveBillingConfigToSheet(settings, r);
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
                        onChange={(e) => {
                          handleSettingChange(key, e.target.value);
                          const updated = { ...settings, [key]: e.target.value };
                          saveBillingConfigToSheet(updated, billingRegion);
                        }}
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
                        setNewBillingCode('');
                        setNewBillingDesc('');
                        setNewBillingFee('');
                        setAddingCode(false);
                      } catch (err) {
                        console.error('Failed to add billing code:', err);
                        alert('Failed to save billing code. Please try again.');
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
                {/* PHI Protection */}
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{
                      background: 'rgba(34,197,94,0.06)',
                      border: '1px solid rgba(34,197,94,0.2)',
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-4 h-4 flex-shrink-0 rounded bg-emerald-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                      <div>
                        <span className="text-sm font-medium block text-[var(--text-primary)]">
                          De-identify data before sending to AI
                          <span className="text-[9px] font-normal text-emerald-600 dark:text-emerald-400 ml-2">Always on</span>
                        </span>
                        <span className="text-[11px] block mt-0.5 text-[var(--text-muted)]">
                          Patient names, MRN, HCN, and DOB are stripped from all AI prompts. Clinical data only — identifiers restored automatically in the output.
                        </span>
                      </div>
                    </div>
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
                      background: 'rgba(34,197,94,0.06)',
                      border: '1px solid rgba(34,197,94,0.2)',
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-4 h-4 flex-shrink-0 rounded bg-emerald-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                      <div>
                        <span className="text-sm font-medium block text-[var(--text-primary)]">
                          AES-256-GCM encryption at rest
                          <span className="text-[9px] font-normal text-emerald-600 dark:text-emerald-400 ml-2">Always on</span>
                        </span>
                        <span className="text-[11px] block mt-0.5 text-[var(--text-muted)]">
                          All patient data is encrypted before storage. The encryption key is unique to your account and stored securely server-side.
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] space-y-1 text-[var(--text-muted)]">
                    <p><strong>What gets encrypted:</strong> All patient fields in Google Sheets — demographics, clinical notes, generated output, billing data.</p>
                    <p><strong>What stays readable:</strong> Sheet tab names and column headers (structural data only, no PHI).</p>
                    <p><strong>Backward compatible:</strong> Unencrypted data (written before enabling) is still readable. New writes will be encrypted.</p>
                    <p><strong>Warning:</strong> If you lose access to your account, encrypted data cannot be recovered. The encryption key is tied to your user account.</p>
                  </div>
                </div>

                {/* Session Security */}
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <h3 className="font-semibold text-[var(--text-primary)]">Session Security</h3>

                  {/* Session Timeout */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-medium text-[var(--text-primary)] block">
                        Session timeout ({settings.sessionTimeoutMinutes || 30} min)
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Lock screen after inactivity. Requires PIN or authenticator to unlock.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.sessionTimeoutEnabled || false}
                      onChange={(e) => handleSettingChange('sessionTimeoutEnabled', e.target.checked)}
                      className="rounded w-4 h-4 flex-shrink-0 accent-blue-600"
                    />
                  </label>
                  {settings.sessionTimeoutEnabled && (
                    <div className="pl-4">
                      <input
                        type="range" min="5" max="60" step="5"
                        value={settings.sessionTimeoutMinutes || 30}
                        onChange={(e) => handleSettingChange('sessionTimeoutMinutes', parseInt(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                        <span>5 min</span><span>60 min</span>
                      </div>
                    </div>
                  )}

                  {/* Full login every 24h */}
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-medium text-[var(--text-primary)] block">Require full login every 24 hours</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Forces Google sign-in after 24h regardless of activity.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.fullLoginRequired24h || false}
                      onChange={(e) => handleSettingChange('fullLoginRequired24h', e.target.checked)}
                      className="rounded w-4 h-4 flex-shrink-0 accent-blue-600"
                    />
                  </label>
                </div>

                {/* Quick Unlock PIN */}
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <h3 className="font-semibold text-[var(--text-primary)]">Quick Unlock PIN</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Set a 4-digit PIN for quick re-authentication when your session is locked.
                  </p>
                  <PinSetup />
                </div>

                {/* Two-Factor Authentication */}
                <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <h3 className="font-semibold text-[var(--text-primary)]">Two-Factor Authentication (2FA)</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Use an authenticator app (Google Authenticator, Authy) for an extra layer of security at login and session unlock.
                  </p>
                  <TotpSetup />
                </div>
              </>
            )}
          </>
        )}
        {/* API Keys Tab */}
        {activeTab === 'keys' && (
          <>
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-5" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">API Keys</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Add your API keys to use AI features. Keys are stored securely server-side.
                </p>
              </div>

              {/* Anthropic API Key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text-secondary)]">Anthropic API Key (Claude AI)</label>
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:text-blue-600 dark:text-blue-400">Get key</a>
                </div>
                {claudeKeyMasked ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-[var(--bg-tertiary)] rounded-lg text-xs font-mono text-[var(--text-muted)]">{claudeKeyMasked}</code>
                    <button onClick={() => saveApiKey('claudeApiKey', '')} disabled={savingKey}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="password" value={claudeApiKey} onChange={(e) => setClaudeApiKey(e.target.value)} placeholder="sk-ant-..."
                      className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono" />
                    <button onClick={() => saveApiKey('claudeApiKey', claudeApiKey)} disabled={savingKey || !claudeApiKey.trim()}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">Save</button>
                  </div>
                )}
                <p className="text-[10px] text-[var(--text-muted)]">Required. Powers note generation, clinical questions, and medical terminology.</p>
              </div>

              {/* OpenAI API Key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text-secondary)]">OpenAI API Key (Whisper)</label>
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:text-blue-600 dark:text-blue-400">Get key</a>
                </div>
                {openaiKeyMasked ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-[var(--bg-tertiary)] rounded-lg text-xs font-mono text-[var(--text-muted)]">{openaiKeyMasked}</code>
                    <button onClick={() => saveApiKey('openaiApiKey', '')} disabled={savingKey}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="password" value={openaiApiKey} onChange={(e) => setOpenaiApiKey(e.target.value)} placeholder="sk-..."
                      className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono" />
                    <button onClick={() => saveApiKey('openaiApiKey', openaiApiKey)} disabled={savingKey || !openaiApiKey.trim()}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">Save</button>
                  </div>
                )}
                <p className="text-[10px] text-[var(--text-muted)]">Required for Whisper transcription engine. Not needed if using Deepgram only.</p>
              </div>

              {/* Deepgram API Key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text-secondary)]">Deepgram API Key (Nova-3 Medical)</label>
                  <a href="https://console.deepgram.com/api-keys" target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:text-blue-600 dark:text-blue-400">Get key</a>
                </div>
                {deepgramKeyMasked ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-[var(--bg-tertiary)] rounded-lg text-xs font-mono text-[var(--text-muted)]">{deepgramKeyMasked}</code>
                    <button onClick={() => saveApiKey('deepgramApiKey', '')} disabled={savingKey}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="password" value={deepgramApiKey} onChange={(e) => setDeepgramApiKey(e.target.value)} placeholder="Deepgram API key..."
                      className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono" />
                    <button onClick={() => saveApiKey('deepgramApiKey', deepgramApiKey)} disabled={savingKey || !deepgramApiKey.trim()}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">Save</button>
                  </div>
                )}
                <p className="text-[10px] text-[var(--text-muted)]">Optional. Enables Deepgram Nova-3 Medical as an alternate transcription engine.</p>
              </div>

              {/* ElevenLabs API Key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text-secondary)]">ElevenLabs API Key (Scribe v2)</label>
                  <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 hover:text-blue-600 dark:text-blue-400">Get key</a>
                </div>
                {elevenlabsKeyMasked ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-[var(--bg-tertiary)] rounded-lg text-xs font-mono text-[var(--text-muted)]">{elevenlabsKeyMasked}</code>
                    <button onClick={() => saveApiKey('elevenlabsApiKey', '')} disabled={savingKey}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="password" value={elevenlabsApiKey} onChange={(e) => setElevenlabsApiKey(e.target.value)} placeholder="xi_..."
                      className="flex-1 p-2 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono" />
                    <button onClick={() => saveApiKey('elevenlabsApiKey', elevenlabsApiKey)} disabled={savingKey || !elevenlabsApiKey.trim()}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">Save</button>
                  </div>
                )}
                <p className="text-[10px] text-[var(--text-muted)]">Real-time live text + high-accuracy batch transcription with medical keyterms.</p>
              </div>

            </div>

            {/* Medical Keyterms */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-[var(--text-secondary)]" />
                  <h3 className="font-semibold text-[var(--text-primary)]">Medical Keyterms</h3>
                </div>
                <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
                  {medicalKeyterms ? medicalKeyterms.split(/[,\n]+/).filter(t => t.trim()).length : 0} custom terms
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Custom medical terms to boost speech-to-text accuracy. Comma or newline separated. These are added to the built-in dictionary (~200 terms).
              </p>
              <textarea
                value={medicalKeyterms}
                onChange={(e) => setMedicalKeyterms(e.target.value)}
                onBlur={() => saveMedicalKeyterms(medicalKeyterms)}
                placeholder="e.g., tPA, tenecteplase, ECMO, bronchiectasis, sarcoidosis..."
                rows={4}
                className="w-full p-3 border border-[var(--input-border)] rounded-lg text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-blue-500 resize-y font-mono"
              />
            </div>

            {/* App Token */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-[var(--text-secondary)]" />
                <h3 className="font-semibold text-[var(--text-primary)]">App Token</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Token for Watch app and external integrations.
              </p>
              <div className="space-y-3">
                {shortcutToken ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Copy this token now — it won&apos;t be shown again</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2.5 bg-[var(--bg-tertiary)] rounded-lg text-xs font-mono text-[var(--text-primary)] break-all select-all">{shortcutToken}</code>
                      <button onClick={() => { navigator.clipboard.writeText(shortcutToken); setShortcutCopied(true); setTimeout(() => setShortcutCopied(false), 2000); }}
                        className="p-2 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg flex-shrink-0">
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
                    <button onClick={async () => { setShortcutLoading(true); try { await fetch('/api/shortcuts/token', { method: 'DELETE' }); setShortcutHasToken(false); setShortcutToken(''); } catch {} finally { setShortcutLoading(false); } }}
                      disabled={shortcutLoading}
                      className="px-3 py-1.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium disabled:opacity-50">Revoke</button>
                  </div>
                ) : null}
                <button onClick={async () => { setShortcutLoading(true); setShortcutToken(''); try { const res = await fetch('/api/shortcuts/token', { method: 'POST' }); if (res.ok) { const { token } = await res.json(); setShortcutToken(token); setShortcutHasToken(true); } } catch {} finally { setShortcutLoading(false); } }}
                  disabled={shortcutLoading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {shortcutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  {shortcutHasToken ? 'Regenerate Token' : 'Generate Token'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
