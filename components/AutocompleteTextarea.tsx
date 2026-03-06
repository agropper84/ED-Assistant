'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface PatientContext {
  age?: string;
  gender?: string;
  chiefComplaint?: string;
}

interface AutocompleteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
  rows?: number;
  patientContext?: PatientContext;
}

/** Find the partial text from the last sentence boundary to end of value */
function getPartial(value: string): string {
  // Find last sentence boundary: ". ", ".\n", or "\n"
  let lastBoundary = -1;
  for (let i = value.length - 1; i >= 0; i--) {
    if (value[i] === '\n') {
      lastBoundary = i;
      break;
    }
    if (value[i] === '.' && i + 1 < value.length && (value[i + 1] === ' ' || value[i + 1] === '\n')) {
      lastBoundary = i + 1; // after the ". "
      break;
    }
  }
  const partial = lastBoundary === -1 ? value : value.substring(lastBoundary + 1);
  return partial.trimStart();
}

export function AutocompleteTextarea({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  textareaClassName,
  rows = 7,
  patientContext,
}: AutocompleteTextareaProps) {
  const [ghost, setGhost] = useState('');
  const [isAIGhost, setIsAIGhost] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAICompletion = useCallback(async (partial: string, fullText: string) => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAiLoading(true);
    try {
      const res = await fetch('/api/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partial,
          context: {
            age: patientContext?.age,
            gender: patientContext?.gender,
            chiefComplaint: patientContext?.chiefComplaint,
            textBefore: fullText,
          },
        }),
        signal: controller.signal,
      });

      if (!controller.signal.aborted) {
        const data = await res.json();
        if (data.completion && !controller.signal.aborted) {
          setGhost(data.completion);
          setIsAIGhost(true);
        }
      }
    } catch {
      // Silent failure — autocomplete is non-critical
    } finally {
      if (!controller.signal.aborted) {
        setAiLoading(false);
      }
    }
  }, [patientContext]);

  // Compute ghost text whenever value or suggestions change
  const computeGhost = useCallback((currentValue: string) => {
    // Clear pending debounce + abort in-flight AI request
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();
    setAiLoading(false);
    setIsAIGhost(false);

    const partial = getPartial(currentValue);
    if (partial.length < 3) {
      setGhost('');
      return;
    }

    // Try corpus prefix match (instant)
    const lowerPartial = partial.toLowerCase();
    for (const suggestion of suggestions) {
      if (suggestion.startsWith(lowerPartial) && suggestion.length > lowerPartial.length) {
        setGhost(suggestion.substring(lowerPartial.length));
        return;
      }
    }

    // No corpus match — schedule AI fallback if context available
    setGhost('');
    if (patientContext) {
      debounceRef.current = setTimeout(() => {
        fetchAICompletion(partial, currentValue);
      }, 800);
    }
  }, [suggestions, patientContext, fetchAICompletion]);

  useEffect(() => {
    computeGhost(value);
  }, [value, computeGhost]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && ghost) {
      e.preventDefault();
      onChange(value + ghost);
      setGhost('');
      setIsAIGhost(false);
      setAiLoading(false);
    } else if (e.key === 'Escape' && (ghost || aiLoading)) {
      setGhost('');
      setIsAIGhost(false);
      setAiLoading(false);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      abortRef.current?.abort();
    }
  };

  const handleScroll = () => {
    if (textareaRef.current && mirrorRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className={`relative ${className || ''}`}>
      {/* Mirror div behind textarea for ghost text */}
      <div
        ref={mirrorRef}
        className={`absolute inset-0 pointer-events-none overflow-hidden whitespace-pre-wrap break-words ${textareaClassName || ''}`}
        aria-hidden="true"
      >
        <span style={{ visibility: 'hidden' }}>{value}</span>
        {ghost && (
          <span className="text-[var(--text-muted)]" style={{ opacity: isAIGhost ? 0.5 : 0.4 }}>
            {ghost}
          </span>
        )}
        {aiLoading && !ghost && (
          <span className="text-[var(--text-muted)] animate-pulse" style={{ opacity: 0.3 }}>
            {' ...'}
          </span>
        )}
      </div>

      {/* Actual textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        placeholder={placeholder}
        rows={rows}
        className={`relative bg-transparent ${textareaClassName || ''}`}
        style={{ caretColor: 'var(--text-primary)' }}
      />
    </div>
  );
}
