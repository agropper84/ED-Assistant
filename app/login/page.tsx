'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: Record<string, string> = {
    access_denied: 'Access was denied. Please try again.',
    missing_params: 'Invalid login request. Please try again.',
    invalid_state: 'Session expired. Please try again.',
    no_tokens: 'Failed to get authorization. Please try again.',
    no_user_info: 'Could not retrieve your profile. Please try again.',
    callback_failed: 'Login failed. Please try again.',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4 relative overflow-hidden">
      {/* Background gradient accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-teal-500/5 dark:bg-teal-500/10 rounded-full blur-3xl -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500/5 dark:bg-blue-500/8 rounded-full blur-3xl translate-y-1/2 pointer-events-none" />

      <div className="w-full max-w-[400px] animate-fadeIn relative">
        {/* Card */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-8 space-y-7" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
          {/* Logo / Title */}
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-teal-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-teal-500/25 dark:shadow-teal-500/15">
              <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="none">
                {/* Clipboard body */}
                <rect x="5" y="4" width="14" height="17" rx="2" fill="white" />
                {/* Clip tab */}
                <path d="M9 2.5h6a1 1 0 011 1V5H8V3.5a1 1 0 011-1z" fill="white" />
                <rect x="8" y="2" width="8" height="3" rx="1" fill="white" stroke="#2d8a7e" strokeWidth="0.75" />
                <circle cx="12" cy="2.75" r="0.6" fill="#2d8a7e" />
                {/* Heartbeat line */}
                <polyline points="6.5,14 9.5,14 10.5,10 12,17 13.5,12 14.5,14 17.5,14" fill="none" stroke="#2d8a7e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                {/* Dots */}
                <circle cx="12" cy="18.5" r="0.6" fill="#2d8a7e" />
                <circle cx="14" cy="18.5" r="0.6" fill="#2d8a7e" />
                <circle cx="16" cy="18.5" r="0.6" fill="#2d8a7e" />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-wide text-[var(--text-primary)]">My Patient Dashboard</h1>
              <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
                AI-powered clinical documentation, transcription, and workflow.
              </p>
            </div>
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: '🎙', label: 'Voice Dictation' },
              { icon: '📋', label: 'Auto Charting' },
              { icon: '🔍', label: 'Evidence Search' },
              { icon: '🔒', label: 'Privacy Controls' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-lg">
                <span className="text-sm">{icon}</span>
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
              </div>
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-3 text-[13px] text-red-600 dark:text-red-400">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>{errorMessages[error] || 'An error occurred. Please try again.'}</span>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-medium">Sign in</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          {/* Sign In Button */}
          <a
            href="/api/auth/login"
            className="group flex items-center justify-center gap-3 w-full py-3.5 px-4 bg-[var(--bg-primary)] border border-[var(--card-border)] rounded-xl hover:border-teal-300 dark:hover:border-teal-800 hover:shadow-md hover:shadow-teal-500/5 active:scale-[0.98] transition-all duration-200 font-medium text-[14px] text-[var(--text-primary)]"
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>

          {/* Footer info */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Your data stays in your own Google Sheet</span>
            </div>
            <p className="text-[11px] text-center text-[var(--text-muted)]">
              Bring your own Claude and OpenAI API keys
            </p>
          </div>
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <a href="/tos" className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">Terms of Service</a>
          <span className="text-[10px] text-[var(--text-muted)]">·</span>
          <a href="/privacy" className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">Privacy Policy</a>
          <span className="text-[10px] text-[var(--text-muted)]">·</span>
          <span className="text-[10px] text-[var(--text-muted)] tracking-wide">mypatientboard.com</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
