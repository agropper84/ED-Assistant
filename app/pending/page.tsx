'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LogOut, RefreshCw, CheckCircle } from 'lucide-react';

export default function PendingPage() {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for approval status every 5 seconds
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/auth/check-status');
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'approved') {
          setApproved(true);
          if (intervalRef.current) clearInterval(intervalRef.current);
          // Brief delay to show the approved state, then redirect
          setTimeout(() => router.push('/'), 1500);
        }
      } catch {}
    };

    checkStatus();
    intervalRef.current = setInterval(checkStatus, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [router]);

  const handleResend = async () => {
    setResending(true);
    setError('');
    try {
      const res = await fetch('/api/auth/resend-approval', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resend');
      }
      setResent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to resend request');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-sm space-y-8 animate-fadeIn text-center">
        {approved ? (
          <>
            <div className="w-16 h-16 bg-teal-500 rounded-3xl flex items-center justify-center mx-auto" style={{ boxShadow: '0 4px 14px rgba(20,184,166,0.3)' }}>
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Access Approved!</h1>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                Redirecting you to the dashboard...
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-amber-500 rounded-3xl flex items-center justify-center mx-auto" style={{ boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}>
              <Clock className="w-8 h-8 text-white" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Access Pending</h1>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                Your access request has been submitted. This page will automatically update once the admin approves your request.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleResend}
                disabled={resending || resent}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-teal-600 text-white rounded-xl shadow-sm hover:bg-teal-700 active:scale-[0.98] transition-all text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
                {resent ? 'Request Sent' : resending ? 'Sending...' : 'Resend Approval Request'}
              </button>

              {resent && (
                <p className="text-xs text-teal-600">Approval request sent to the admin.</p>
              )}
              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}

              <button
                onClick={() => { window.location.href = '/api/auth/logout'; }}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm hover:shadow-md hover:bg-[var(--bg-tertiary)] active:scale-[0.98] transition-all text-sm font-medium text-[var(--text-secondary)]"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
