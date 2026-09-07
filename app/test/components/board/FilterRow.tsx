'use client';

import { Plus } from 'lucide-react';
import { useBoard, type BoardFilter } from '../../providers';

const FILTERS: { key: BoardFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'new', label: 'NEW' },
  { key: 'pending', label: 'PENDING' },
  { key: 'done', label: 'DONE' },
];

export function FilterRow() {
  const { filter, setFilter, counts } = useBoard();

  const countMap: Record<BoardFilter, number> = {
    all: counts.all,
    new: counts.new,
    pending: counts.pending,
    done: counts.done,
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap' as const,
      padding: '14px 18px 10px',
    }}>
      {FILTERS.map(f => {
        const active = filter === f.key;
        return (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: 'var(--warm-radius-pill)',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
              transition: 'all var(--warm-dur-fast) var(--warm-ease)',
              border: active ? '1px solid var(--warm-accent-ring)' : '1px solid var(--warm-border)',
              background: active ? 'var(--warm-accent-soft)' : 'var(--warm-surface)',
              color: active ? 'var(--warm-accent)' : 'var(--warm-text-3)',
              height: '32px',
            }}
          >
            {f.label}
            <span style={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
            }}>
              {countMap[f.key]}
            </span>
          </button>
        );
      })}

      {/* Add Patient button */}
      <button
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '6px 14px',
          borderRadius: 'var(--warm-radius-pill)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          height: '32px',
          background: 'var(--warm-accent)',
          color: '#fff',
          border: 'none',
          marginLeft: 'auto',
          transition: 'all var(--warm-dur-fast) var(--warm-ease)',
          boxShadow: 'var(--warm-fab-shadow)',
        }}
      >
        <Plus size={14} strokeWidth={2.5} />
        Add Patient
      </button>
    </div>
  );
}
