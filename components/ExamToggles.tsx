'use client';

import { useState, useEffect } from 'react';
import { getExamPresets, ExamPreset } from '@/lib/exam-presets';

interface ExamTogglesProps {
  value: string;
  onChange: (value: string) => void;
}

export function ExamToggles({ value, onChange }: ExamTogglesProps) {
  const [presets, setPresets] = useState<ExamPreset[]>([]);

  useEffect(() => {
    setPresets(getExamPresets());
  }, []);

  const isActive = (system: { text: string }) => {
    return value.includes(system.text);
  };

  const toggle = (system: { text: string }) => {
    if (isActive(system)) {
      // Remove - strip the text and any surrounding newlines
      const newValue = value
        .replace(system.text, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      onChange(newValue);
    } else {
      // Append
      const separator = value.trim() ? '\n' : '';
      onChange(value.trim() + separator + system.text);
    }
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {presets.map((system) => (
        <button
          key={system.label}
          type="button"
          onClick={() => toggle(system)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            isActive(system)
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {system.label}
        </button>
      ))}
    </div>
  );
}
