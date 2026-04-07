'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Patient } from '@/lib/google-sheets';
import {
  getPromptTemplates, getSettings, saveSettings, getEffectivePromptTemplates,
  getEncounterType, saveEncounterType, getEncounterTypes,
  EncounterType,
} from '@/lib/settings';
import { PatientCard } from '@/components/PatientCard';
import { ParseModal } from '@/components/ParseModal';
import { PatientDataModal } from '@/components/PatientDataModal';
import { BatchTranscribeModal } from '@/components/BatchTranscribeModal';
import { ClinicalChatModal } from '@/components/ClinicalChatModal';
import { CalculatorModal } from '@/components/CalculatorModal';
import { MergeModal } from '@/components/MergeModal';
import { PendingAudioBanner } from '@/components/PendingAudioBanner';
import { SavedResourcesModal, addSavedResource, getSavedResources } from '@/components/SavedResourcesModal';
import { InlineBilling, VchTimeBasedShiftPanel } from '@/components/BillingSection';
import {
  BillingItem,
  parseBillingItems,
  serializeBillingItems,
  isTimeBased,
  TimeSegment,
  BILLING_REGIONS,
  getDayRegion,
  saveDayRegion,
  saveRegion,
} from '@/lib/billing';
import { getEducationConfig, getAutoAnalysis } from '@/lib/settings';
import {
  Plus, Loader2, ChevronLeft, ChevronRight,
  Calendar, Settings, CheckSquare, Square, Play, Clock, EyeOff, Eye,
  Search, ArrowUpDown, X, LogOut, Upload, Monitor, RotateCcw, Sparkles,
  ChevronDown, SlidersHorizontal, FileSpreadsheet, Bookmark, Wind
} from 'lucide-react';
import { AWAY_PHOTOS, CALM_PHOTOS, AWAY_FUN } from '@/lib/away-screen-data';

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

