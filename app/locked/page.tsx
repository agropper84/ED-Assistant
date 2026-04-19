'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Shield } from 'lucide-react';

export default function LockedPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'pin' | 'totp'>('pin');

  const handlePinSubmit = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/pin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.push('/');
      } else {
        const data = await res.json();
        setError(data.error || 'Incorrect PIN');
        setPin('');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async () => {
    if (totpCode.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/totp-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode, unlock: true }),
      });
      if (res.ok) {
        router.push('/');
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid code');
        setTotpCode('');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleFullLogin = () => {
    window.location.href = '/api/auth/logout';
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary, #0f172a)' }}>
      <div className="w-full max-w-xs p-8 text-center">
        {/* Lock icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{
          background: 'linear-gradient(135deg, rgba(96,165,250,0.15), rgba(59,130,246,0.1))',
        }}>
          <Lock className="w-7 h-7 text-blue-400" />
        </div>

        <h1 className="text-lg font-semibold text-white mb-1">Session Locked</h1>
        <p className="text-xs text-white/40 mb-8">Enter your PIN or authenticator code to continue</p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* PIN mode */}
        {mode === 'pin' && (
          <div>
            <div className="flex justify-center gap-2 mb-6">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className="w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all"
                  style={{
                    borderColor: pin.length > i ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.1)',
                    background: pin.length > i ? 'rgba(96,165,250,0.08)' : 'transparent',
                    color: 'white',
                  }}
                >
                  {pin.length > i ? '•' : ''}
                </div>
              ))}
            </div>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                setPin(val);
                if (val.length === 4) setTimeout(() => handlePinSubmit(), 100);
              }}
              autoFocus
              className="sr-only"
            />
            {/* Visible num pad */}
            <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((n, i) => (
                n === null ? <div key={i} /> :
                <button
                  key={i}
                  onClick={() => {
                    if (n === 'del') { setPin(p => p.slice(0, -1)); return; }
                    if (pin.length >= 4) return;
                    const next = pin + n;
                    setPin(next);
                    if (next.length === 4) {
                      setPin(next);
                      setTimeout(() => {
                        setLoading(true);
                        fetch('/api/auth/pin-verify', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ pin: next }),
                        }).then(r => {
                          if (r.ok) router.push('/');
                          else { r.json().then(d => setError(d.error || 'Incorrect PIN')); setPin(''); }
                        }).catch(() => setError('Connection error')).finally(() => setLoading(false));
                      }, 150);
                    }
                  }}
                  disabled={loading}
                  className="h-12 rounded-xl text-lg font-medium text-white/80 hover:bg-white/10 active:bg-white/15 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  {n === 'del' ? '⌫' : n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TOTP mode */}
        {mode === 'totp' && (
          <div>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={totpCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setTotpCode(val);
                if (val.length === 6) setTimeout(() => handleTotpSubmit(), 100);
              }}
              placeholder="6-digit code"
              autoFocus
              className="w-full px-4 py-3 text-center text-xl font-mono tracking-[0.3em] rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:border-blue-400/50 focus:outline-none mb-4"
            />
            <button
              onClick={handleTotpSubmit}
              disabled={totpCode.length !== 6 || loading}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Verify
            </button>
          </div>
        )}

        {/* Mode switch */}
        <div className="mt-6 flex items-center justify-center gap-4">
          {mode === 'totp' && (
            <button onClick={() => { setMode('pin'); setError(''); }} className="text-[10px] text-white/30 hover:text-white/50 transition-colors">
              Use PIN instead
            </button>
          )}
          {mode === 'pin' && (
            <button onClick={() => { setMode('totp'); setError(''); }} className="text-[10px] text-white/30 hover:text-white/50 transition-colors">
              Use authenticator
            </button>
          )}
        </div>

        {/* Full login option */}
        <button
          onClick={handleFullLogin}
          className="mt-8 text-[10px] text-white/20 hover:text-white/40 transition-colors"
        >
          Sign in with Google instead
        </button>
      </div>
    </div>
  );
}
