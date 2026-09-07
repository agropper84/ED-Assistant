'use client';

export type ChartTab = 'encounter' | 'transcript' | 'billing' | 'ask' | 'data';

const TABS: { key: ChartTab; label: string }[] = [
  { key: 'encounter', label: 'Encounter' },
  { key: 'transcript', label: 'Transcript' },
  { key: 'billing', label: 'Billing' },
  { key: 'ask', label: 'Ask' },
  { key: 'data', label: 'Data' },
];

interface ChartTabsProps {
  active: ChartTab;
  onChange: (tab: ChartTab) => void;
}

export function ChartTabs({ active, onChange }: ChartTabsProps) {
  return (
    <div style={{
      display: 'flex',
      gap: '22px',
      borderBottom: '1px solid var(--warm-border)',
      padding: '0 22px',
      overflowX: 'auto' as const,
    }}>
      {TABS.map(tab => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              padding: '10px 0',
              fontSize: '13px',
              fontWeight: isActive ? 650 : 400,
              color: isActive ? 'var(--warm-text)' : 'var(--warm-text-3)',
              borderBottom: isActive ? '2px solid var(--warm-accent)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              borderBottomStyle: 'solid',
              borderBottomWidth: '2px',
              borderBottomColor: isActive ? 'var(--warm-accent)' : 'transparent',
              cursor: 'pointer',
              transition: 'all var(--warm-dur-fast) var(--warm-ease)',
              whiteSpace: 'nowrap' as const,
              fontFamily: 'var(--warm-font)',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
