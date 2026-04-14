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
    const markedText = `[VERBATIM_EXAM]${system.text}[/VERBATIM_EXAM]`;
    const isMarked = value.includes(markedText);
    const isUnmarked = !isMarked && value.includes(system.text);

    if (isMarked || isUnmarked) {
      // Remove — strip the marked or unmarked version
      const newValue = value
        .replace(markedText, '')
        .replace(system.text, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      onChange(newValue);
    } else {
      // Append with verbatim marker
      const separator = value.trim() ? '\n' : '';
      onChange(value.trim() + separator + markedText);
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
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
          }`}
        >
          {system.label}
        </button>
      ))}
    </div>
  );
}
