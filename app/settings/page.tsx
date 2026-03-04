'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Plus, Pencil, RotateCcw, Loader2, X } from 'lucide-react';
import {
  StyleGuide,
  fetchStyleGuide,
  persistStyleGuide,
  addExampleAsync,
  removeExampleAsync,
  getStyleGuide,
  clearLocalStyleGuide,
} from '@/lib/style-guide';
import { getSettings, saveSettings, AppSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { getExamPresets, saveExamPresets, resetExamPresets, ExamPreset } from '@/lib/exam-presets';

type Tab = 'style' | 'settings';

export default function SettingsPage() {
  const router = useRouter();
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

  // Debounce timer for guidance textarea
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setExamPresets(getExamPresets());
  }, []);

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

  const handleSettingChange = (key: keyof AppSettings, value: string | number) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const sectionLabels: Record<string, string> = {
    hpi: 'HPI',
    objective: 'Objective',
    assessmentPlan: 'Assessment & Plan',
  };

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
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="bg-white border-b sticky top-[60px] z-30">
        <div className="flex max-w-2xl mx-auto">
          {(['style', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'style' ? 'Style Guide' : 'Processing Settings'}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {/* Style Guide Tab */}
        {activeTab === 'style' && (
          <>
            {styleLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-500 text-sm">Loading style guide...</span>
              </div>
            ) : styleGuide && (
              <>
                {/* Custom Guidance */}
                <div className="bg-white rounded-xl shadow-sm border p-4 space-y-2">
                  <h3 className="font-semibold text-gray-900">Charting Guidance</h3>
                  <p className="text-xs text-gray-500">
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
                    className="w-full h-28 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Exam Presets */}
                <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Physical Exam Presets</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const reset = resetExamPresets();
                          setExamPresets(reset);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-xs font-medium transition-colors"
                        title="Reset to defaults"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setAddingPreset(true); setPresetLabel(''); setPresetText(''); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>
                  </div>

                  {examPresets.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No presets configured</p>
                  ) : (
                    <div className="space-y-2">
                      {examPresets.map((preset, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-lg p-3 relative group">
                          {editingPreset === idx ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={presetLabel}
                                onChange={(e) => setPresetLabel(e.target.value)}
                                placeholder="Label (e.g. HEENT)"
                                className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                autoFocus
                              />
                              <textarea
                                value={presetText}
                                onChange={(e) => setPresetText(e.target.value)}
                                placeholder="Normal exam text..."
                                className="w-full h-20 p-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start gap-2 pr-16">
                                <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold flex-shrink-0 mt-0.5">
                                  {preset.label}
                                </span>
                                <p className="text-sm text-gray-700">{preset.text}</p>
                              </div>
                              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setEditingPreset(idx);
                                    setPresetLabel(preset.label);
                                    setPresetText(preset.text);
                                  }}
                                  className="p-1 bg-blue-100 text-blue-600 rounded"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    const updated = examPresets.filter((_, i) => i !== idx);
                                    saveExamPresets(updated);
                                    setExamPresets(updated);
                                  }}
                                  className="p-1 bg-red-100 text-red-600 rounded"
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
                    <div className="border-t pt-3 space-y-2">
                      <input
                        type="text"
                        value={presetLabel}
                        onChange={(e) => setPresetLabel(e.target.value)}
                        placeholder="Label (e.g. GU, Vascular)"
                        className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        autoFocus
                      />
                      <textarea
                        value={presetText}
                        onChange={(e) => setPresetText(e.target.value)}
                        placeholder="Normal exam findings text..."
                        className="w-full h-20 p-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Extracted Features as deletable chips */}
                {(styleGuide.extractedFeatures.length > 0 || extracting) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-blue-800">Style Features</h3>
                      {extracting && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {styleGuide.extractedFeatures.map((feature, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium group"
                        >
                          {feature}
                          <button
                            onClick={() => handleRemoveFeature(idx)}
                            className="p-0.5 hover:bg-blue-200 rounded-full transition-colors opacity-60 group-hover:opacity-100"
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
                  <div key={section} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">{sectionLabels[section]} Examples</h3>
                      <button
                        onClick={() => { setAddingTo(section); setNewExample(''); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>

                    {styleGuide.examples[section].length === 0 ? (
                      <p className="text-sm text-gray-400 italic">No examples saved yet</p>
                    ) : (
                      styleGuide.examples[section].map((example, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-lg p-3 relative group">
                          <button
                            onClick={() => handleRemoveExample(section, idx)}
                            className="absolute top-2 right-2 p-1 bg-red-100 text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap pr-8 line-clamp-4">
                            {example}
                          </p>
                        </div>
                      ))
                    )}

                    {/* Add Example Form */}
                    {addingTo === section && (
                      <div className="border-t pt-3 space-y-2">
                        <textarea
                          value={newExample}
                          onChange={(e) => setNewExample(e.target.value)}
                          placeholder={`Paste an example ${sectionLabels[section]} section...`}
                          className="w-full h-32 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
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
          <div className="bg-white rounded-xl shadow-sm border p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <select
                value={settings.model}
                onChange={(e) => handleSettingChange('model', e.target.value)}
                className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Tokens: {settings.maxTokens}
              </label>
              <input
                type="range"
                min="1024"
                max="8192"
                step="512"
                value={settings.maxTokens}
                onChange={(e) => handleSettingChange('maxTokens', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>1024</span>
                <span>8192</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperature: {settings.temperature}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => handleSettingChange('temperature', parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0 (Precise)</span>
                <span>1 (Creative)</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
