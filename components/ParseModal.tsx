'use client';

import { useState } from 'react';
import { X, Clipboard, Check, Loader2 } from 'lucide-react';
import { ExamToggles } from '@/components/ExamToggles';

interface ParseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ParsedData) => void;
}

export interface ParsedData {
  name: string;
  age: string;
  gender: string;
  birthday: string;
  hcn: string;
  mrn: string;
  timestamp: string;
  triageVitals: string;
  transcript: string;
  additional: string;
  pastDocs: string;
}

export function ParseModal({ isOpen, onClose, onSave }: ParseModalProps) {
  const [pasteText, setPasteText] = useState('');
  const [triageVitals, setTriageVitals] = useState('');
  const [transcript, setTranscript] = useState('');
  const [additional, setAdditional] = useState('');
  const [pastDocs, setPastDocs] = useState('');
  const [encounterTime, setEncounterTime] = useState('');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!pasteText.trim()) {
      setError('Please paste patient data first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText }),
      });

      if (!res.ok) throw new Error('Failed to parse');

      const data = await res.json();
      const timestamp = encounterTime || data.timestamp;
      setParsedData({
        ...data,
        timestamp,
        triageVitals,
        transcript,
        additional,
        pastDocs,
      });
    } catch (e) {
      setError('Failed to parse patient data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (parsedData) {
      const timestamp = encounterTime || parsedData.timestamp;
      onSave({
        ...parsedData,
        timestamp,
        triageVitals,
        transcript,
        additional,
        pastDocs,
      });
      // Reset form
      setPasteText('');
      setTriageVitals('');
      setTranscript('');
      setAdditional('');
      setPastDocs('');
      setEncounterTime('');
      setParsedData(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Add Patient</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Paste Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Paste Meditech Data
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste patient info from Meditech..."
              className="w-full h-32 p-3 border rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleParse}
              disabled={loading || !pasteText.trim()}
              className="mt-2 w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Clipboard className="w-4 h-4" />
              )}
              Parse Data
            </button>
          </div>

          {/* Parsed Result */}
          {parsedData && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                <Check className="w-4 h-4" />
                Parsed Successfully
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Name:</span> {parsedData.name}</div>
                <div><span className="text-gray-500">Age:</span> {parsedData.age} {parsedData.gender}</div>
                <div><span className="text-gray-500">DOB:</span> {parsedData.birthday}</div>
                <div><span className="text-gray-500">HCN:</span> {parsedData.hcn}</div>
                <div><span className="text-gray-500">MRN:</span> {parsedData.mrn}</div>
                <div><span className="text-gray-500">Time:</span> {encounterTime || parsedData.timestamp}</div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Encounter Time Override */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Encounter Time (optional override)
            </label>
            <input
              type="time"
              value={encounterTime}
              onChange={(e) => setEncounterTime(e.target.value)}
              className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Triage Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Triage Notes & Vitals (optional)
            </label>
            <textarea
              value={triageVitals}
              onChange={(e) => setTriageVitals(e.target.value)}
              placeholder="Chief complaint, vitals, triage assessment..."
              className="w-full h-24 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Transcript */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Transcript (optional)
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Encounter transcript..."
              className="w-full h-32 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Additional Findings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Findings (optional)
            </label>
            <ExamToggles value={additional} onChange={setAdditional} />
            <textarea
              value={additional}
              onChange={(e) => setAdditional(e.target.value)}
              placeholder="Exam findings, investigations, plan notes..."
              className="w-full h-24 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Past Documentation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Past Documentation (optional)
            </label>
            <textarea
              value={pastDocs}
              onChange={(e) => setPastDocs(e.target.value)}
              placeholder="Previous visit notes, relevant history..."
              className="w-full h-24 p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={handleSave}
            disabled={!parsedData}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:bg-gray-300"
          >
            Save Patient
          </button>
        </div>
      </div>
    </div>
  );
}
