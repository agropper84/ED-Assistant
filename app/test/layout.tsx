import './warm-tokens.css';

export default function TestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="warm-theme" style={{
      background: 'var(--warm-bg)',
      color: 'var(--warm-text)',
      minHeight: '100vh',
      fontFamily: 'var(--warm-font)',
    }}>
      {children}
    </div>
  );
}
