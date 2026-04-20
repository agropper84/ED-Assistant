'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Patient } from '@/lib/google-sheets';
import {
  getPromptTemplates, getSettings, saveSettings, getEffectivePromptTemplates,
  getEncounterType, saveEncounterType, getEncounterTypes,
  EncounterType,
} from '@/lib/settings';
import { PatientCard } from '@/components/PatientCard';
import { PatientGridCell } from '@/components/PatientGridCell';
import { ParseModal } from '@/components/ParseModal';
import { PatientDataModal } from '@/components/PatientDataModal';
import { BatchTranscribeModal } from '@/components/BatchTranscribeModal';
import { ClinicalChatModal } from '@/components/ClinicalChatModal';
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
  ChevronDown, SlidersHorizontal, FileSpreadsheet, Bookmark, Wind, Menu,
  LayoutGrid, LayoutList, Activity, PanelRightOpen
} from 'lucide-react';
import { AwayScreen } from '@/components/AwayScreen';
import { useDraggableFab } from '@/hooks/useDraggableFab';
import { useAwayScreen } from '@/hooks/useAwayScreen';

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
  const [pinnedRowIndex, setPinnedRowIndex] = useState<number | null>(null);
  const [splitPatient, setSplitPatient] = useState<Patient | null>(null);
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
  const [showDayTotal, setShowDayTotal] = useState(false);

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

  // Sidebar + Privacy
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [anonymize, setAnonymize] = useState(false);
  const away = useAwayScreen();
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);
  const [savedResourcesOpen, setSavedResourcesOpen] = useState(false);
  const [savedResourceKeys, setSavedResourceKeys] = useState<Set<string>>(new Set());

  // Dashboard billing
  const [billingPatientIdx, setBillingPatientIdx] = useState<number | null>(null);

  // User info
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');

  // Batch transcribe
  const [showBatchTranscribe, setShowBatchTranscribe] = useState(false);

  // Clinical chat
  const [chatPatient, setChatPatient] = useState<Patient | null>(null);
  const [chatInitialTab, setChatInitialTab] = useState<'qa' | 'calculator'>('qa');
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

  // Track Cmd/Meta key for FAB quick-add mode
  const [metaHeld, setMetaHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.metaKey || e.ctrlKey) setMetaHeld(true); };
    const up = (e: KeyboardEvent) => { if (!e.metaKey && !e.ctrlKey) setMetaHeld(false); };
    const blur = () => setMetaHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  // Quick-add state (for ⌘+click on FAB)
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  // Draggable FAB (extracted hook)
  const { fabPos, fabRef, handlePointerDown: fabPointerDown, resetPosition: resetFabPosition, wasDragged: fabWasDragged } = useDraggableFab();


  const [sharedFile, setSharedFile] = useState<File | undefined>(undefined);
  const [sharedTranscript, setSharedTranscript] = useState<string | undefined>(undefined);

  // Search and sort
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[] | null>(null);
  const [searchAllDates, setSearchAllDates] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);
  const [sortBy, setSortBy] = useState<'time' | 'name' | 'status' | 'recent'>('time');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('ed-view-mode') as 'list' | 'grid') || 'list';
    return 'list';
  });
  const [showCardIcons, setShowCardIcons] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('ed-show-card-icons') === 'true';
    return false;
  });

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

  // Re-fetch when window/tab regains focus (works across devices)
  useEffect(() => {
    const handleFocus = () => {
      if (Date.now() - lastFetchRef.current > 3000) {
        fetchPatients();
      }
    };
    const handleVisibility = () => {
      if (!document.hidden && Date.now() - lastFetchRef.current > 3000) {
        // Check session timeout
        const appSettings = getSettings();
        if (appSettings.sessionTimeoutEnabled) {
          const lastActivity = parseInt(sessionStorage.getItem('ed-last-activity') || '0');
          if (lastActivity && Date.now() - lastActivity > (appSettings.sessionTimeoutMinutes || 30) * 60 * 1000) {
            window.location.href = '/locked';
            return;
          }
        }
        fetchPatients();
      }
      sessionStorage.setItem('ed-last-activity', String(Date.now()));
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sheetName]);

  // Background polling — keeps all devices in sync (every 30s)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only poll if tab is visible and not actively loading
      if (!document.hidden && !loading && Date.now() - lastFetchRef.current > 10000) {
        fetchPatients();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [sheetName, loading]);

  // Search: local (current day) or cross-sheet (all dates)
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    if (q.length < 2) return;

    if (!searchAllDates) {
      // Local search — filter current day's patients by name/diagnosis
      const filtered = patients.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.diagnosis?.toLowerCase().includes(q) ||
        p.hcn?.toLowerCase().includes(q) ||
        p.mrn?.toLowerCase().includes(q)
      );
      setSearchResults(filtered);
      setSearching(false);
      return;
    }

    // All-dates search — API call
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
  }, [searchQuery, searchAllDates, patients]);

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

  const handleSavePatient = async (data: any): Promise<{ rowIndex: number; sheetName: string } | null> => {
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, _sheetName: sheetName }),
      });

      if (res.ok) {
        const { rowIndex, sheetName: savedSheet } = await res.json();
        setPinnedRowIndex(rowIndex);
        fetchPatients();

        // Note: POST /api/patients already wrote the clinical content to the Sheet.
        // Do NOT also call /submit here — that would DOUBLE the content via append.

        // Generate note if requested (from ParseModal checkbox) or auto-analysis enabled
        const shouldGenerate = data._generateNote || getAutoAnalysis();
        if (shouldGenerate) {
          const body = JSON.stringify({
            rowIndex,
            sheetName: savedSheet,
            settings: (() => { try { const s = localStorage.getItem('ed-app-settings'); return s ? JSON.parse(s) : undefined; } catch { return undefined; } })(),
            promptTemplates: getEffectivePromptTemplates(),
            ...(data._noteStyle && data._noteStyle !== 'standard' ? { noteStyle: data._noteStyle, noteStyleInstructions: data._noteStyle === 'comprehensive' ? getSettings().noteStyleDetailed : getSettings().noteStyleCompleteExam } : {}),
            ...(data._customInstructions ? { customInstructions: data._customInstructions } : {}),
          });
          const headers = { 'Content-Type': 'application/json' };
          fetch('/api/process', { method: 'POST', headers, body }).catch(() => {});
          if (getAutoAnalysis()) {
            fetch('/api/synopsis', { method: 'POST', headers, body: JSON.stringify({ rowIndex, sheetName: savedSheet }) }).catch(() => {});
            fetch('/api/analysis', { method: 'POST', headers, body: JSON.stringify({ rowIndex, sheetName: savedSheet }) }).catch(() => {});
          }
        }
        return { rowIndex, sheetName: savedSheet };
      }
    } catch (error) {
      console.error('Failed to save patient:', error);
    }
    return null;
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
    setPinnedRowIndex(null); // Clear pin when changing dates
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

  // Temporary: sync Drive → Sheets for current date
  const [syncing, setSyncing] = useState(false);
  const handleSyncToSheets = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/sync-to-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Synced ${data.synced}/${data.total} patients to Sheets${data.errors ? `\n\nErrors:\n${data.errors.join('\n')}` : ''}`);
      } else {
        alert(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (e) {
      alert(`Sync failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Away screen effects moved to AwayScreen component

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
  const parseTimeToMin = useCallback((t: string): number => {
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
  }, []);

  const sortedPatients = useMemo(() => {
    const STATUS_ORDER: Record<string, number> = { new: 0, pending: 1, processed: 2 };
    return [...activePatients].sort((a, b) => {
      if (pinnedRowIndex !== null) {
        if (a.rowIndex === pinnedRowIndex) return -1;
        if (b.rowIndex === pinnedRowIndex) return 1;
      }
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'status') {
        const sa = STATUS_ORDER[a.status || 'new'] ?? 0;
        const sb = STATUS_ORDER[b.status || 'new'] ?? 0;
        if (sa !== sb) return sa - sb;
        return parseTimeToMin(a.timestamp) - parseTimeToMin(b.timestamp);
      }
      if (sortBy === 'recent') {
        // Processed patients first, sorted by most recently generated (has output)
        const aProcessed = a.status === 'processed' ? 1 : 0;
        const bProcessed = b.status === 'processed' ? 1 : 0;
        if (aProcessed !== bProcessed) return bProcessed - aProcessed;
        // Among processed, reverse time order (most recent first)
        if (aProcessed && bProcessed) return parseTimeToMin(b.timestamp) - parseTimeToMin(a.timestamp);
        // Among non-processed, pending before new
        return (STATUS_ORDER[a.status || 'new'] ?? 0) - (STATUS_ORDER[b.status || 'new'] ?? 0);
      }
      if (isSearching) {
        const dateCompare = (b.sheetName || '').localeCompare(a.sheetName || '');
        if (dateCompare !== 0) return dateCompare;
      }
      return parseTimeToMin(a.timestamp) - parseTimeToMin(b.timestamp);
    });
  }, [activePatients, sortBy, pinnedRowIndex, isSearching, parseTimeToMin]);

  // Day total: sum of all patient visit fees + time-based shift fee
  const dayTotal = useMemo(() => {
    const visitFeesTotal = patients.reduce((sum, p) => {
      const items = parseBillingItems(p.visitProcedure || '', p.procCode || '', p.fee || '', p.unit || '');
      return sum + items.reduce((s, item) => s + (parseFloat(item.fee) || 0) * (parseInt(item.unit) || 1), 0);
    }, 0);
    return visitFeesTotal + (parseFloat(shiftTotal) || 0);
  }, [patients, shiftTotal]);

  // Batch processing — derived from sortedPatients
  const { pendingPatients, processedPatients, newPatients } = useMemo(() => ({
    pendingPatients: sortedPatients.filter(p => p.status === 'pending'),
    processedPatients: sortedPatients.filter(p => p.status === 'processed'),
    newPatients: sortedPatients.filter(p => p.status === 'new'),
  }), [sortedPatients]);
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
    let completed = 0;
    let failures = 0;
    const CONCURRENCY = 3;

    // Process in parallel chunks of CONCURRENCY
    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
      const chunk = toProcess.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(p =>
          fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowIndex: p.rowIndex, sheetName, promptTemplates: getEffectivePromptTemplates() }),
          }).then(res => {
            if (!res.ok) throw new Error(`Failed: ${p.name}`);
          })
        )
      );
      for (const r of results) {
        completed++;
        if (r.status === 'rejected') failures++;
      }
      setBatchProgress({ current: completed, total: toProcess.length });
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
    // Optimistic update
    setPatients(prev => prev.map(p =>
      p.rowIndex === patient.rowIndex && p.sheetName === patient.sheetName
        ? { ...p, timestamp: newTime } : p
    ));
    try {
      const res = await fetch(`/api/patients/${patient.rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: newTime, _sheetName: patient.sheetName, _patientName: patient.name }),
      });
      if (!res.ok) console.error('Time save failed:', res.status);
      fetchPatients();
    } catch (error) {
      console.error('Failed to update time:', error);
      fetchPatients(); // revert optimistic update on error
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
      const res = await fetch(`/api/patients/${patient.rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _billingItems: items,
          _patientName: patient.name,
          ...(comments !== undefined ? { comments } : {}),
          _sheetName: patient.sheetName,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Billing save failed:', res.status, err);
      }
      fetchPatients();
    } catch (error) {
      console.error('Failed to save billing:', error);
      fetchPatients();
    }
  };

  const toggleBilling = (rowIndex: number) => {
    setBillingPatientIdx(prev => prev === rowIndex ? null : rowIndex);
  };

  const patientListClass = viewMode === 'grid'
    ? 'grid grid-cols-2 sm:grid-cols-3 gap-3'
    : 'space-y-3';

  const renderPatientGrid = (patient: Patient) => {
    return (
      <PatientGridCell
        key={patient.rowIndex}
        patient={patient}
        onClick={() => handlePatientClick(patient)}
        onTimeChange={(time) => handleTimeChange(patient, time)}
        onUpdateFields={async (fields) => {
          setPatients(prev => prev.map(p =>
            p.rowIndex === patient.rowIndex && p.sheetName === patient.sheetName
              ? { ...p, ...fields } : p
          ));
          await fetch(`/api/patients/${patient.rowIndex}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...fields, _sheetName: patient.sheetName, _patientName: patient.name }),
          });
          fetchPatients();
        }}
        onBillingSave={(items) => handleDashboardBillingSave(patient, items)}
      />
    );
  };

  const renderPatientWithBilling = (patient: Patient) => {
    if (viewMode === 'grid') return renderPatientGrid(patient);
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
          isPinned={pinnedRowIndex === patient.rowIndex}
          onUnpin={() => setPinnedRowIndex(null)}
          onTimeChange={(time) => handleTimeChange(patient, time)}
          onBillingToggle={isVchMode ? undefined : () => toggleBilling(patient.rowIndex)}
          billingCodes={isVchMode ? undefined : codes}
          onNavigate={() => router.push(`/patient/${patient.rowIndex}?sheet=${encodeURIComponent(patient.sheetName)}&name=${encodeURIComponent(patient.name || '')}`)}
          onSplitView={() => setSplitPatient(patient)}
          onProcess={async () => {
            let settings: any;
            try { const s = localStorage.getItem('ed-app-settings'); if (s) settings = JSON.parse(s); } catch {}
            const res = await fetch('/api/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, settings, promptTemplates: getEffectivePromptTemplates() }),
            });
            if (res.ok) {
              setPinnedRowIndex(patient.rowIndex);
              fetchPatients();
            }
          }}
          onGenerateAnalysis={async () => {
            const educationMode = getEducationConfig().enabled;
            const body = JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, educationMode });
            const headers = { 'Content-Type': 'application/json' };
            setPinnedRowIndex(patient.rowIndex);
            await Promise.all([
              fetch('/api/synopsis', { method: 'POST', headers, body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName }) }),
              fetch('/api/analysis', { method: 'POST', headers, body }),
            ]);
            fetchPatients();
          }}
          onGenerateDdxInvestigations={async () => {
            const educationMode = getEducationConfig().enabled;
            setPinnedRowIndex(patient.rowIndex);
            await fetch('/api/analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, section: 'ddx-investigations', educationMode }),
            });
            fetchPatients();
          }}
          onGenerateManagementEvidence={async () => {
            setPinnedRowIndex(patient.rowIndex);
            await fetch('/api/analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rowIndex: patient.rowIndex, sheetName: patient.sheetName, section: 'management-evidence' }),
            });
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
            setPatients(prev => prev.map(p =>
              p.rowIndex === patient.rowIndex && p.sheetName === patient.sheetName
                ? { ...p, ...fields } : p
            ));
            await fetch(`/api/patients/${patient.rowIndex}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...fields, _sheetName: patient.sheetName, _patientName: patient.name }),
            });
            fetchPatients();
          }}
          onClinicalChat={() => { setChatInitialTab('qa'); setChatPatient(patient); }}
          onMerge={() => setMergeSource(patient)}
          onDateChange={(newSheet) => handleDateChange(patient, newSheet)}
          showEducation={getEducationConfig().enabled}
          showIconsAlways={showCardIcons}
          onSaveResource={(resource) => {
            addSavedResource(resource);
            setSavedResourceKeys(prev => new Set(prev).add(`${patient.rowIndex}:${patient.sheetName}:${resource.type}`));
          }}
          savedResourceKey={(type) => savedResourceKeys.has(`${patient.rowIndex}:${patient.sheetName}:${type}`)}
          onQuickRecordComplete={() => fetchPatients()}
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
    router.push(`/patient/${patient.rowIndex}?sheet=${encodeURIComponent(patient.sheetName)}&name=${encodeURIComponent(patient.name || '')}`);
  };

  if (away.awayScreen) {
    return (
      <AwayScreen
        onClose={() => away.setAwayScreen(false)}
        awayTime={away.awayTime}
        awayWeather={away.awayWeather}
        awayPhotoUrl={away.awayPhotoUrl}
        awayFunFact={away.awayFunFact}
        setAwayFunFact={away.setAwayFunFact}
        awayBreathing={away.awayBreathing}
        setAwayBreathing={away.setAwayBreathing}
        breathPhase={away.breathPhase}
        breathCount={away.breathCount}
        calmPhotoUrl={away.calmPhotoUrl}
        setCalmPhotoUrl={away.setCalmPhotoUrl}
        cyclePhoto={away.cyclePhoto}
      />
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      {/* Collapsible sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside
            className="fixed left-0 top-0 bottom-0 z-50 w-72 overflow-y-auto animate-in slide-in-from-left duration-200"
            style={{ background: 'var(--card-bg)', borderRight: '1px solid var(--card-border)', boxShadow: '4px 0 24px rgba(0,0,0,0.15)' }}
          >
            {/* User header */}
            <div className="px-5 pt-6 pb-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(59,130,246,0.25))', color: 'var(--text-primary)' }}>
                  {(userName || userEmail || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {anonymize ? 'Dr. ***' : userName || 'Doctor'}
                  </div>
                  {!anonymize && (
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{userEmail}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Encounter type */}
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-light)' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider px-2 mb-1" style={{ color: 'var(--text-muted)' }}>Encounter Type</div>
              {encounterTypes.map(et => (
                <button
                  key={et.id}
                  onClick={() => { setActiveEncounterType(et.id); saveEncounterType(et.id); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-[13px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: activeEncounterType === et.id ? 'var(--accent)' : 'var(--text-primary)', background: activeEncounterType === et.id ? 'var(--accent-light)' : undefined }}
                >
                  {et.label}
                  {activeEncounterType === et.id && <span className="ml-auto text-[10px] font-semibold" style={{ color: 'var(--accent)' }}>Active</span>}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="p-3">
              <button
                onClick={() => { setSavedResourcesOpen(true); setSidebarOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left text-[13px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--text-primary)' }}
              >
                <Bookmark className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> Saved Resources
              </button>
              <button
                onClick={() => { setAnonymize(!anonymize); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left text-[13px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--text-primary)' }}
              >
                {anonymize ? <Eye className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> : <EyeOff className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
                {anonymize ? 'Show Names' : 'Anonymize'}
              </button>
              <button
                onClick={() => { away.setAwayScreen(true); setSidebarOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left text-[13px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--text-primary)' }}
              >
                <Monitor className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> Away Screen
              </button>
            </div>

            {/* Footer */}
            <div className="border-t p-3 mt-auto" style={{ borderColor: 'var(--border-light)' }}>
              <button
                onClick={() => { router.push('/settings'); setSidebarOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left text-[13px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--text-primary)' }}
              >
                <Settings className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> Settings
              </button>
              <button
                onClick={() => { setSidebarOpen(false); handleLogout(); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left text-[13px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--text-primary)' }}
              >
                <LogOut className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> Sign Out
              </button>
            </div>
          </aside>
        </>
      )}

      <header className="dash-header sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-[var(--page-px)]">
          {/* Top row: icon + title + date */}
          <div className="flex items-center justify-between py-3">
            {/* Left: icon + title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="ed-icon-btn w-[42px] h-[42px] rounded-[13px] flex items-center justify-center flex-shrink-0 transition-all duration-300 hover:scale-[1.05] active:scale-[0.94]"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
                  boxShadow: '0 0 0 0.5px rgba(255,255,255,0.09), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
                title="Menu"
              >
                <svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Waves — full circles, strongest outside, fading inward */}
                  <circle className="ed-wave ed-w3" cx="18" cy="18" r="16.5" fill="none" stroke="white" strokeWidth="1.6" opacity="0.5" />
                  <circle className="ed-wave ed-w2" cx="18" cy="18" r="13" fill="none" stroke="white" strokeWidth="1.1" opacity="0.25" />
                  <circle className="ed-wave ed-w1" cx="18" cy="18" r="10" fill="none" stroke="white" strokeWidth="0.6" opacity="0.1" />
                  {/* Bell — outer rim */}
                  <circle className="ed-bell-rim" cx="18" cy="18" r="6.5" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.2" />
                  {/* Bell — inner diaphragm ring */}
                  <circle cx="18" cy="18" r="4" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.7" />
                  {/* Bell — stem nub */}
                  <circle cx="18" cy="18" r="1.5" fill="rgba(255,255,255,0.9)" />
                </svg>
              </button>
              <h1 className="text-[17px] font-bold tracking-[-0.02em]" style={{ color: 'var(--dash-text)' }}>ER Dashboard</h1>
            </div>

            {/* Right: date navigation */}
            <div className="flex items-center">
              <button
                onClick={goToPreviousDay}
                className="p-1 hover:bg-white/[0.07] rounded-full transition-colors"
                style={{ color: 'var(--dash-text-sub)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => datePickerRef.current?.showPicker()}
                className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/[0.07] rounded-lg transition-colors"
              >
                <span className="text-[17px] font-bold tracking-[-0.02em]" style={{ color: 'var(--dash-text)' }}>{formatDateDisplay(currentDate)}</span>
                {!loading && patients.length > 0 && (
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.12]" style={{ color: 'var(--dash-text-sub)' }}>
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
                  className="text-[11px] font-semibold px-1.5 py-0.5 rounded text-amber-300 hover:bg-white/[0.07] transition-colors"
                >
                  Today
                </button>
              )}
              {/* Sync Drive JSON → Google Sheets (Sheets is a read-only mirror) */}
              <button
                onClick={handleSyncToSheets}
                disabled={syncing}
                title="Sync patients to Google Sheets"
                className="p-1 hover:bg-white/[0.07] rounded-full transition-colors disabled:opacity-50 ml-1"
                style={{ color: 'var(--dash-text-sub)' }}
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={goToNextDay}
                disabled={isToday}
                className="p-1 hover:bg-white/[0.07] rounded-full transition-colors disabled:opacity-30"
                style={{ color: 'var(--dash-text-sub)' }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Secondary bar: search + shift times */}
          <div className="flex items-center justify-between border-t py-2 gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {/* Left group: checkbox + search + sort + grid */}
            <div className="flex items-center gap-1.5">
              <span
                onClick={() => {
                  const next = !showCardIcons;
                  setShowCardIcons(next);
                  localStorage.setItem('ed-show-card-icons', String(next));
                }}
                title={showCardIcons ? 'Hide card icons' : 'Show card icons'}
                className="w-3 h-3 rounded-[3px] flex-shrink-0 cursor-pointer transition-all duration-200"
                style={{
                  border: `1.5px solid rgba(255,255,255,${showCardIcons ? '0.35' : '0.1'})`,
                  background: showCardIcons ? 'rgba(255,255,255,0.15)' : 'transparent',
                }}
              />
              <div className="relative w-[130px]">
                {searching ? (
                  <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin" style={{ color: 'var(--dash-text-muted)' }} />
                ) : (
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--dash-text-muted)' }} />
                )}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-6.5 pr-6 py-1 rounded-md text-[11px] transition-all duration-200 outline-none"
                  style={{
                    paddingLeft: '1.5rem',
                    background: searchQuery ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--dash-text)',
                  }}
                  onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                  onBlur={(e) => { if (!searchQuery) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; } }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/10"
                  >
                    <X className="w-2.5 h-2.5" style={{ color: 'var(--dash-text-muted)' }} />
                  </button>
                )}
              </div>
              <span
                onClick={() => setSearchAllDates(!searchAllDates)}
                className="cursor-pointer select-none transition-colors"
                style={{ color: searchAllDates ? 'var(--dash-text)' : 'var(--dash-text-muted)', fontSize: '8px', opacity: searchAllDates ? 1 : 0.5 }}
                title={searchAllDates ? 'Searching all dates' : 'Searching today only'}
              >
                ALL
              </span>
              <button
                onClick={() => setSortBy(prev => prev === 'time' ? 'name' : prev === 'name' ? 'status' : prev === 'status' ? 'recent' : 'time')}
                className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium transition-colors hover:bg-white/[0.07]"
                style={{ color: 'var(--dash-text-muted)' }}
                title={`Sort by ${sortBy === 'time' ? 'name' : sortBy === 'name' ? 'status' : sortBy === 'status' ? 'recent' : 'time'}`}
              >
                <ArrowUpDown className="w-3 h-3" />
                <span className="hidden sm:inline">{sortBy === 'time' ? 'Time' : sortBy === 'name' ? 'A-Z' : sortBy === 'status' ? 'Status' : 'Recent'}</span>
              </button>
              <button
                onClick={() => {
                  const next = viewMode === 'list' ? 'grid' : 'list';
                  setViewMode(next);
                  localStorage.setItem('ed-view-mode', next);
                }}
                className="p-1 rounded-md transition-colors hover:bg-white/[0.07]"
                style={{ color: 'var(--dash-text-muted)' }}
                title={viewMode === 'list' ? 'Grid view' : 'List view'}
              >
                {viewMode === 'list' ? <LayoutGrid className="w-3 h-3" /> : <LayoutList className="w-3 h-3" />}
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
                    <span
                      onClick={() => setShowDayTotal(!showDayTotal)}
                      className="text-[11px] font-mono font-medium flex-shrink-0 cursor-pointer hover:bg-white/[0.07] px-1.5 py-0.5 rounded transition-colors"
                      style={{ color: showDayTotal ? 'var(--dash-text)' : 'var(--dash-text-sub)' }}
                      title={showDayTotal ? 'Show fee code' : 'Show day total'}
                    >
                      {showDayTotal ? `$${dayTotal.toFixed(2)}` : shiftCode}
                    </span>
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
                  <div className="absolute right-0 top-full mt-2 z-50 rounded-xl overflow-hidden backdrop-blur-xl text-[13px]" style={{ minWidth: '180px', background: 'color-mix(in srgb, var(--card-bg) 97%, transparent)', border: '1px solid var(--card-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.04)' }}>
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

      {/* Content — split screen when patient detail is open */}
      <div className={`flex ${splitPatient ? 'gap-0' : ''}`} style={{ transition: 'all 300ms ease' }}>
      <main className={`mx-auto px-[var(--page-px)] py-4 transition-all duration-300 ${splitPatient ? 'w-[45%] max-w-none flex-shrink-0' : 'max-w-2xl w-full'}`}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-12 animate-fadeIn space-y-4">
            <p className="text-[var(--text-muted)] mb-2">
              {isToday ? 'No patients yet today' : `No patients on ${sheetName}`}
            </p>
            <button
              onClick={() => setShowParseModal(true)}
              className="px-6 py-3 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:brightness-110 active:scale-[0.97] transition-all flex items-center gap-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              Add Patient
            </button>
          </div>
        ) : (
          <div className="space-y-6 animate-fadeIn">
            {/* Search results banner (search is now in header) */}
            {isSearching && searchResults !== null && !searching && (
              <div className="text-xs text-[var(--text-muted)] px-1">
                {searchResults.length === 0
                  ? (searchAllDates ? 'No patients found across all dates' : 'No patients found today')
                  : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}${searchAllDates ? ' across all dates' : ''}`}
              </div>
            )}


            {/* Quick Add (⌘+click on FAB) */}
            {showQuickAdd && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = quickAddName.trim();
                  if (!name || quickAddSaving) return;
                  setQuickAddSaving(true);
                  try {
                    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                    await handleSavePatient({ name, age: '', gender: '', birthday: '', hcn: '', mrn: '', timestamp, triageVitals: '', transcript: '', encounterNotes: '', additional: '', pastDocs: '' });
                    setQuickAddName('');
                    setShowQuickAdd(false);
                  } finally { setQuickAddSaving(false); }
                }}
                className="flex items-center gap-2 animate-fadeIn"
              >
                <input
                  type="text"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="Patient name..."
                  autoFocus
                  className="flex-1 px-3 py-2 border border-[var(--input-border)] rounded-xl text-sm bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onKeyDown={(e) => { if (e.key === 'Escape') { setShowQuickAdd(false); setQuickAddName(''); } }}
                />
                <button
                  type="submit"
                  disabled={!quickAddName.trim() || quickAddSaving}
                  className="px-3 py-2 bg-[var(--accent-green)] text-white rounded-xl text-sm font-medium hover:brightness-110 active:scale-[0.97] transition-all disabled:opacity-40 flex items-center gap-1.5"
                >
                  {quickAddSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowQuickAdd(false); setQuickAddName(''); }}
                  className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
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
                    <div className={patientListClass}>
                      {pts.map((patient) => renderPatientWithBilling(patient))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <>
                {sortBy !== 'time' ? (
                  /* Non-time sort: flat list, no status grouping */
                  <section>
                    <div className={patientListClass}>
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
                  /* Time sort: chronological order regardless of status */
                  <div className={patientListClass}>
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
                )}
              </>
            )}
          </div>
        )}

      </main>

      {/* Split-view patient detail panel */}
      {splitPatient && (
        <div className="flex-1 min-w-0 border-l border-[var(--border)] overflow-y-auto" style={{ height: 'calc(100vh - 120px)', position: 'sticky', top: '120px' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">{splitPatient.name || 'Patient'}</h2>
              <p className="text-xs text-[var(--text-muted)]">
                {splitPatient.age && `${splitPatient.age}`}{splitPatient.gender && ` ${splitPatient.gender}`}
                {splitPatient.diagnosis && ` — ${splitPatient.diagnosis}`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => router.push(`/patient/${splitPatient.rowIndex}?sheet=${encodeURIComponent(splitPatient.sheetName)}&name=${encodeURIComponent(splitPatient.name || '')}`)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                title="Open full page"
              >
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
              <button
                onClick={() => setSplitPatient(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                title="Close"
              >
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            </div>
          </div>
          <iframe
            src={`/patient/${splitPatient.rowIndex}?sheet=${encodeURIComponent(splitPatient.sheetName)}&name=${encodeURIComponent(splitPatient.name || '')}&embed=1`}
            className="w-full border-0"
            style={{ height: 'calc(100vh - 170px)' }}
          />
        </div>
      )}
      </div>

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
            onClick={resetFabPosition}
            className="absolute -top-3 -left-3 w-3.5 h-3.5 bg-purple-600/35 dark:bg-purple-500/35 rounded-full flex items-center justify-center hover:bg-purple-600/70 dark:hover:bg-purple-400/70 hover:scale-110 opacity-0 scale-75 group-hover/fab:opacity-50 group-hover/fab:scale-100 transition-all duration-200 delay-150 z-10"
            title="Reset position"
          >
            <RotateCcw className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
          </button>
        )}
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            fabPointerDown(e);
          }}
          onClick={(e) => {
            if (fabWasDragged()) return;
            if (e.metaKey || e.ctrlKey) {
              setShowQuickAdd(true);
            } else {
              setShowParseModal(true);
            }
          }}
          className="w-14 h-14 text-white rounded-2xl flex items-center justify-center active:scale-[0.93] transition-all duration-200 touch-none select-none cursor-grab active:cursor-grabbing"
          style={{
            background: metaHeld ? 'var(--accent-green)' : 'var(--accent)',
            boxShadow: metaHeld ? '0 4px 14px rgba(13,148,136,0.4)' : 'var(--fab-shadow)',
          }}
          title={metaHeld ? 'Quick add patient (name only)' : 'Add patient · ⌘+click to quick add'}
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
        onQuickAdd={async (name) => {
          await handleSavePatient({
            name, age: '', gender: '', birthday: '', hcn: '', mrn: '',
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            triageVitals: '', transcript: '', encounterNotes: '', additional: '', pastDocs: '',
          });
        }}
      />

      {/* Patient Data Entry Modal */}
      <PatientDataModal
        patient={dataModalPatient}
        isOpen={!!dataModalPatient}
        onClose={() => setDataModalPatient(null)}
        onSaved={() => fetchPatients()}
        onGenerated={() => { if (dataModalPatient) setPinnedRowIndex(dataModalPatient.rowIndex); fetchPatients(); }}
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

      {/* Clinical Chat + Calculator Modal */}
      {chatPatient && (
        <ClinicalChatModal
          isOpen={!!chatPatient}
          onClose={() => { setChatPatient(null); setChatInitialTab('qa'); }}
          patient={chatPatient}
          onUpdate={() => fetchPatients()}
          initialTab={chatInitialTab}
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
