'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Patient } from '@/lib/google-sheets';
import { getPromptTemplates } from '@/lib/settings';
import { PatientCard } from '@/components/PatientCard';
import { ParseModal } from '@/components/ParseModal';
import { PatientDataModal } from '@/components/PatientDataModal';
import { BatchTranscribeModal } from '@/components/BatchTranscribeModal';
import { ClinicalChatModal } from '@/components/ClinicalChatModal';
import { MergeModal } from '@/components/MergeModal';
import { PendingAudioBanner } from '@/components/PendingAudioBanner';
import { InlineBilling } from '@/components/BillingSection';
import {
  BillingItem,
  parseBillingItems,
} from '@/lib/billing';
import {
  Plus, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Calendar, Settings, CheckSquare, Square, Play, Clock, EyeOff, Eye,
  Search, ArrowUpDown, X, LogOut, Upload, Shield, Monitor, RotateCcw, Sparkles
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

// Away screen photos — landscape, wildlife, comedy wildlife (Unsplash)
const AWAY_PHOTOS = [
  // Landscapes
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80', // alpine mountains
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80', // forest valley
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80', // forest sunlight
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&q=80', // ocean waves
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80', // green rolling hills
  'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=1920&q=80', // mountain lake
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80', // tropical beach
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80', // dramatic mountain peak
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1920&q=80', // lake sunrise
  'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1920&q=80', // waterfall bridge
  'https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1920&q=80', // autumn forest
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920&q=80', // sunlit valley
  'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=1920&q=80', // sunset silhouette
  'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80', // starry night sky
  'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=1920&q=80', // pine trees
  // Wildlife
  'https://images.unsplash.com/photo-1474511320723-9a56873571b7?w=1920&q=80', // eagle soaring
  'https://images.unsplash.com/photo-1535338454528-1b5f0e27c1df?w=1920&q=80', // fox in snow
  'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=1920&q=80', // giraffe
  'https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=1920&q=80', // parrot
  'https://images.unsplash.com/photo-1484406743394-e9e29e8fc94d?w=1920&q=80', // puppy in blanket
  'https://images.unsplash.com/photo-1425082661507-d6d2f7b7f4b7?w=1920&q=80', // deer in meadow
  'https://images.unsplash.com/photo-1474314243412-cd4a79f02c6a?w=1920&q=80', // penguin group
  'https://images.unsplash.com/photo-1543946207-39bd91e70ca7?w=1920&q=80', // sleeping cat
  'https://images.unsplash.com/photo-1452857297128-d9c29adba80b?w=1920&q=80', // owl portrait
  'https://images.unsplash.com/photo-1497752531616-c3afd9760a11?w=1920&q=80', // raccoon
  // Comedy / fun wildlife
  'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=1920&q=80', // goofy dog close-up
  'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=1920&q=80', // pug with tongue out
  'https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?w=1920&q=80', // happy dog smiling
  'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=1920&q=80', // dog with sunglasses
  'https://images.unsplash.com/photo-1415369629372-26f2fe60c467?w=1920&q=80', // otter floating
];

// Fun facts and jokes for the away screen
const AWAY_FUN = [
  // Medical humor
  "Why did the doctor carry a red pen? In case they needed to draw blood.",
  "A man walks into the ER and says \"I broke my arm in two places.\" The doctor replies: \"Stop going to those places.\"",
  "What's the difference between a surgeon and a physician? A surgeon knows nothing and does everything. A physician knows everything and does nothing.",
  "Why do ER doctors make great DJs? They're used to dealing with codes.",
  "What did the ER nurse say to the impatient patient? \"You'll just have to be patient.\"",
  "The best time to go to the ER is when you don't need to.",
  "A cardiologist's diet: everything in moderation... except coffee.",
  "Ortho consult note: \"Bones appear bony.\"",
  "Radiology called. They want to know if the patient has any history of being alive.",
  "\"Stat\" is Latin for \"whenever you get around to it\" in some departments.",

  // Genuinely interesting medical/science facts
  "Your body produces about 3.8 million cells every second. By the time you finish reading this, you've made about 20 million new ones.",
  "The human nose can detect over 1 trillion different scents.",
  "A human sneeze can travel at speeds up to 160 km/h (100 mph).",
  "Your stomach lining replaces itself every 3-4 days to prevent it from digesting itself.",
  "The cornea is the only part of the body with no blood supply \u2014 it gets oxygen directly from the air.",
  "Humans share about 60% of their DNA with bananas.",
  "Your brain uses roughly 20% of your body's total energy despite being only 2% of your body weight.",
  "The human body contains enough iron to make a 7.5 cm (3-inch) nail.",
  "Babies are born with about 300 bones, but adults have only 206 \u2014 many fuse together as you grow.",
  "The acid in your stomach (pH 1.5-3.5) is strong enough to dissolve metal.",
  "A red blood cell takes about 20 seconds to complete a full circuit of the body.",
  "Your left lung is about 10% smaller than your right lung to make room for your heart.",
  "The average person walks about 160,000 km (100,000 miles) in a lifetime \u2014 enough to circle the Earth 4 times.",
  "The human brain can store roughly 2.5 petabytes of information \u2014 about 3 million hours of TV.",
  "Fingernails grow about 3.5 mm per month, roughly 4 times faster than toenails.",
  "Your body has about 96,000 km (60,000 miles) of blood vessels.",
  "The small intestine is about 6 meters (20 feet) long \u2014 roughly 3 times the height of an average person.",
  "Humans can survive without food for weeks, but only about 3 days without water.",
  "The strongest muscle in the human body, relative to its size, is the masseter (jaw muscle).",
  "Your eyes can distinguish approximately 10 million different colors.",
  "Pound for pound, bone is stronger than steel. A cubic inch of bone can bear a load of 8,600 kg (19,000 lbs).",
  "The liver is the only organ that can completely regenerate. You can lose 75% of it and it will grow back.",
  "Astronauts can grow up to 5 cm (2 inches) taller in space because the spine expands without gravity.",
  "Octopuses have three hearts: two pump blood to the gills, and one pumps it to the rest of the body.",
  "A single bolt of lightning contains enough energy to toast about 100,000 slices of bread.",
  "Honey never spoils. Edible honey has been found in 3,000-year-old Egyptian tombs.",
  "There are more possible chess games than atoms in the observable universe.",
  "Tardigrades (water bears) can survive in the vacuum of space, extreme radiation, and temperatures from -272\u00b0C to 150\u00b0C.",
  "A day on Venus is longer than a year on Venus \u2014 it takes 243 Earth days to rotate but only 225 to orbit the sun.",
  "The total length of DNA in all your cells would stretch from the Earth to the Sun and back about 600 times.",
];

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
  const [awayPhotoIndex, setAwayPhotoIndex] = useState(0);
  const [awayFunFact, setAwayFunFact] = useState('');

  // Dashboard billing
  const [billingPatientIdx, setBillingPatientIdx] = useState<number | null>(null);

  // User info
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');

  // Batch transcribe
  const [showBatchTranscribe, setShowBatchTranscribe] = useState(false);

  // Clinical chat
  const [chatPatient, setChatPatient] = useState<Patient | null>(null);
  const [mergeSource, setMergeSource] = useState<Patient | null>(null);

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
        const res = await fetch(`/api/patients?search=${encodeURIComponent(q)}`);
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

  // Filter and sort patients — use cross-sheet search results when searching
  const isSearching = searchQuery.trim().length >= 2;
  const activePatients = isSearching && searchResults !== null ? searchResults : patients;

  const sortedPatients = [...activePatients].sort((a, b) => {
    if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    }
    // When searching across dates, sort by date (sheetName) then time
    if (isSearching) {
      const dateCompare = (b.sheetName || '').localeCompare(a.sheetName || '');
      if (dateCompare !== 0) return dateCompare;
    }
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
          onClinicalChat={() => setChatPatient(patient)}
          onMerge={() => setMergeSource(patient)}
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
          onClick={(e) => { e.stopPropagation(); setAwayScreen(false); setAwayFunFact(''); }}
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

        {/* Sparkle icon — random fact */}
        <div
          className="absolute bottom-6 right-6 z-30 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setAwayFunFact(AWAY_FUN[Math.floor(Math.random() * AWAY_FUN.length)]);
          }}
        >
          <div className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all duration-200" style={{ backdropFilter: 'blur(8px)' }}>
            <Sparkles className="w-6 h-6 text-white/80" />
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
                      onClick={() => { setAwayPhotoIndex(Math.floor(Math.random() * AWAY_PHOTOS.length)); setAwayScreen(true); setPrivacyMenuOpen(false); }}
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
                {!loading && patients.length > 0 && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-white/15" style={{ color: 'var(--dash-text-sub)' }}>
                    {patients.length}
                  </span>
                )}
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
                <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--dash-text-sub)' }}>{shiftHours}h</span>
              )}
              {shiftCode && (
                <span className="text-[11px] font-mono font-medium flex-shrink-0" style={{ color: 'var(--dash-text-sub)' }}>{shiftCode}</span>
              )}
            </div>
          </div>
        </div>
      </header>

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
                onClick={() => setSortBy(prev => prev === 'time' ? 'name' : 'time')}
                className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] flex-shrink-0"
                title={`Sort by ${sortBy === 'time' ? 'name' : 'time'}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {sortBy === 'time' ? 'Time' : 'Name'}
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
                className="w-full py-3 bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 rounded-xl font-medium flex items-center justify-center gap-2 border border-amber-200 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/50 active:scale-[0.99] transition-all"
              >
                <Play className="w-4 h-4" />
                Batch Process ({pendingPatients.length} pending)
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
          </div>
        )}

        {/* Batch upload button below patient list */}
        <button
          onClick={() => setShowBatchTranscribe(true)}
          className="w-full mt-6 py-3 flex items-center justify-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-[var(--card-bg)] border border-dashed border-[var(--border)] rounded-2xl hover:border-[var(--text-muted)] transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload Batch Transcript for {sheetName}
        </button>
      </main>

      {/* FAB - Add Patient (draggable) */}
      <div
        ref={fabRef}
        className="fixed z-50"
        style={fabPos
          ? { left: fabPos.x, top: fabPos.y }
          : { bottom: 24, right: 24 }
        }
      >
        {fabPos && (
          <button
            onClick={() => setFabPos(null)}
            className="absolute -top-2 -left-2 w-5 h-5 bg-[var(--card-bg)] border border-[var(--border)] rounded-full flex items-center justify-center shadow-md hover:bg-[var(--bg-tertiary)] transition-colors"
            title="Reset position"
          >
            <RotateCcw className="w-2.5 h-2.5 text-[var(--text-muted)]" />
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
          <Plus className="w-6 h-6 pointer-events-none" />
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
