'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import useSWR from 'swr';
import type { Patient } from '@/lib/google-sheets';

// --- Types ---

export type BoardFilter = 'all' | 'new' | 'pending' | 'done';
export type BoardNav = 'split' | 'list' | 'grid';
export type ChartTab = 'encounter' | 'transcript' | 'billing' | 'ask' | 'data';

function getStatus(p: Patient): string {
  if (p.status === 'processed' || p.hpi || p.objective || p.assessmentPlan) return 'done';
  if (p.status === 'pending' || p.transcript || p.encounterNotes) return 'pending';
  return 'new';
}

// --- Board Context ---

interface BoardState {
  patients: Patient[];
  sheetName: string;
  filter: BoardFilter;
  selectedId: number | null;
  nav: BoardNav;
  loading: boolean;
  filteredPatients: Patient[];
  selectedPatient: Patient | null;
  counts: { all: number; new: number; pending: number; done: number };
  setFilter: (f: BoardFilter) => void;
  setSelectedId: (id: number | null) => void;
  setNav: (n: BoardNav) => void;
  refreshPatients: () => void;
}

const BoardContext = createContext<BoardState | null>(null);

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard must be inside BoardProvider');
  return ctx;
}

// --- Shell Context ---

interface ShellState {
  toast: string | null;
  showToast: (msg: string) => void;
}

const ShellContext = createContext<ShellState | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be inside ShellProvider');
  return ctx;
}

// --- Fetcher ---

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error('Fetch failed');
  return r.json();
});

// --- Provider ---

function getTodaySheetName(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

export function TestProviders({ children }: { children: ReactNode }) {
  const [sheetName] = useState(getTodaySheetName);
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nav, setNav] = useState<BoardNav>('split');
  const [toast, setToast] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR(
    `/api/patients?sheet=${encodeURIComponent(sheetName)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  );

  const patients: Patient[] = data?.patients || [];

  const filteredPatients = useMemo(() => {
    if (filter === 'all') return patients;
    return patients.filter(p => {
      const s = getStatus(p);
      if (filter === 'done') return s === 'done';
      return s === filter;
    });
  }, [patients, filter]);

  const selectedPatient = useMemo(
    () => patients.find(p => p.rowIndex === selectedId) || null,
    [patients, selectedId]
  );

  const counts = useMemo(() => ({
    all: patients.length,
    new: patients.filter(p => getStatus(p) === 'new').length,
    pending: patients.filter(p => getStatus(p) === 'pending').length,
    done: patients.filter(p => getStatus(p) === 'done').length,
  }), [patients]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const boardValue: BoardState = {
    patients,
    sheetName,
    filter,
    selectedId,
    nav,
    loading: isLoading,
    filteredPatients,
    selectedPatient,
    counts,
    setFilter,
    setSelectedId,
    setNav,
    refreshPatients: () => mutate(),
  };

  const shellValue: ShellState = { toast, showToast };

  return (
    <BoardContext.Provider value={boardValue}>
      <ShellContext.Provider value={shellValue}>
        {children}
        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed',
            top: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--warm-text)',
            color: 'var(--warm-bg)',
            borderRadius: 'var(--warm-radius-pill)',
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: 'var(--warm-shadow-hover)',
            animation: 'warm-slideUp 200ms var(--warm-ease) both',
            pointerEvents: 'none' as const,
          }}>
            {toast}
          </div>
        )}
      </ShellContext.Provider>
    </BoardContext.Provider>
  );
}
