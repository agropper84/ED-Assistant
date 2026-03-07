'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Patient } from '@/lib/google-sheets';
import { getPromptTemplates } from '@/lib/settings';
import { PatientCard } from '@/components/PatientCard';
import { ParseModal } from '@/components/ParseModal';
import { PatientDataModal } from '@/components/PatientDataModal';
import { BatchTranscribeModal } from '@/components/BatchTranscribeModal';
import { InlineBilling } from '@/components/BillingSection';
import {
  BillingItem,
  parseBillingItems,
} from '@/lib/billing';
import {
  Plus, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Calendar, Settings, CheckSquare, Square, Play, Clock, EyeOff, Eye,
  Search, ArrowUpDown, X, LogOut, Upload, Shield, Monitor
} from 'lucide-react';

function formatDateForSheet(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

function formatDateDisplay(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';

  return formatDateForSheet(date);
}

export default function HomePage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showParseModal, setShowParseModal] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('ed-app-current-date');
      if (saved) {
        const d = new Date(saved);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return new Date();
  });
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);

  // Shift time state
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [shiftHours, setShiftHours] = useState('');
  const [shiftFeeType, setShiftFeeType] = useState('');
  const [shiftCode, setShiftCode] = useState('');
  const [shiftTotal, setShiftTotal] = useState('');

  // Patient data modal
  const [dataModalPatient, setDataModalPatient] = useState<Patient | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Batch processing state
  const [batchMode, setBatchMode] = useState(false);
  const [selectedPatients, setSelectedPatients] = useState<Set<number>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  // Privacy
  const [anonymize, setAnonymize] = useState(false);
  const [awayScreen, setAwayScreen] = useState(false);
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);
  const [awayTime, setAwayTime] = useState('');
  const [awayWeather, setAwayWeather] = useState<{ temp: string; desc: string; location: string } | null>(null);

  // Dashboard billing
  const [billingPatientIdx, setBillingPatientIdx] = useState<number | null>(null);

  // User info
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');

  // Batch transcribe
  const [showBatchTranscribe, setShowBatchTranscribe] = useState(false);
  const [sharedFile, setSharedFile] = useState<File | undefined>(undefined);
  const [sharedTranscript, setSharedTranscript] = useState<string | undefined>(undefined);

  // Autocomplete suggestions
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const suggestionsLoaded = useRef(false);

  // Search and sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'name'>('time');

  const sheetName = formatDateForSheet(currentDate);
  const isToday = (() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const d = new Date(currentDate); d.setHours(0, 0, 0, 0);
    return d.getTime() === t.getTime();
  })();

  const fetchPatients = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/patients?sheet=${encodeURIComponent(sheetName)}`);
      if (res.status === 403) { window.location.href = '/pending'; return; }
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      setPatients(data.patients || []);
      if (data.shiftTimes) {
        setShiftStart(data.shiftTimes.start || '');
        setShiftEnd(data.shiftTimes.end || '');
        setShiftHours(data.shiftTimes.hours || '');
        setShiftFeeType(data.shiftTimes.feeType || '');
        setShiftCode(data.shiftTimes.code || '');
        setShiftTotal(data.shiftTimes.total || '');
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchSheets = async () => {
    try {
      const res = await fetch('/api/patients?listSheets=1');
      const data = await res.json();
      setAvailableSheets(data.sheets || []);
    } catch (error) {
      console.error('Failed to fetch sheets:', error);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchPatients();
    fetchSheets();
  }, [sheetName]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setUserEmail(data.email || '');
          setUserName(data.name || '');
        }
      })
      .catch(() => {});
  }, []);

  // Fetch autocomplete suggestions once per session
  useEffect(() => {
    if (suggestionsLoaded.current) return;
    suggestionsLoaded.current = true;
    fetch('/api/suggestions')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.sentences) setSuggestions(data.sentences);
      })
      .catch(() => {});
  }, []);

  // Web Share Target: detect ?share=1 and retrieve cached audio
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('share') !== '1') return;

    // Clean up URL immediately
    window.history.replaceState({}, '', '/');

    (async () => {
      try {
        const cache = await caches.open('share-target');
        const response = await cache.match('/shared-audio');
        if (!response) return;

        const blob = await response.blob();
        const fileName = response.headers.get('X-File-Name') || 'shared-audio.m4a';
        const file = new File([blob], fileName, { type: blob.type || 'audio/mp4' });

        // Delete the cache entry
        await cache.delete('/shared-audio');

        setSharedFile(file);
        setShowBatchTranscribe(true);
      } catch (err) {
        console.error('Failed to retrieve shared audio:', err);
      }
    })();
  }, []);

  // iOS Shortcut: detect ?transcript={id} and fetch pre-transcribed text
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transcriptId = params.get('transcript');
    if (!transcriptId) return;

    // Clean up URL immediately
    window.history.replaceState({}, '', '/');

    (async () => {
      try {
        const res = await fetch(`/api/shortcuts/transcript/${encodeURIComponent(transcriptId)}`);
        if (!res.ok) {
          console.error('Failed to fetch shortcut transcript:', res.status);
          return;
        }
        const { transcript } = await res.json();
        setSharedTranscript(transcript);
        setShowBatchTranscribe(true);
      } catch (err) {
        console.error('Failed to fetch shortcut transcript:', err);
      }
    })();
  }, []);

  const handleSavePatient = async (data: any) => {
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, _sheetName: sheetName }),
      });

      if (res.ok) {
        const { rowIndex, sheetName: savedSheet } = await res.json();
        fetchPatients();
        router.push(`/patient/${rowIndex}?sheet=${encodeURIComponent(savedSheet)}`);

        // Fire-and-forget: auto-generate synopsis and DDx/management/evidence
        const body = JSON.stringify({ rowIndex, sheetName: savedSheet });
        const headers = { 'Content-Type': 'application/json' };
        fetch('/api/synopsis', { method: 'POST', headers, body }).catch(() => {});
        fetch('/api/analysis', { method: 'POST', headers, body }).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to save patient:', error);
    }
  };

  const handleShiftTimeSave = async (overrides?: { start?: string; end?: string }) => {
    const s = overrides?.start ?? shiftStart;
    const e = overrides?.end ?? shiftEnd;
    try {
      const res = await fetch('/api/patients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetName,
          shiftStart: s,
          shiftEnd: e,
        }),
      });
      const data = await res.json();
      if (data.shiftTimes) {
        setShiftHours(data.shiftTimes.hours || '');
        setShiftFeeType(data.shiftTimes.feeType || '');
        setShiftCode(data.shiftTimes.code || '');
        setShiftTotal(data.shiftTimes.total || '');
      }
    } catch (error) {
      console.error('Failed to save shift time:', error);
    }
  };

  const handleDeletePatient = async (patient: Patient) => {
    setDeleting(true);
    try {
      const sheetParam = `?sheet=${encodeURIComponent(patient.sheetName)}`;
      await fetch(`/api/patients/${patient.rowIndex}${sheetParam}`, {
        method: 'DELETE',
      });
      setDeleteConfirm(null);
      fetchPatients();
    } catch (error) {
      console.error('Failed to delete patient:', error);
    } finally {
      setDeleting(false);
    }
  };

  const changeDate = (date: Date) => {
    setCurrentDate(date);
    sessionStorage.setItem('ed-app-current-date', date.toISOString());
  };

  const goToPreviousDay = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 1);
    changeDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 1);
    changeDate(next);
  };

  const goToToday = () => {
    changeDate(new Date());
  };

  // Away screen: update clock every second and fetch weather
  useEffect(() => {
    if (!awayScreen) return;
    const tick = () => {
      const now = new Date();
      setAwayTime(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }));
    };
    tick();
    const interval = setInterval(tick, 1000);

    // Fetch weather
    if (!awayWeather && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`);
            if (res.ok) {
              const data = await res.json();
              const temp = Math.round(data.current.temperature_2m);
              const code = data.current.weather_code;
              const descriptions: Record<number, string> = {
                0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
                45: 'Foggy', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
                61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
                75: 'Heavy snow', 80: 'Rain showers', 81: 'Moderate showers', 82: 'Heavy showers',
                95: 'Thunderstorm', 96: 'Thunderstorm with hail',
              };
              setAwayWeather({ temp: `${temp}°C`, desc: descriptions[code] || 'Unknown', location: data.timezone?.split('/').pop()?.replace(/_/g, ' ') || '' });
            }
          } catch {}
        },
        () => {
          setAwayWeather({ temp: '', desc: '', location: '' });
        }
      );
    }

    return () => clearInterval(interval);
  }, [awayScreen, awayWeather]);

  // Close privacy menu on outside click
  const privacyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!privacyMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (privacyRef.current && !privacyRef.current.contains(e.target as Node)) {
        setPrivacyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [privacyMenuOpen]);

  // Filter and sort patients
  const filteredPatients = searchQuery.trim()
    ? patients.filter(p => {
        const q = searchQuery.toLowerCase();
        return (
          p.name?.toLowerCase().includes(q) ||
          p.diagnosis?.toLowerCase().includes(q) ||
          p.triageVitals?.split('\n')[0]?.toLowerCase().includes(q)
        );
      })
    : patients;

  const sortedPatients = [...filteredPatients].sort((a, b) => {
    if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    }
    // sort by time (HH:MM string comparison works for 24h format)
    return (a.timestamp || '').localeCompare(b.timestamp || '');
  });

  // Batch processing
  const pendingPatients = sortedPatients.filter(p => p.status === 'pending');
  const processedPatients = sortedPatients.filter(p => p.status === 'processed');
  const newPatients = sortedPatients.filter(p => p.status === 'new');
  const hasPending = pendingPatients.length > 0;

  const togglePatientSelection = (rowIndex: number) => {
    const newSelected = new Set(selectedPatients);
    if (newSelected.has(rowIndex)) {
      newSelected.delete(rowIndex);
    } else {
      newSelected.add(rowIndex);
    }
    setSelectedPatients(newSelected);
  };

  const selectAll = () => {
    setSelectedPatients(new Set(pendingPatients.map(p => p.rowIndex)));
  };

  const handleBatchProcess = async () => {
    const toProcess = selectedPatients.size > 0
      ? pendingPatients.filter(p => selectedPatients.has(p.rowIndex))
      : pendingPatients;

    if (toProcess.length === 0) return;

    setBatchProcessing(true);
    setBatchProgress({ current: 0, total: toProcess.length });
    let failures = 0;

    for (let i = 0; i < toProcess.length; i++) {
      setBatchProgress({ current: i + 1, total: toProcess.length });
      try {
        const res = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndex: toProcess[i].rowIndex, sheetName, promptTemplates: getPromptTemplates() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error(`Failed to process ${toProcess[i].name}:`, err.detail || err.error);
          failures++;
        }
      } catch (error) {
        console.error(`Failed to process patient ${toProcess[i].name}:`, error);
        failures++;
      }
    }

    setBatchProcessing(false);
    setBatchMode(false);
    setSelectedPatients(new Set());
    fetchPatients();
    if (failures > 0) {
      alert(`${failures} of ${toProcess.length} patients failed to process. Check console for details.`);
    }
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedPatients(new Set());
  };

  const handleTimeChange = async (patient: Patient, newTime: string) => {
    try {
      await fetch(`/api/patients/${patient.rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: newTime, _sheetName: patient.sheetName }),
      });
      fetchPatients();
    } catch (error) {
      console.error('Failed to update time:', error);
    }
  };

  const handleDashboardBillingSave = async (patient: Patient, items: BillingItem[], comments?: string) => {
    try {
      await fetch(`/api/patients/${patient.rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _billingItems: items,
          ...(comments !== undefined ? { comments } : {}),
          _sheetName: patient.sheetName,
        }),
      });
      fetchPatients();
    } catch (error) {
      console.error('Failed to save billing:', error);
    }
  };

  const toggleBilling = (rowIndex: number) => {
    setBillingPatientIdx(prev => prev === rowIndex ? null : rowIndex);
  };

  const renderPatientWithBilling = (patient: Patient) => {
    const items = parseBillingItems(
      patient.visitProcedure || '', patient.procCode || '',
      patient.fee || '', patient.unit || ''
    );
    const codes = items.length > 0 ? items.map(i => i.code).join(', ') : '';
    const isBillingOpen = billingPatientIdx === patient.rowIndex;

    return (
      <div key={patient.rowIndex}>
        <PatientCard
          patient={patient}
          onClick={() => handlePatientClick(patient)}
          onDelete={() => setDeleteConfirm(patient)}
          anonymize={anonymize}
          onTimeChange={(time) => handleTimeChange(patient, time)}
          onBillingToggle={() => toggleBilling(patient.rowIndex)}
          billingCodes={codes}
          onNavigate={() => router.push(`/patient/${patient.rowIndex}?sheet=${encodeURIComponent(patient.sheetName)}`)}
          onProcess={async () => {
            let settings: any;
            try { const s = localStorage.getItem('ed-app-settings'); if (s) settings = JSON.parse(s); } catch {}
            const res = await fetch('/api/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, settings, promptTemplates: getPromptTemplates() }),
            });
            if (res.ok) fetchPatients();
          }}
          onGenerateAnalysis={async () => {
            const body = JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName });
            const headers = { 'Content-Type': 'application/json' };
            await Promise.all([
              fetch('/api/synopsis', { method: 'POST', headers, body }),
              fetch('/api/analysis', { method: 'POST', headers, body }),
            ]);
            fetchPatients();
          }}
          onUpdateFields={async (fields) => {
            await fetch(`/api/patients/${patient.rowIndex}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...fields, _sheetName: patient.sheetName }),
            });
            fetchPatients();
          }}
        />
        {isBillingOpen && (
          <div className="mt-1 ml-0">
            <InlineBilling
              billingItems={items}
              comments={patient.comments || ''}
              onSave={(newItems) => handleDashboardBillingSave(patient, newItems)}
              onSaveComments={(c) => handleDashboardBillingSave(patient, items, c)}
            />
          </div>
        )}
      </div>
    );
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const handlePatientClick = (patient: Patient) => {
    if (batchMode) return;
    setDataModalPatient(patient);
  };

  const navigateToPatient = (patient: Patient) => {
    setDataModalPatient(null);
    router.push(`/patient/${patient.rowIndex}?sheet=${encodeURIComponent(patient.sheetName)}`);
  };

  // Nature photo URLs (Unsplash landscape/wildlife, pre-selected for reliability)
  const awayPhotos = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80', // mountains
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80', // forest valley
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80', // forest sunlight
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&q=80', // ocean waves
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80', // green hills
    'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=1920&q=80', // mountain lake
  ];
  const awayPhotoUrl = awayPhotos[new Date().getDate() % awayPhotos.length];

  if (awayScreen) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer select-none"
        onClick={() => setAwayScreen(false)}
        style={{
          backgroundImage: `url(${awayPhotoUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/30" />
        {/* Content */}
        <div className="relative z-10 text-center text-white">
          <div className="text-8xl font-thin tracking-wide mb-2" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
            {awayTime}
          </div>
          {awayWeather && awayWeather.temp && (
            <div className="text-2xl font-light opacity-90" style={{ textShadow: '0 1px 10px rgba(0,0,0,0.5)' }}>
              {awayWeather.temp} &middot; {awayWeather.desc}
              {awayWeather.location && <span className="ml-2 text-lg opacity-75">{awayWeather.location}</span>}
            </div>
          )}
          <div className="mt-8 text-sm opacity-50 font-light">Click anywhere to return</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="dash-header sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4">
          {/* Top row: title + actions */}
          <div className="flex items-center justify-between pt-3 pb-2">
            <h1 className="text-xl font-bold tracking-tight">My ER Dashboard</h1>
            <div className="flex items-center gap-0.5">
              {userEmail && (
                <span className="text-[11px] hidden sm:block mr-1.5 max-w-[120px] truncate" style={{ color: 'var(--dash-text-muted)' }} title={userEmail}>
                  {anonymize ? 'Dr. ***' : userName ? `Dr. ${userName.trim().split(/\s+/).pop()}` : userEmail}
                </span>
              )}
              <div className="relative" ref={privacyRef}>
                <button
                  onClick={() => setPrivacyMenuOpen(!privacyMenuOpen)}
                  className={`p-2 hover:bg-white/10 rounded-full transition-colors ${anonymize ? 'text-amber-400' : ''}`}
                  style={anonymize ? undefined : { color: 'var(--dash-text-sub)' }}
                  title="Privacy"
                >
                  <Shield className="w-[18px] h-[18px]" />
                </button>
                {privacyMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-gray-900 rounded-lg shadow-xl ring-1 ring-white/10 py-1 text-sm">
                    <button
                      onClick={() => { setAnonymize(!anonymize); setPrivacyMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-100 hover:bg-white/10 transition-colors"
                    >
                      {anonymize ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      {anonymize ? 'Show Names' : 'Anonymize Names'}
                    </button>
                    <button
                      onClick={() => { setAwayScreen(true); setPrivacyMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-100 hover:bg-white/10 transition-colors"
                    >
                      <Monitor className="w-4 h-4" />
                      Away Screen
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => router.push('/settings')}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                style={{ color: 'var(--dash-text-sub)' }}
              >
                <Settings className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={() => setShowBatchTranscribe(true)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                style={{ color: 'var(--dash-text-sub)' }}
                title="Upload audio for multiple patients"
              >
                <Upload className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={() => fetchPatients(true)}
                disabled={refreshing}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                style={{ color: 'var(--dash-text-sub)' }}
              >
                <RefreshCw className={`w-[18px] h-[18px] ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                style={{ color: 'var(--dash-text-sub)' }}
                title="Sign out"
              >
                <LogOut className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>

          {/* Bottom row: date nav + shift times */}
          <div className="flex items-center justify-between border-t border-white/10 pt-1.5 pb-2">
            {/* Date navigation */}
            <div className="flex items-center">
              <button
                onClick={goToPreviousDay}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                style={{ color: 'var(--dash-text-sub)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="flex items-center gap-1.5 px-2 py-1">
                <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--dash-text-muted)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>{formatDateDisplay(currentDate)}</span>
              </span>
              {!isToday && (
                <button
                  onClick={goToToday}
                  className="text-[11px] font-medium px-1.5 py-0.5 rounded text-amber-300 hover:bg-white/10 transition-colors"
                >
                  Today
                </button>
              )}
              <button
                onClick={goToNextDay}
                disabled={isToday}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors disabled:opacity-30"
                style={{ color: 'var(--dash-text-sub)' }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Shift times */}
            <div className="flex items-center gap-1.5">
              <select
                value={shiftStart}
                onChange={(e) => { setShiftStart(e.target.value); handleShiftTimeSave({ start: e.target.value }); }}
                className="shift-select-header"
              >
                <option value="">Start</option>
                <option value="08:00">8:00 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="13:00">1:00 PM</option>
                <option value="18:00">6:00 PM</option>
                <option value="23:00">11:00 PM</option>
              </select>
              <span className="text-[10px]" style={{ color: 'var(--dash-text-muted)' }}>–</span>
              <select
                value={shiftEnd}
                onChange={(e) => { setShiftEnd(e.target.value); handleShiftTimeSave({ end: e.target.value }); }}
                className="shift-select-header"
              >
                <option value="">End</option>
                <option value="15:00">3:00 PM</option>
                <option value="18:00">6:00 PM</option>
                <option value="21:00">9:00 PM</option>
                <option value="01:00">1:00 AM</option>
                <option value="08:00">8:00 AM</option>
              </select>
              {shiftHours && (
                <span className="text-[10px] flex-shrink-0 hidden sm:inline" style={{ color: 'var(--dash-text-muted)' }}>{shiftHours}h</span>
              )}
              {shiftCode && (
                <span className="text-[9px] font-mono flex-shrink-0 hidden sm:inline" style={{ color: 'var(--dash-text-muted)' }}>{shiftCode}</span>
              )}
              {shiftTotal && (
                <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: '#34d399' }}>${shiftTotal}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Batch Processing Bar */}
      {batchMode && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 sticky top-[92px] z-20">
          <div className="flex items-center justify-between max-w-2xl mx-auto px-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-amber-800 dark:text-amber-300">
                {selectedPatients.size > 0
                  ? `${selectedPatients.size} selected`
                  : 'Select patients'}
              </span>
              <button
                onClick={selectAll}
                className="text-amber-600 dark:text-amber-400 underline text-xs"
              >
                Select All
              </button>
            </div>
            <div className="flex items-center gap-2">
              {batchProcessing ? (
                <span className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {batchProgress.current}/{batchProgress.total}
                </span>
              ) : (
                <>
                  <button
                    onClick={handleBatchProcess}
                    disabled={batchProcessing}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium flex items-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {selectedPatients.size > 0 ? 'Process Selected' : 'Process All'}
                  </button>
                  <button
                    onClick={exitBatchMode}
                    className="px-3 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-2xl mx-auto px-[var(--page-px)] py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-12 animate-fadeIn">
            <p className="text-[var(--text-muted)] mb-4">
              {isToday ? 'No patients yet today' : `No patients on ${sheetName}`}
            </p>
            <button
              onClick={() => setShowParseModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:brightness-110 active:scale-[0.97] transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Patient
            </button>
          </div>
        ) : (
          <div className="space-y-6 animate-fadeIn">
            {/* Search & Sort Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search patients..."
                  className="w-full pl-9 pr-8 py-2 border border-[var(--input-border)] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[var(--bg-tertiary)] rounded"
                  >
                    <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setSortBy(prev => prev === 'time' ? 'name' : 'time')}
                className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] flex-shrink-0"
                title={`Sort by ${sortBy === 'time' ? 'name' : 'time'}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {sortBy === 'time' ? 'Time' : 'Name'}
              </button>
            </div>

            {/* Batch Process Button */}
            {hasPending && !batchMode && (
              <button
                onClick={() => setBatchMode(true)}
                className="w-full py-3 bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 rounded-xl font-medium flex items-center justify-center gap-2 border border-amber-200 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/50 active:scale-[0.99] transition-all"
              >
                <Play className="w-4 h-4" />
                Batch Process ({pendingPatients.length} pending)
              </button>
            )}

            {/* Ready to Process */}
            {pendingPatients.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-3">
                  Ready to Process ({pendingPatients.length})
                </h2>
                <div className="space-y-3">
                  {pendingPatients.map((patient) => (
                    <div key={patient.rowIndex} className="flex items-start gap-2">
                      {batchMode && (
                        <button
                          onClick={() => togglePatientSelection(patient.rowIndex)}
                          className="flex-shrink-0 p-1 mt-3"
                        >
                          {selectedPatients.has(patient.rowIndex) ? (
                            <CheckSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <Square className="w-5 h-5 text-[var(--text-muted)]" />
                          )}
                        </button>
                      )}
                      <div className="flex-1">
                        {renderPatientWithBilling(patient)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* New */}
            {newPatients.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-3">
                  New ({newPatients.length})
                </h2>
                <div className="space-y-3">
                  {newPatients.map((patient) => renderPatientWithBilling(patient))}
                </div>
              </section>
            )}

            {/* Processed */}
            {processedPatients.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-3">
                  Processed ({processedPatients.length})
                </h2>
                <div className="space-y-3">
                  {processedPatients.map((patient) => renderPatientWithBilling(patient))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* FAB - Add Patient */}
      <button
        onClick={() => setShowParseModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--accent)] text-white rounded-2xl flex items-center justify-center hover:brightness-110 active:scale-[0.93] transition-all duration-200"
        style={{ boxShadow: 'var(--fab-shadow)' }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Parse Modal */}
      <ParseModal
        isOpen={showParseModal}
        onClose={() => setShowParseModal(false)}
        onSave={handleSavePatient}
      />

      {/* Patient Data Entry Modal */}
      <PatientDataModal
        patient={dataModalPatient}
        isOpen={!!dataModalPatient}
        onClose={() => setDataModalPatient(null)}
        onSaved={() => fetchPatients()}
        onNavigate={() => dataModalPatient && navigateToPatient(dataModalPatient)}
        onRegenerate={() => fetchPatients()}
        suggestions={suggestions}
      />

      {/* Batch Transcribe Modal */}
      <BatchTranscribeModal
        isOpen={showBatchTranscribe}
        onClose={() => { setShowBatchTranscribe(false); setSharedFile(undefined); setSharedTranscript(undefined); }}
        patients={patients}
        sheetName={sheetName}
        onSaved={() => fetchPatients()}
        initialFile={sharedFile}
        initialTranscript={sharedTranscript}
      />

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 modal-overlay z-50 flex items-center justify-center px-4">
          <div className="bg-[var(--card-bg)] rounded-2xl p-6 max-w-sm w-full space-y-4 animate-scaleIn" style={{ boxShadow: 'var(--card-shadow-elevated)' }}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Delete Patient?</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Remove <strong>{deleteConfirm.name || 'this patient'}</strong> from the list? This clears all data for this row.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDeletePatient(deleteConfirm)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg font-medium active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
