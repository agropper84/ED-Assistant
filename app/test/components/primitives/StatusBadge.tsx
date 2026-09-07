'use client';

type Status = 'new' | 'pending' | 'done' | 'processed';

const STATUS_CONFIG: Record<string, { label: string; bgVar: string; fgVar: string }> = {
  new:       { label: 'NEW',     bgVar: '--warm-status-new-bg',     fgVar: '--warm-status-new-fg' },
  pending:   { label: 'PENDING', bgVar: '--warm-status-pending-bg', fgVar: '--warm-status-pending-fg' },
  done:      { label: 'DONE',    bgVar: '--warm-status-done-bg',    fgVar: '--warm-status-done-fg' },
  processed: { label: 'DONE',    bgVar: '--warm-status-done-bg',    fgVar: '--warm-status-done-fg' },
};

export function StatusBadge({ status }: { status: Status | string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--warm-radius-pill)',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase' as const,
        background: `var(${config.bgVar})`,
        color: `var(${config.fgVar})`,
        lineHeight: '1.4',
      }}
    >
      {config.label}
    </span>
  );
}
