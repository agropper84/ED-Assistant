'use client';

import { useRouter } from 'next/navigation';
import { Clock, LogOut } from 'lucide-react';

export default function PendingPage() {
  const router = useRouter();

  const handleLogout = async () => {
    window.location.href = '/api/auth/logout';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-sm space-y-8 animate-fadeIn text-center">
        <div className="w-16 h-16 bg-amber-500 rounded-3xl flex items-center justify-center mx-auto" style={{ boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}>
          <Clock className="w-8 h-8 text-white" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Access Pending</h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            Your access request has been submitted. You&apos;ll receive access once the admin approves your request.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-sm hover:shadow-md hover:bg-[var(--bg-tertiary)] active:scale-[0.98] transition-all text-sm font-medium text-[var(--text-secondary)]"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
