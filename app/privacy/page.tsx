'use client';

import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <a href="/login" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Back
        </a>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-8 space-y-6" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Privacy Policy</h1>
            <p className="text-sm text-[var(--text-muted)]">Last updated: March 19, 2026</p>
          </div>

          <div className="space-y-5 text-sm text-[var(--text-secondary)] leading-relaxed">
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">1. Introduction</h2>
              <p>
                My Patient Dashboard (&quot;the Application&quot;) is operated by Aaron Gropper, MD (&quot;the Developer&quot;). This Privacy Policy explains how the Application collects, uses, and protects your information.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">2. Information We Collect</h2>

              <h3 className="font-medium text-[var(--text-primary)]">a. Google Account Information</h3>
              <p>
                When you sign in with Google, we receive your name, email address, and Google user ID. This information is used solely for authentication and to identify your account within the Application.
              </p>

              <h3 className="font-medium text-[var(--text-primary)]">b. Session Data</h3>
              <p>
                We store encrypted session tokens (access token, refresh token) server-side to maintain your authenticated session and interact with Google services on your behalf. Session data is stored in a secure, encrypted Redis database and is not shared with third parties.
              </p>

              <h3 className="font-medium text-[var(--text-primary)]">c. User Preferences</h3>
              <p>
                Settings you configure (display preferences, encounter types, transcription settings) are stored server-side in an encrypted database associated with your user ID. Some preferences are stored locally in your browser.
              </p>

              <h3 className="font-medium text-[var(--text-primary)]">d. API Keys</h3>
              <p>
                If you provide API keys for third-party services (Anthropic, OpenAI, Deepgram), these are stored encrypted in our server-side database. They are used only to make API calls on your behalf and are never shared.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">3. Patient Data</h2>
              <p>
                Patient data you enter into the Application is stored exclusively in a Google Sheet within your own Google account. The Developer does not have access to, store, or process your patient data on any server controlled by the Developer. The Application accesses your Google Sheet only through your authenticated Google credentials and only while you are actively using the Application.
              </p>
              <p>
                When you use AI features (note generation, transcription, clinical questions), relevant data is sent to the third-party AI provider (Anthropic, OpenAI, or Deepgram) using your own API keys. The Developer does not have visibility into these requests. You are responsible for ensuring your use of these services complies with applicable privacy regulations.
              </p>
              <p>
                The Application offers optional PHI de-identification that strips patient identifiers before sending data to AI services, and optional AES-256-GCM encryption for data stored in Google Sheets.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">4. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Authenticate you and maintain your session.</li>
                <li>Read and write data to your Google Sheet on your behalf.</li>
                <li>Store your application preferences and settings.</li>
                <li>Send approval notification emails to the administrator when new users request access.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">5. Data Sharing</h2>
              <p>We do not sell, rent, or share your personal information with third parties except:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Google:</strong> Authentication and Google Sheets access via OAuth 2.0, using your credentials.</li>
                <li><strong>AI Providers:</strong> When you use AI features, data is sent to the provider (Anthropic, OpenAI, Deepgram) using your own API keys. These providers have their own privacy policies.</li>
                <li><strong>Resend:</strong> Your name and email may be included in admin notification emails sent via the Resend email service.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">6. Data Storage and Security</h2>
              <p>
                Session data and user settings are stored in an encrypted Redis database hosted by Redis Cloud. The Application is hosted on Vercel. All data in transit is encrypted via HTTPS/TLS. We use industry-standard security practices to protect your data, but no method of electronic storage is 100% secure.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">7. Data Retention</h2>
              <p>
                Session data is retained for the duration of your active session. User preferences and API keys are retained as long as your account exists. Patient data in your Google Sheet is under your control and is not managed by the Developer. If your access is revoked, your server-side data (settings, API keys) may be deleted.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">8. Google API Services</h2>
              <p>
                The Application&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements. We only request the minimum scopes necessary for the Application to function (user profile, Google Sheets, Google Drive).
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">9. Cookies and Local Storage</h2>
              <p>
                The Application uses a single encrypted session cookie for authentication. Local browser storage is used for user preferences (theme, parse format, billing settings). No tracking cookies or analytics are used.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">10. Your Rights</h2>
              <p>You may:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Request information about what data we store about you.</li>
                <li>Request deletion of your server-side data (settings, API keys, session).</li>
                <li>Revoke the Application&apos;s access to your Google account at any time via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">Google Account permissions</a>.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. Continued use of the Application after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">12. Contact</h2>
              <p>
                For questions or requests regarding this Privacy Policy, contact Aaron Gropper, MD at <a href="mailto:aaron@gropper.me" className="text-teal-600 hover:underline">aaron@gropper.me</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
