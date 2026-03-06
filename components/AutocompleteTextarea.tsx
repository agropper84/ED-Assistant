'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface AutocompleteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
  rows?: number;
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
}: AutocompleteTextareaProps) {
  const [ghost, setGhost] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Compute ghost text whenever value or suggestions change
  const computeGhost = useCallback((currentValue: string) => {
    const partial = getPartial(currentValue);
    if (partial.length < 3) {
      setGhost('');
      return;
    }

    const lowerPartial = partial.toLowerCase();
    for (const suggestion of suggestions) {
      if (suggestion.startsWith(lowerPartial) && suggestion.length > lowerPartial.length) {
        setGhost(suggestion.substring(lowerPartial.length));
        return;
      }
    }
    setGhost('');
  }, [suggestions]);

  useEffect(() => {
    computeGhost(value);
  }, [value, computeGhost]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && ghost) {
      e.preventDefault();
      onChange(value + ghost);
      setGhost('');
    } else if (e.key === 'Escape' && ghost) {
      setGhost('');
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
          <span className="text-[var(--text-muted)]" style={{ opacity: 0.4 }}>
            {ghost}
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
