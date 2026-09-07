'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Command, Search, Mic, Sparkles, Plus, FileText, Moon, Sun } from 'lucide-react';
import { useBoard, useShell } from '../../providers';
import type { Patient } from '@/lib/google-sheets';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  detail?: string;
  icon?: React.ReactNode;
  action: () => void;
  group: string;
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function getStatus(p: Patient): string {
  if (p.status === 'processed' || p.hpi || p.objective || p.assessmentPlan) return 'done';
  if (p.status === 'pending' || p.transcript || p.encounterNotes) return 'pending';
  return 'new';
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { patients, setSelectedId, setNav } = useBoard();
  const { showToast } = useShell();

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Build command list
  const items: CommandItem[] = [];

  // Patient matches
  if (query.trim()) {
    const matches = patients
      .filter(p => fuzzyMatch(query, p.name || '') || fuzzyMatch(query, p.diagnosis || ''))
      .slice(0, 4);
    for (const p of matches) {
      const status = getStatus(p);
      items.push({
        id: `patient-${p.rowIndex}`,
        label: p.name || 'Unnamed',
        detail: [p.age, p.gender, p.diagnosis, status.toUpperCase()].filter(Boolean).join(' · '),
        icon: <FileText size={15} style={{ color: 'var(--warm-text-3)' }} />,
        group: 'PATIENTS',
        action: () => { setSelectedId(p.rowIndex); setNav('split'); onClose(); },
      });
    }
  }

  // Global actions
  const actions: CommandItem[] = [
    {
      id: 'add-patient', label: 'Add patient', detail: 'Create a new patient entry',
      icon: <Plus size={15} style={{ color: 'var(--warm-accent)' }} />, group: 'ACTIONS',
      action: () => { onClose(); showToast('Add Patient coming soon'); },
    },
    {
      id: 'toggle-theme', label: 'Toggle dark mode', detail: 'Switch light/dark theme',
      icon: <Sun size={15} style={{ color: 'var(--warm-text-3)' }} />, group: 'ACTIONS',
      action: () => { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); onClose(); },
    },
  ];

  const filteredActions = query.trim()
    ? actions.filter(a => fuzzyMatch(query, a.label))
    : actions;

  items.push(...filteredActions);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[activeIdx]?.action(); }
    else if (e.key === 'Escape') { onClose(); }
  }, [items, activeIdx, onClose]);

  // Reset active index when query changes
  useEffect(() => { setActiveIdx(0); }, [query]);

  if (!open) return null;

  // Group items
  const groups: Record<string, CommandItem[]> = {};
  for (const item of items) {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  }

  let globalIdx = 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,25,23,0.34)',
        backdropFilter: 'blur(3px)',
        display: 'flex', justifyContent: 'center', paddingTop: '80px',
        animation: 'warm-fadeIn 150ms ease-out both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, calc(100% - 32px))',
          maxHeight: 'min(480px, calc(100vh - 160px))',
          background: 'var(--warm-surface)',
          borderRadius: '18px',
          boxShadow: 'var(--warm-shadow-hover)',
          border: '1px solid var(--warm-border)',
          display: 'flex',
          flexDirection: 'column' as const,
          overflow: 'hidden',
          animation: 'warm-scaleIn 200ms var(--warm-ease) both',
          alignSelf: 'flex-start',
        }}
      >
        {/* Search header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '14px 18px',
          borderBottom: '1px solid var(--warm-border)',
        }}>
          <Command size={18} style={{ color: 'var(--warm-accent)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Patient name, or an action…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: '16px', color: 'var(--warm-text)', fontFamily: 'var(--warm-font)',
            }}
          />
          <span style={{
            fontSize: '10px', color: 'var(--warm-text-3)', fontWeight: 600,
            padding: '3px 7px', borderRadius: '6px',
            background: 'var(--warm-surface-2)', border: '1px solid var(--warm-border)',
          }}>
            ESC
          </span>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto' as const, padding: '6px 0' }}>
          {Object.entries(groups).map(([group, groupItems]) => (
            <div key={group}>
              <div style={{
                padding: '10px 18px 4px',
                fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em',
                color: 'var(--warm-text-3)', textTransform: 'uppercase' as const,
              }}>
                {group}
              </div>
              {groupItems.map((item) => {
                const idx = globalIdx++;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setActiveIdx(idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      width: '100%', padding: '10px 18px', minHeight: '46px',
                      border: 'none', cursor: 'pointer', textAlign: 'left' as const,
                      fontFamily: 'var(--warm-font)',
                      background: isActive ? 'var(--warm-accent-soft)' : 'transparent',
                      transition: 'background 80ms',
                    }}
                  >
                    {item.icon}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--warm-text)' }}>
                        {item.label}
                      </div>
                      {item.detail && (
                        <div style={{
                          fontSize: '12px', color: 'var(--warm-text-3)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                        }}>
                          {item.detail}
                        </div>
                      )}
                    </div>
                    {isActive && (
                      <span style={{
                        fontSize: '10px', color: 'var(--warm-text-3)',
                        padding: '2px 6px', borderRadius: '4px',
                        background: 'var(--warm-surface-2)', border: '1px solid var(--warm-border)',
                      }}>
                        ⏎
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {items.length === 0 && (
            <div style={{ padding: '30px 20px', textAlign: 'center' as const, color: 'var(--warm-text-3)', fontSize: '13px' }}>
              No matches for "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 18px',
          borderTop: '1px solid var(--warm-border)',
          fontSize: '11px', color: 'var(--warm-text-3)',
        }}>
          ⏎ run first result · ⌘K anywhere
        </div>
      </div>
    </div>
  );
}
