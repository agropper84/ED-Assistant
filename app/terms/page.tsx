'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, LogOut } from 'lucide-react';

export default function TermsPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await fetch('/api/auth/accept-terms', { method: 'POST' });
      router.push('/');
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-lg animate-fadeIn">
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-8 space-y-6" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-gradient-to-br from-teal-400 to-teal-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-teal-500/25">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Beta Tester Agreement</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Please review and accept the following before continuing.
            </p>
          </div>

          <div className="bg-[var(--bg-tertiary)] rounded-xl p-5 space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed max-h-[50vh] overflow-y-auto">
            <p className="font-semibold text-[var(--text-primary)]">My Patient Dashboard — Beta Tester Terms of Use</p>

            <div className="space-y-3">
              <div>
                <p className="font-medium text-[var(--text-primary)]">1. Beta Software</p>
                <p>
                  This application is currently in active development and is provided on a beta basis for testing and evaluation purposes only. Features may change, be added, or be removed without notice. The application may contain bugs, errors, or interruptions in service.
                </p>
              </div>

              <div>
                <p className="font-medium text-[var(--text-primary)]">2. Intellectual Property</p>
                <p>
                  All source code, designs, concepts, features, algorithms, and intellectual property embodied in this application are the exclusive property of Aaron Gropper, MD. Access to this application as a beta tester does not grant any ownership, license, or rights to the underlying technology, code, or proprietary concepts.
                </p>
              </div>

              <div>
                <p className="font-medium text-[var(--text-primary)]">3. Confidentiality</p>
                <p>
                  As a beta tester, you agree to treat the application, its features, and its functionality as confidential. You agree not to share, reproduce, reverse-engineer, or distribute any aspect of the application, including screenshots, descriptions of functionality, or underlying concepts, without prior written consent.
                </p>
              </div>

              <div>
                <p className="font-medium text-[var(--text-primary)]">4. Feedback</p>
                <p>
                  Any feedback, suggestions, or ideas you provide regarding the application may be used freely for development purposes without obligation or compensation.
                </p>
              </div>

              <div>
                <p className="font-medium text-[var(--text-primary)]">5. No Warranty</p>
                <p>
                  This application is provided &quot;as is&quot; without warranty of any kind. It is not intended to replace clinical judgment or established medical practice. The developer assumes no liability for any outcomes related to the use of this application.
                </p>
              </div>

              <div>
                <p className="font-medium text-[var(--text-primary)]">6. Data</p>
                <p>
                  You are responsible for your own data and API keys. Patient data is stored in your own Google Sheet. The developer does not access, store, or have visibility into your patient data.
                </p>
              </div>

              <div>
                <p className="font-medium text-[var(--text-primary)]">7. Access</p>
                <p>
                  Beta access may be revoked at any time at the sole discretion of the developer. This agreement remains in effect for as long as you have access to the application.
                </p>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500 accent-teal-600 flex-shrink-0"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              I have read and agree to the Beta Tester Terms of Use. I acknowledge that all intellectual property belongs to Aaron Gropper, MD.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!agreed || submitting}
            className="w-full py-3.5 bg-teal-600 text-white rounded-xl font-medium disabled:opacity-40 hover:bg-teal-700 active:scale-[0.97] transition-all"
          >
            {submitting ? 'Processing...' : 'Accept & Continue'}
          </button>

          <button
            onClick={() => { window.location.href = '/api/auth/logout'; }}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Decline & Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