// Static data (AWAY_PHOTOS, CALM_PHOTOS, AWAY_FUN) moved to lib/away-screen-data.ts

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
  const [shiftFee, setShiftFee] = useState('');
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
  const [savedResourcesOpen, setSavedResourcesOpen] = useState(false);
  const [savedResourceKeys, setSavedResourceKeys] = useState<Set<string>>(new Set());
  const [awayTime, setAwayTime] = useState('');
  const [awayWeather, setAwayWeather] = useState<{ temp: string; desc: string; location: string } | null>(null);
  const [awayPhotoIndex, setAwayPhotoIndex] = useState(0);
  const [awayFunFact, setAwayFunFact] = useState('');
  const [awayBreathing, setAwayBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [breathCount, setBreathCount] = useState(0);
  const [calmPhotoUrl, setCalmPhotoUrl] = useState('');

  // Dashboard billing
  const [billingPatientIdx, setBillingPatientIdx] = useState<number | null>(null);

  // User info
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');

  // Batch transcribe
  const [showBatchTranscribe, setShowBatchTranscribe] = useState(false);

  // Clinical chat
  const [chatPatient, setChatPatient] = useState<Patient | null>(null);
  const [calcPatient, setCalcPatient] = useState<Patient | null>(null);
  const [mergeSource, setMergeSource] = useState<Patient | null>(null);

  // VCH sheet generation

  // VCH time-based shift segments
  const [shiftSegments, setShiftSegments] = useState<TimeSegment[]>([]);
  const [showShiftPanel, setShowShiftPanel] = useState(false);

  // Encounter type
  const [activeEncounterType, setActiveEncounterType] = useState(() => getEncounterType());
  const [encounterTypes, setEncounterTypes] = useState<EncounterType[]>(() => getEncounterTypes());

  // Track billing mode per day — falls back to global setting
  const [isVchMode, setIsVchMode] = useState(false);
  const [billingMenuOpen, setBillingMenuOpen] = useState(false);
  const billingMenuRef = useRef<HTMLDivElement>(null);
  const [exportingBilling, setExportingBilling] = useState(false);
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  useEffect(() => {
    const daySheet = formatDateForSheet(currentDate);
    setIsVchMode(getDayRegion(daySheet) === 'vch');
  }, [currentDate]);
  const [encounterMenuOpen, setEncounterMenuOpen] = useState(false);
  const encounterMenuRef = useRef<HTMLDivElement>(null);

  // Date picker ref
  const datePickerRef = useRef<HTMLInputElement>(null);

  // Draggable FAB
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window !== 'undefined') {
      try { const s = localStorage.getItem('ed-fab-pos'); if (s) return JSON.parse(s); } catch {}
    }
    return null;
  });
  const fabDragging = useRef(false);
  const fabDragStart = useRef({ x: 0, y: 0, fabX: 0, fabY: 0 });
  const fabMoved = useRef(false);
  const fabRef = useRef<HTMLDivElement | null>(null);

  // Window-level pointer handlers for reliable drag
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!fabDragging.current) return;
      const dx = e.clientX - fabDragStart.current.x;
      const dy = e.clientY - fabDragStart.current.y;
      if (!fabMoved.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      fabMoved.current = true;
      setFabPos({
        x: Math.max(0, Math.min(window.innerWidth - 56, fabDragStart.current.fabX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 56, fabDragStart.current.fabY + dy)),
      });
    };
    const onUp = () => {
      if (!fabDragging.current) return;
      fabDragging.current = false;
      if (!fabMoved.current) {
        setShowParseModal(true);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // Persist FAB position to localStorage
  useEffect(() => {
    if (fabPos) {
      localStorage.setItem('ed-fab-pos', JSON.stringify(fabPos));
    } else {
      localStorage.removeItem('ed-fab-pos');
    }
  }, [fabPos]);

  const [sharedFile, setSharedFile] = useState<File | undefined>(undefined);
  const [sharedTranscript, setSharedTranscript] = useState<string | undefined>(undefined);

  // Search and sort
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);
  const [sortBy, setSortBy] = useState<'time' | 'name' | 'status'>('time');

  const sheetName = formatDateForSheet(currentDate);
  const isToday = (() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const d = new Date(currentDate); d.setHours(0, 0, 0, 0);
    return d.getTime() === t.getTime();
  })();

  // Load shift segments from Google Sheet (VCH Billing tab), fall back to localStorage
  const segmentsKey = `ed-vch-segments-${sheetName}`;
  useEffect(() => {
    if (!isVchMode) return;
    (async () => {
      try {
        const res = await fetch(`/api/vch-billing-sheet?sheet=${encodeURIComponent(sheetName)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setShiftSegments(data);
            localStorage.setItem(segmentsKey, JSON.stringify(data));
            return;
          }
        }
      } catch {}
      // Fall back to localStorage
      try {
        const stored = localStorage.getItem(segmentsKey);
        setShiftSegments(stored ? JSON.parse(stored) : []);
      } catch {
        setShiftSegments([]);
      }
    })();
  }, [segmentsKey, isVchMode]);

  // Debounced save to prevent race conditions on rapid edits
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSaveShiftSegments = (segs: TimeSegment[]) => {
    setShiftSegments(segs);
    localStorage.setItem(segmentsKey, JSON.stringify(segs));

    // Debounce the sheet sync — wait 1s after last edit before writing
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const appSettings = getSettings();
        await fetch('/api/vch-billing-sheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetName,
            cprpId: appSettings.vchCprpId,
            siteFacility: appSettings.vchSiteFacility,
            pracNumber: appSettings.vchPracNumber,
            practitionerName: appSettings.vchPractitionerName,
            shiftSegments: segs,
          }),
        });
      } catch {}
    }, 1000);
  };

  const lastFetchRef = useRef(Date.now());

  const fetchPatients = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/patients?sheet=${encodeURIComponent(sheetName)}`, { cache: 'no-store' });
      if (res.status === 403) { window.location.href = '/pending'; return; }
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      setPatients(data.patients || []);
      lastFetchRef.current = Date.now();
      if (data.shiftTimes) {
        setShiftStart(data.shiftTimes.start || '');
        setShiftEnd(data.shiftTimes.end || '');
        setShiftHours(data.shiftTimes.hours || '');
        setShiftFeeType(data.shiftTimes.feeType || '');
        setShiftCode(data.shiftTimes.code || '');
        setShiftFee(data.shiftTimes.fee || '');
        setShiftTotal(data.shiftTimes.total || '');
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // SWR: available date sheets (deduped, cached)
  const { data: sheetsData } = useSWR<{ sheets: string[] }>('/api/patients?listSheets=1');
  useEffect(() => {
    if (sheetsData?.sheets) setAvailableSheets(sheetsData.sheets);
  }, [sheetsData]);

  useEffect(() => {
    setLoading(true);
    fetchPatients();
  }, [sheetName]);

  // Re-fetch when window regains focus (e.g. returning from patient detail page)
  useEffect(() => {
    const handleFocus = () => {
      // Only re-fetch if at least 3 seconds since last fetch (avoid rapid re-fetches)
      if (Date.now() - lastFetchRef.current > 3000) {
        fetchPatients();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [sheetName]);

  // Debounced cross-sheet search
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    if (q.length < 2) return;
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?search=${encodeURIComponent(q)}`, { cache: 'no-store' });
        if (res.status === 401) { window.location.href = '/login'; return; }
        const data = await res.json();
        setSearchResults(data.patients || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchQuery]);

  // SWR: user profile (deduped, cached)
  const { data: authData } = useSWR<{ email: string; name: string; termsAccepted?: boolean }>('/api/auth/me');
  useEffect(() => {
    if (!authData) return;
    if (authData.termsAccepted === false) { router.push('/terms'); return; }
    setUserEmail(authData.email || '');
    setUserName(authData.name || '');
  }, [authData]);

  // SWR: billing config (deduped, cached)
  const { data: billingConfig } = useSWR<Record<string, string>>('/api/billing-config');
  useEffect(() => {
    if (!billingConfig) return;
    const s = getSettings();
    saveSettings({
      ...s,
      vchCprpId: billingConfig.vchCprpId || s.vchCprpId,
      vchSiteFacility: billingConfig.vchSiteFacility || s.vchSiteFacility,
      vchPracNumber: billingConfig.vchPracNumber || s.vchPracNumber,
      vchPractitionerName: billingConfig.vchPractitionerName || s.vchPractitionerName,
    });
    if (billingConfig.billingRegion) {
      saveRegion(billingConfig.billingRegion);
    }
  }, [billingConfig]);

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

        // Generate note if requested (from ParseModal checkbox) or auto-analysis enabled
        const shouldGenerate = data._generateNote || getAutoAnalysis();
        if (shouldGenerate) {
          const body = JSON.stringify({
            rowIndex,
            sheetName: savedSheet,
            settings: (() => { try { const s = localStorage.getItem('ed-app-settings'); return s ? JSON.parse(s) : undefined; } catch { return undefined; } })(),
            promptTemplates: getEffectivePromptTemplates(),
          });
          const headers = { 'Content-Type': 'application/json' };
          fetch('/api/process', { method: 'POST', headers, body }).catch(() => {});
          if (getAutoAnalysis()) {
            fetch('/api/synopsis', { method: 'POST', headers, body: JSON.stringify({ rowIndex, sheetName: savedSheet }) }).catch(() => {});
            fetch('/api/analysis', { method: 'POST', headers, body: JSON.stringify({ rowIndex, sheetName: savedSheet }) }).catch(() => {});
          }
        }
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
        setShiftFee(data.shiftTimes.fee || '');
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

  // Away screen: guided breathing cycle (4s inhale, 4s hold, 6s exhale)
  useEffect(() => {
    if (!awayBreathing) return;
    setBreathPhase('inhale');
    setBreathCount(0);

    const phases: Array<{ phase: 'inhale' | 'hold' | 'exhale'; duration: number }> = [
      { phase: 'inhale', duration: 4000 },
      { phase: 'hold', duration: 4000 },
      { phase: 'exhale', duration: 6000 },
    ];
    let idx = 0;
    let count = 0;

    const advance = () => {
      idx = (idx + 1) % phases.length;
      if (idx === 0) { count++; setBreathCount(count); }
      setBreathPhase(phases[idx].phase);
      timer = setTimeout(advance, phases[idx].duration);
    };
    let timer = setTimeout(advance, phases[0].duration);

    return () => clearTimeout(timer);
  }, [awayBreathing]);

  // Close dropdown menus on outside click
  const privacyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!privacyMenuOpen && !encounterMenuOpen && !billingMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (privacyMenuOpen && privacyRef.current && !privacyRef.current.contains(e.target as Node)) {
        setPrivacyMenuOpen(false);
      }
      if (encounterMenuOpen && encounterMenuRef.current && !encounterMenuRef.current.contains(e.target as Node)) {
        setEncounterMenuOpen(false);
      }
      if (billingMenuOpen && billingMenuRef.current && !billingMenuRef.current.contains(e.target as Node)) {
        setBillingMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [privacyMenuOpen]);

  // Filter and sort patients — use cross-sheet search results when searching
  const isSearching = searchQuery.trim().length >= 2;
  const activePatients = isSearching && searchResults !== null ? searchResults : patients;

  /** Parse a time string (HH:MM, H:MM, HH:MM AM/PM) to minutes since midnight for sorting */
  const parseTimeToMin = (t: string): number => {
    if (!t) return 9999;
    const match = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return 9999;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (match[3]) {
      const isPM = match[3].toUpperCase() === 'PM';
      if (isPM && h < 12) h += 12;
      if (!isPM && h === 12) h = 0;
    }
    return h * 60 + m;
  };

  const STATUS_ORDER: Record<string, number> = { new: 0, pending: 1, processed: 2 };
  const sortedPatients = [...activePatients].sort((a, b) => {
    if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    }
    if (sortBy === 'status') {
      const sa = STATUS_ORDER[a.status || 'new'] ?? 0;
      const sb = STATUS_ORDER[b.status || 'new'] ?? 0;
      if (sa !== sb) return sa - sb;
      return parseTimeToMin(a.timestamp) - parseTimeToMin(b.timestamp);
    }
    // When searching across dates, sort by date (sheetName) then time
    if (isSearching) {
      const dateCompare = (b.sheetName || '').localeCompare(a.sheetName || '');
      if (dateCompare !== 0) return dateCompare;
    }
    return parseTimeToMin(a.timestamp) - parseTimeToMin(b.timestamp);
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
          body: JSON.stringify({ rowIndex: toProcess[i].rowIndex, sheetName, promptTemplates: getEffectivePromptTemplates() }),
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

  const handleDateChange = async (patient: Patient, newSheetName: string) => {
    try {
      await fetch(`/api/patients/${patient.rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _moveToSheet: newSheetName, _sheetName: patient.sheetName }),
      });
      fetchPatients();
    } catch (error) {
      console.error('Failed to move patient:', error);
    }
  };

  const handleDashboardBillingSave = async (patient: Patient, items: BillingItem[], comments?: string) => {
    // Optimistic update: immediately reflect changes in the UI
    const serialized = serializeBillingItems(items);
    setPatients(prev => prev.map(p =>
      p.rowIndex === patient.rowIndex && p.sheetName === patient.sheetName
        ? {
            ...p,
            visitProcedure: serialized.visitProcedure,
            procCode: serialized.procCode,
            fee: serialized.fee,
            unit: serialized.unit,
            total: serialized.total,
            ...(comments !== undefined ? { comments } : {}),
          }
        : p
    ));

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
      fetchPatients(); // Revert optimistic update on error
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
    const vchRegion = isVchMode;
    const codes = vchRegion
      ? (() => {
          const totalMin = items.filter(i => i.code.startsWith('VCH-')).reduce((sum, i) => sum + (parseInt(i.unit || '0', 10) || 0), 0);
          return totalMin > 0 ? `${totalMin}m` : '';
        })()
      : items.length > 0 ? items.map(i => i.code).join(', ') : '';
    const isBillingOpen = billingPatientIdx === patient.rowIndex;

    return (
      <div key={patient.rowIndex}>
        <PatientCard
          patient={patient}
          onClick={() => handlePatientClick(patient)}
          onDelete={() => setDeleteConfirm(patient)}
          anonymize={anonymize}
          onTimeChange={(time) => handleTimeChange(patient, time)}
          onBillingToggle={isVchMode ? undefined : () => toggleBilling(patient.rowIndex)}
          billingCodes={isVchMode ? undefined : codes}
          onNavigate={() => router.push(`/patient/${patient.rowIndex}?sheet=${encodeURIComponent(patient.sheetName)}`)}
          onProcess={async () => {
            let settings: any;
            try { const s = localStorage.getItem('ed-app-settings'); if (s) settings = JSON.parse(s); } catch {}
            const res = await fetch('/api/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, settings, promptTemplates: getEffectivePromptTemplates() }),
            });
            if (res.ok) fetchPatients();
          }}
          onGenerateAnalysis={async () => {
            const educationMode = getEducationConfig().enabled;
            const body = JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, educationMode });
            const headers = { 'Content-Type': 'application/json' };
            await Promise.all([
              fetch('/api/synopsis', { method: 'POST', headers, body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName }) }),
              fetch('/api/analysis', { method: 'POST', headers, body }),
            ]);
            fetchPatients();
          }}
          onGenerateSynopsis={async () => {
            await fetch('/api/synopsis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName }),
            });
            fetchPatients();
          }}
          onGenerateManagement={async () => {
            await fetch('/api/analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, section: 'management' }),
            });
            fetchPatients();
          }}
          onGenerateEvidence={async () => {
            await fetch('/api/analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, section: 'evidence' }),
            });
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
          onClinicalChat={() => setChatPatient(patient)}
          onCalculator={() => setCalcPatient(patient)}
          onMerge={() => setMergeSource(patient)}
          onDateChange={(newSheet) => handleDateChange(patient, newSheet)}
          showEducation={getEducationConfig().enabled}
          onSaveResource={(resource) => {
            addSavedResource(resource);
            setSavedResourceKeys(prev => new Set(prev).add(`${patient.rowIndex}:${patient.sheetName}:${resource.type}`));
          }}
          savedResourceKey={(type) => savedResourceKeys.has(`${patient.rowIndex}:${patient.sheetName}:${type}`)}
          onGenerateProfile={async () => {
            await fetch('/api/profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName }),
            });
            fetchPatients();
          }}
          onGenerateEducation={async () => {
            const eduConfig = getEducationConfig();
            await fetch('/api/education', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rowIndex: patient.rowIndex,
                sheetName: patient.sheetName,
                sources: eduConfig.sources || '',
              }),
            });
            fetchPatients();
          }}
        />
        {isBillingOpen && (
          <div className="mt-1 ml-0" key={`billing-${patient.rowIndex}-${patient.procCode || ''}`}>
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

  const awayPhotoUrl = AWAY_PHOTOS[awayPhotoIndex % AWAY_PHOTOS.length];

  if (awayScreen) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer select-none"
        onClick={() => {
          // Tap cycles to a new random photo
          let next: number;
          do { next = Math.floor(Math.random() * AWAY_PHOTOS.length); } while (next === awayPhotoIndex && AWAY_PHOTOS.length > 1);
          setAwayPhotoIndex(next);
        }}
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
          <div className="mt-8 text-sm opacity-50 font-light">Tap for a new view</div>
        </div>

        {/* Close button */}
        <div
          className="absolute top-6 right-6 z-30 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setAwayScreen(false); setAwayFunFact(''); setAwayBreathing(false); }}
        >
          <div className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all duration-200" style={{ backdropFilter: 'blur(8px)' }}>
            <X className="w-5 h-5 text-white/70" />
          </div>
        </div>

        {/* Fun fact bubble */}
        {awayFunFact && (
          <div
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 max-w-md mx-4 px-5 py-3 rounded-2xl text-white/90 text-sm font-light text-center animate-fadeIn"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {awayFunFact}
          </div>
        )}

        {/* Breathing exercise overlay */}
        {awayBreathing && (
          <div
            className="absolute inset-0 z-40 flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Calming background photo with crossfade */}
            <div
              className="absolute inset-0 transition-opacity duration-[2000ms]"
              style={{
                backgroundImage: `url(${calmPhotoUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 1,
              }}
            />
            <div className="absolute inset-0 bg-black/45" />
            <div className="relative z-10 flex flex-col items-center gap-8">
              {/* Breathing circle */}
              <div
                className="rounded-full flex items-center justify-center transition-all ease-in-out"
                style={{
                  width: breathPhase === 'exhale' ? 140 : 260,
                  height: breathPhase === 'exhale' ? 140 : 260,
                  transitionDuration: breathPhase === 'inhale' ? '4s' : breathPhase === 'hold' ? '0.3s' : '6s',
                  background: breathPhase === 'inhale'
                    ? 'radial-gradient(circle, rgba(94,234,212,0.35) 0%, rgba(94,234,212,0.08) 60%, transparent 100%)'
                    : breathPhase === 'hold'
                    ? 'radial-gradient(circle, rgba(147,197,253,0.35) 0%, rgba(147,197,253,0.08) 60%, transparent 100%)'
                    : 'radial-gradient(circle, rgba(196,181,253,0.25) 0%, rgba(196,181,253,0.05) 60%, transparent 100%)',
                  boxShadow: [
                    `0 0 ${breathPhase === 'exhale' ? 20 : 50}px rgba(255,255,255,0.08)`,
                    `inset 0 0 ${breathPhase === 'exhale' ? 15 : 40}px rgba(255,255,255,0.05)`,
                  ].join(', '),
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                <span
                  className="text-white/90 font-extralight uppercase whitespace-nowrap transition-all ease-in-out"
                  style={{
                    fontSize: breathPhase === 'exhale' ? 12 : 18,
                    letterSpacing: breathPhase === 'exhale' ? '0.15em' : '0.25em',
                    transitionDuration: breathPhase === 'inhale' ? '4s' : breathPhase === 'hold' ? '0.3s' : '6s',
                    textShadow: '0 2px 12px rgba(0,0,0,0.4)',
                  }}
                >
                  {breathPhase === 'inhale' ? 'Breathe in' : breathPhase === 'hold' ? 'Hold' : 'Breathe out'}
                </span>
              </div>
              <div className="text-white/40 text-sm font-light tracking-wide" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.3)' }}>
                {breathCount > 0 ? `${breathCount} breath${breathCount !== 1 ? 's' : ''} completed` : '4 \u00b7 4 \u00b7 6 breathing'}
              </div>
              <button
                onClick={() => setAwayBreathing(false)}
                className="mt-4 px-6 py-2.5 rounded-full text-white/60 text-sm font-light tracking-wide hover:text-white/90 transition-all duration-300"
                style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Bottom buttons */}
        <div className="absolute bottom-6 right-6 z-30 flex gap-3">
          {/* Breathing exercise */}
          <div
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setCalmPhotoUrl(CALM_PHOTOS[Math.floor(Math.random() * CALM_PHOTOS.length)]);
              setAwayBreathing(true);
              setAwayFunFact('');
            }}
          >
            <div className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all duration-200" style={{ backdropFilter: 'blur(8px)' }}>
              <Wind className="w-6 h-6 text-white/80" />
            </div>
          </div>
          {/* Random fact */}
          <div
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setAwayFunFact(AWAY_FUN[Math.floor(Math.random() * AWAY_FUN.length)]);
              setAwayBreathing(false);
            }}
          >
            <div className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all duration-200" style={{ backdropFilter: 'blur(8px)' }}>
              <Sparkles className="w-6 h-6 text-white/80" />
            </div>
          </div>
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
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">My Patient Dashboard</h1>
              {/* Encounter Type Selector */}
              <div className="relative" ref={encounterMenuRef}>
                <button
                  onClick={() => setEncounterMenuOpen(!encounterMenuOpen)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium hover:bg-white/10 transition-colors"
                  style={{ color: 'var(--dash-text-muted)' }}
                  title="Encounter type"
                >
                  {encounterTypes.find(t => t.id === activeEncounterType)?.label || 'ER'}
                  <ChevronDown className="w-2.5 h-2.5 opacity-50" />
                </button>
                {encounterMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-48 bg-gray-900 rounded-lg shadow-xl ring-1 ring-white/10 py-1 text-sm">
                    {encounterTypes.map(et => (
                      <button
                        key={et.id}
                        onClick={() => {
                          setActiveEncounterType(et.id);
                          saveEncounterType(et.id);
                          setEncounterMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                          activeEncounterType === et.id
                            ? 'text-blue-400 bg-white/10'
                            : 'text-gray-100 hover:bg-white/10'
                        }`}
                      >
                        {et.label}
                        {activeEncounterType === et.id && (
                          <span className="ml-auto text-blue-400 text-xs">Active</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {/* User name — click to show logout */}
              {userEmail && (
                <div className="relative" ref={privacyRef}>
                  <button
                    onClick={() => setPrivacyMenuOpen(!privacyMenuOpen)}
                    className="text-[11px] hidden sm:flex items-center gap-1 mr-1 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                    style={{ color: 'var(--dash-text-muted)' }}
                    title={userEmail}
                  >
                    <span className="max-w-[120px] truncate">
                      {anonymize ? 'Dr. ***' : userName ? `Dr. ${userName.trim().split(/\s+/).pop()}` : userEmail}
                    </span>
                  </button>
                  {privacyMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-gray-900 rounded-lg shadow-xl ring-1 ring-white/10 py-1 text-sm">
                      <button
                        onClick={() => { setSavedResourcesOpen(true); setPrivacyMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-100 hover:bg-white/10 transition-colors"
                      >
                        <Bookmark className="w-4 h-4" />
                        Saved Resources
                      </button>
                      <div className="border-t border-white/10 my-1" />
                      <button
                        onClick={() => { setAnonymize(!anonymize); setPrivacyMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-100 hover:bg-white/10 transition-colors"
                      >
                        {anonymize ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        {anonymize ? 'Show Names' : 'Anonymize Names'}
                      </button>
                      <button
                        onClick={() => { setAwayPhotoIndex(Math.floor(Math.random() * AWAY_PHOTOS.length)); setAwayScreen(true); setPrivacyMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-100 hover:bg-white/10 transition-colors"
                      >
                        <Monitor className="w-4 h-4" />
                        Away Screen
                      </button>
                      <div className="border-t border-white/10 my-1" />
                      <button
                        onClick={() => { setPrivacyMenuOpen(false); handleLogout(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-gray-100 hover:bg-white/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => router.push('/settings')}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                style={{ color: 'var(--dash-text-sub)' }}
              >
                <Settings className="w-[18px] h-[18px]" />
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
              <button
                onClick={() => datePickerRef.current?.showPicker()}
                className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--dash-text-muted)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--dash-text)' }}>{formatDateDisplay(currentDate)}</span>
                {!loading && patients.length > 0 && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-white/15" style={{ color: 'var(--dash-text-sub)' }}>
                    {patients.length}
                  </span>
                )}
              </button>
              <input
                ref={datePickerRef}
                type="date"
                className="sr-only"
                value={currentDate.toISOString().split('T')[0]}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  if (e.target.value) {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    changeDate(new Date(y, m - 1, d));
                  }
                }}
              />
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

            {/* Shift times / VCH controls */}
            <div className="flex items-center gap-1.5">
              {isVchMode ? (
                <button
                  onClick={() => setShowShiftPanel(!showShiftPanel)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    showShiftPanel ? 'bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20'
                  }`}
                  style={{ color: 'var(--dash-text)' }}
                >
                  <Clock className="w-3 h-3" />
                  Log Time{shiftSegments.length > 0 ? ` (${shiftSegments.length})` : ''}
                </button>
              ) : (
                <>
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
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--dash-text-sub)' }}>{shiftHours}h</span>
                  )}
                  {shiftCode && (
                    <span className="text-[11px] font-mono font-medium flex-shrink-0" style={{ color: 'var(--dash-text-sub)' }}>{shiftCode}</span>
                  )}
                </>
              )}
              {/* Billing settings (per-day) */}
              <div className="relative" ref={billingMenuRef}>
                <button
                  onClick={() => setBillingMenuOpen(!billingMenuOpen)}
                  className="p-1.5 hover:bg-white/10 rounded transition-colors"
                  style={{ color: 'var(--dash-text-muted)' }}
                  title="Billing"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                </button>
                {billingMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 z-50 bg-gray-900/95 backdrop-blur-sm rounded-xl shadow-2xl ring-1 ring-white/10 text-[13px] overflow-hidden" style={{ minWidth: '180px' }}>
                    {/* Fee region */}
                    <div className="px-3 pt-2.5 pb-1 text-[9px] uppercase tracking-widest text-gray-500 font-semibold">Region</div>
                    {BILLING_REGIONS.map(r => {
                      const active = getDayRegion(sheetName) === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => {
                            saveDayRegion(sheetName, r.id);
                            setIsVchMode(r.id === 'vch');
                            setBillingMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                            active ? 'text-white bg-white/8' : 'text-gray-300 hover:bg-white/5'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-teal-400' : 'bg-gray-600'}`} />
                          <span className="flex-1">{r.label}</span>
                        </button>
                      );
                    })}
                    {/* Export */}
                    <div className="border-t border-white/8 mt-1">
                      {!exportingBilling ? (
                        <button
                          onClick={() => setExportingBilling(true)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-gray-300 hover:bg-white/5 transition-colors"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-gray-500" />
                          Export billing...
                        </button>
                      ) : (
                        <div className="px-3 py-2.5 space-y-2">
                          <div className="text-[10px] text-gray-500 font-medium">Date range</div>
                          <div className="space-y-1.5">
                            <input
                              type="date"
                              value={exportStart}
                              onChange={(e) => setExportStart(e.target.value)}
                              className="w-full px-2 py-1.5 bg-gray-800/80 border border-gray-700/50 rounded-lg text-xs text-gray-200 focus:border-teal-500/50 focus:outline-none"
                            />
                            <input
                              type="date"
                              value={exportEnd}
                              onChange={(e) => setExportEnd(e.target.value)}
                              className="w-full px-2 py-1.5 bg-gray-800/80 border border-gray-700/50 rounded-lg text-xs text-gray-200 focus:border-teal-500/50 focus:outline-none"
                            />
                          </div>
                          <div className="flex gap-2 pt-0.5">
                            <button
                              onClick={async () => {
                                if (!exportStart || !exportEnd) return;
                                try {
                                  const billingFormat = isVchMode ? 'vch' : 'yukon';
                                  const res = await fetch(`/api/export-billing?start=${exportStart}&end=${exportEnd}&format=${billingFormat}`);
                                  if (!res.ok) throw new Error('Export failed');
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `billing-${billingFormat}-${exportStart}-to-${exportEnd}.xlsx`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } catch (err) {
                                  console.error('Export error:', err);
                                }
                                setExportingBilling(false);
                                setBillingMenuOpen(false);
                              }}
                              disabled={!exportStart || !exportEnd}
                              className="flex-1 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-medium disabled:opacity-30 transition-colors"
                            >
                              Download
                            </button>
                            <button
                              onClick={() => setExportingBilling(false)}
                              className="py-1.5 px-2 text-gray-500 hover:text-gray-300 text-xs transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* VCH Time-Based Shift Panel */}
      {isVchMode && showShiftPanel && (
        <div className="bg-[var(--card-bg)] border-b border-[var(--border)] sticky top-[92px] z-20">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Shift Time Segments</h3>
              <button
                onClick={() => setShowShiftPanel(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <VchTimeBasedShiftPanel
              segments={shiftSegments}
              onSaveSegments={handleSaveShiftSegments}
            />
          </div>
        </div>
      )}

      {/* Pending Watch Recordings */}
      <PendingAudioBanner onProcessed={() => fetchPatients(false)} />

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
                {searching ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                )}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search all dates..."
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
                onClick={() => setSortBy(prev => prev === 'time' ? 'name' : prev === 'name' ? 'status' : 'time')}
                className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] flex-shrink-0"
                title={`Sort by ${sortBy === 'time' ? 'name' : sortBy === 'name' ? 'status' : 'time'}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {sortBy === 'time' ? 'Time' : sortBy === 'name' ? 'Name' : 'Status'}
              </button>
            </div>
            {/* Search results banner */}
            {isSearching && searchResults !== null && !searching && (
              <div className="text-xs text-[var(--text-muted)] px-1">
                {searchResults.length === 0 ? 'No patients found across all dates' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} across all dates`}
              </div>
            )}

            {/* Batch Process Button */}
            {hasPending && !batchMode && (
              <button
                onClick={() => setBatchMode(true)}
                className="w-full py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center justify-center gap-1.5 transition-colors"
              >
                <Play className="w-3 h-3" />
                Process {pendingPatients.length} pending
              </button>
            )}

            {/* Search results: grouped by date */}
            {isSearching && searchResults !== null ? (
              <div className="space-y-4">
                {Object.entries(
                  sortedPatients.reduce<Record<string, Patient[]>>((acc, p) => {
                    const key = p.sheetName || 'Unknown';
                    (acc[key] = acc[key] || []).push(p);
                    return acc;
                  }, {})
                ).map(([sheet, pts]) => (
                  <section key={sheet}>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {sheet}
                    </h3>
                    <div className="space-y-3">
                      {pts.map((patient) => renderPatientWithBilling(patient))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <>
                {sortBy !== 'time' ? (
                  /* Name/Status sort: flat list, no status grouping */
                  <section>
                    <div className="space-y-3">
                      {sortedPatients.map((patient) =>
                        batchMode && patient.status === 'pending' ? (
                          <div key={patient.rowIndex} className="flex items-start gap-2">
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
                            <div className="flex-1">
                              {renderPatientWithBilling(patient)}
                            </div>
                          </div>
                        ) : (
                          renderPatientWithBilling(patient)
                        )
                      )}
                    </div>
                  </section>
                ) : (
                  /* Time sort: grouped by status */
                  <>
                    {/* Ready to Process */}
                    {pendingPatients.length > 0 && (
                      <section>
                        <div className="space-y-3">
                          {pendingPatients.map((patient) =>
                            batchMode ? (
                              <div key={patient.rowIndex} className="flex items-start gap-2">
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
                                <div className="flex-1">
                                  {renderPatientWithBilling(patient)}
                                </div>
                              </div>
                            ) : (
                              renderPatientWithBilling(patient)
                            )
                          )}
                        </div>
                      </section>
                    )}

                    {/* New */}
                    {newPatients.length > 0 && (
                      <section>
                        <div className="space-y-3">
                          {newPatients.map((patient) => renderPatientWithBilling(patient))}
                        </div>
                      </section>
                    )}

                    {/* Processed */}
                    {processedPatients.length > 0 && (
                      <section>
                        <div className="space-y-3">
                          {processedPatients.map((patient) => renderPatientWithBilling(patient))}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

      </main>

      {/* FAB - Add Patient (draggable) */}
      <div
        ref={fabRef}
        className="fixed z-50 group/fab"
        style={fabPos
          ? { left: fabPos.x, top: fabPos.y }
          : { bottom: 24, right: 24 }
        }
      >
        {fabPos && (
          <button
            onClick={() => setFabPos(null)}
            className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-purple-600 dark:bg-purple-500 rounded-full flex items-center justify-center shadow-lg hover:bg-purple-700 dark:hover:bg-purple-400 hover:scale-110 opacity-0 scale-75 group-hover/fab:opacity-100 group-hover/fab:scale-100 transition-all duration-200 delay-150 z-10"
            title="Reset position"
          >
            <RotateCcw className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
          </button>
        )}
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            fabDragging.current = true;
            fabMoved.current = false;
            const rect = fabRef.current!.getBoundingClientRect();
            fabDragStart.current = {
              x: e.clientX,
              y: e.clientY,
              fabX: rect.left,
              fabY: rect.top,
            };
          }}
          className="w-14 h-14 bg-[var(--accent)] text-white rounded-2xl flex items-center justify-center hover:brightness-110 active:scale-[0.93] transition-all duration-200 touch-none select-none cursor-grab active:cursor-grabbing"
          style={{ boxShadow: 'var(--fab-shadow)' }}
        >
          <span className="w-9 h-9 flex items-center justify-center cursor-pointer">
            <Plus className="w-6 h-6 pointer-events-none" />
          </span>
        </button>
      </div>

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

      {/* Clinical Chat Modal */}
      {chatPatient && (
        <ClinicalChatModal
          isOpen={!!chatPatient}
          onClose={() => setChatPatient(null)}
          patient={chatPatient}
          onUpdate={() => fetchPatients()}
        />
      )}

      {/* Calculator Modal */}
      {calcPatient && (
        <CalculatorModal
          isOpen={!!calcPatient}
          onClose={() => setCalcPatient(null)}
          patient={calcPatient}
        />
      )}

      {/* Merge Modal */}
      {mergeSource && (
        <MergeModal
          source={mergeSource}
          patients={patients}
          onMerge={async (sourceRowIndex, targetRowIndex) => {
            await fetch('/api/patients/merge', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sourceRowIndex,
                targetRowIndex,
                sheetName: mergeSource.sheetName,
              }),
            });
            setMergeSource(null);
            fetchPatients();
          }}
          onClose={() => setMergeSource(null)}
        />
      )}

      {/* Saved Resources Modal */}
      {savedResourcesOpen && (
        <SavedResourcesModal onClose={() => setSavedResourcesOpen(false)} />
      )}

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
