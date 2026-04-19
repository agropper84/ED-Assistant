'use client';

import { useState } from 'react';
import {
  Loader2, RefreshCw, Copy, Check,
  Heart, Pill, AlertTriangle, Users, Home,
  ChevronDown, ChevronUp
} from 'lucide-react';
import type { PatientProfile as ProfileData } from '@/app/api/profile/route';

interface PatientProfileProps {
  profile: ProfileData | null;
  age?: string;
  gender?: string;
  onGenerate: () => Promise<void>;
  generating?: boolean;
}

function ProfileSection({ icon: Icon, label, items, color }: {
  icon: React.ElementType;
  label: string;
  items: string[];
  color: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-1`}>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</span>
      </div>
      <ul className="space-y-0.5 ml-5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-[var(--text-secondary)] leading-snug">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PatientProfile({ profile, age, gender, onGenerate, generating }: PatientProfileProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const hasProfile = profile && (
    profile.pmhx.length > 0 ||
    profile.medications.length > 0 ||
    profile.allergies.length > 0 ||
    profile.socialHistory.length > 0 ||
    profile.familyHistory.length > 0
  );

  const copyProfile = () => {
    if (!profile) return;
    const lines: string[] = [];
    if (profile.presentingIssue) lines.push(`Presenting: ${profile.presentingIssue}`);
    if (profile.age || age) lines.push(`Age: ${profile.age || age}`);
    if (profile.gender || gender) lines.push(`Gender: ${profile.gender || gender}`);
    if (profile.pmhx.length) lines.push(`PMHx: ${profile.pmhx.join(', ')}`);
    if (profile.medications.length) lines.push(`Medications: ${profile.medications.join(', ')}`);
    if (profile.allergies.length) lines.push(`Allergies: ${profile.allergies.join(', ')}`);
    if (profile.socialHistory.length) lines.push(`Social Hx: ${profile.socialHistory.join(', ')}`);
    if (profile.familyHistory.length) lines.push(`Family Hx: ${profile.familyHistory.join(', ')}`);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] border-l-2 border-l-rose-500/40 overflow-hidden hover:shadow-lg hover:-translate-y-px transition-all duration-200" style={{ boxShadow: 'var(--card-shadow)' }}>
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none hover:bg-[var(--bg-tertiary)]/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-widest">
          Patient Profile
        </h3>
        <div className="flex items-center gap-1">
          {hasProfile && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); copyProfile(); }}
                className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                title="Copy profile"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onGenerate(); }}
                disabled={generating}
                className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                title="Refresh profile"
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
              </button>
            </>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </div>
      </div>

      {hasProfile && expanded ? (
        <div className="px-5 pb-5 space-y-3">
          {/* Presenting issue */}
          {profile.presentingIssue && (
            <p className="text-sm text-[var(--text-primary)] font-medium leading-snug italic">
              {profile.presentingIssue}
            </p>
          )}

          {/* Demographics row */}
          {(profile.age || age || profile.gender || gender) && (
            <div className="flex gap-4 text-sm">
              {(profile.age || age) && (
                <span className="text-[var(--text-secondary)]">
                  <span className="text-[var(--text-muted)]">Age:</span> {profile.age || age}
                </span>
              )}
              {(profile.gender || gender) && (
                <span className="text-[var(--text-secondary)]">
                  <span className="text-[var(--text-muted)]">Sex:</span> {profile.gender || gender}
                </span>
              )}
            </div>
          )}

          <ProfileSection
            icon={Heart}
            label="PMHx"
            items={profile.pmhx}
            color="text-rose-500 dark:text-rose-400"
          />
          <ProfileSection
            icon={Pill}
            label="Medications"
            items={profile.medications}
            color="text-indigo-500 dark:text-indigo-400"
          />
          <ProfileSection
            icon={AlertTriangle}
            label="Allergies"
            items={profile.allergies}
            color="text-amber-500 dark:text-amber-400"
          />
          <ProfileSection
            icon={Home}
            label="Social Hx"
            items={profile.socialHistory}
            color="text-teal-500 dark:text-teal-400"
          />
          <ProfileSection
            icon={Users}
            label="Family Hx"
            items={profile.familyHistory}
            color="text-purple-500 dark:text-purple-400"
          />
        </div>
      ) : expanded ? (
        <div className="px-5 pb-5">
          <button
            onClick={onGenerate}
            disabled={generating}
            className="w-full py-2.5 border border-dashed border-[var(--border)] text-[var(--text-muted)] rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[var(--bg-tertiary)] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Extracting Profile...
              </>
            ) : (
              <>
                <Heart className="w-4 h-4" />
                Generate Patient Profile
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Compact inline profile summary for use in PatientCard hover tooltips */
export function ProfileSummary({ profile }: { profile: ProfileData }) {
  const sections: { label: string; items: string[]; color: string }[] = [
    { label: 'PMHx', items: profile.pmhx, color: 'text-rose-400' },
    { label: 'Meds', items: profile.medications, color: 'text-indigo-400' },
    { label: 'Allergies', items: profile.allergies, color: 'text-amber-400' },
    { label: 'Social', items: profile.socialHistory, color: 'text-teal-400' },
    { label: 'FHx', items: profile.familyHistory, color: 'text-purple-400' },
  ];

  const activeSections = sections.filter(s => s.items.length > 0);
  if (activeSections.length === 0) return <p className="text-gray-400 italic">No profile data</p>;

  return (
    <div className="space-y-1.5">
      {profile.presentingIssue && (
        <p className="text-gray-100 font-medium italic mb-1">{profile.presentingIssue}</p>
      )}
      {activeSections.map(({ label, items, color }) => (
        <div key={label}>
          <span className={`${color} font-medium`}>{label}:</span>{' '}
          <span className="text-gray-200">{items.join(', ')}</span>
        </div>
      ))}
    </div>
  );
}
