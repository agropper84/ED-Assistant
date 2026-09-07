'use client';

import { Sun, Moon, List, LayoutGrid, Columns2, Search, SlidersHorizontal } from 'lucide-react';
import { useBoard, type BoardNav } from '../../providers';

const NAV_OPTIONS: { key: BoardNav; icon: typeof List; label: string }[] = [
  { key: 'split', icon: Columns2, label: 'Split' },
  { key: 'list', icon: List, label: 'List' },
  { key: 'grid', icon: LayoutGrid, label: 'Grid' },
];

interface BoardHeaderProps {
  onSearchClick?: () => void;
  onAddClick?: () => void;
}

export function BoardHeader({ onSearchClick, onAddClick }: BoardHeaderProps = {}) {
  const { nav, setNav, patients, counts, sheetName } = useBoard();
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  };

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: 'var(--warm-surface)',
      borderBottom: '1px solid var(--warm-border)',
      padding: '12px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      flexWrap: 'wrap' as const,
    }}>
      {/* Title + meta */}
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: '17px', fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--warm-text)' }}>
          My Patient Board
        </div>
        <div style={{ fontSize: '12px', color: 'var(--warm-text-3)', fontVariantNumeric: 'tabular-nums', marginTop: '1px' }}>
          {sheetName} · {patients.length} patients · {counts.new} new, {counts.pending} pending
        </div>
      </div>

      {/* View switcher */}
      <div style={{
        display: 'flex',
        padding: '3px',
        borderRadius: '12px',
        background: 'var(--warm-surface-2)',
        gap: '2px',
      }}>
        {NAV_OPTIONS.map(opt => {
          const active = nav === opt.key;
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              onClick={() => setNav(opt.key)}
              title={opt.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '9px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all var(--warm-dur-fast) var(--warm-ease)',
                background: active ? 'var(--warm-surface)' : 'transparent',
                color: active ? 'var(--warm-accent)' : 'var(--warm-text-3)',
                boxShadow: active ? 'var(--warm-shadow)' : 'none',
              }}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>

      {/* Search field — opens command palette */}
      <button
        onClick={onSearchClick}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          flex: '1 1 180px', minWidth: '180px', maxWidth: '260px',
          height: '38px', padding: '0 12px',
          borderRadius: '11px',
          background: 'var(--warm-surface-2)',
          border: '1px solid var(--warm-border)',
          cursor: 'pointer', color: 'var(--warm-text-3)', fontSize: '13px',
          fontFamily: 'var(--warm-font)',
          transition: 'all var(--warm-dur-fast)',
        }}
      >
        <Search size={14} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' as const }}>Search patients…</span>
        <span style={{
          fontSize: '10px', fontWeight: 600, padding: '2px 6px',
          borderRadius: '5px', background: 'var(--warm-surface)',
          border: '1px solid var(--warm-border)',
        }}>⌘K</span>
      </button>

      {/* Settings */}
      <a
        href="/settings"
        style={{
          width: '38px', height: '38px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--warm-surface-2)', border: '1px solid var(--warm-border)',
          color: 'var(--warm-text-3)', textDecoration: 'none',
        }}
        title="Settings"
      >
        <SlidersHorizontal size={16} />
      </a>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--warm-surface-2)',
          border: '1px solid var(--warm-border)',
          cursor: 'pointer',
          color: 'var(--warm-text-3)',
          transition: 'all var(--warm-dur-fast)',
        }}
        title="Toggle theme"
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  );
}
