'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Plus, X } from 'lucide-react';
import { getStyleGuide, addExample, removeExample, StyleGuide } from '@/lib/style-guide';
import { getSettings, saveSettings, AppSettings, DEFAULT_SETTINGS } from '@/lib/settings';

type Tab = 'style' | 'settings';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('style');
  const [styleGuide, setStyleGuide] = useState<StyleGuide | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [addingTo, setAddingTo] = useState<'hpi' | 'objective' | 'assessmentPlan' | null>(null);
  const [newExample, setNewExample] = useState('');

  useEffect(() => {
    setStyleGuide(getStyleGuide());
    setSettings(getSettings());
  }, []);

  const handleAddExample = (section: 'hpi' | 'objective' | 'assessmentPlan') => {
    if (!newExample.trim()) return;
    addExample(section, newExample.trim());
    setStyleGuide(getStyleGuide());
    setNewExample('');
    setAddingTo(null);
  };

  const handleRemoveExample = (section: 'hpi' | 'objective' | 'assessmentPlan', index: number) => {
    removeExample(section, index);
    setStyleGuide(getStyleGuide());
  };

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
        {activeTab === 'style' && styleGuide && (
          <>
            {/* Computed Features */}
            {styleGuide.computedFeatures && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-1">Detected Style Features</h3>
                <p className="text-sm text-blue-700">{styleGuide.computedFeatures}</p>
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
                        disabled={!newExample.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
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
