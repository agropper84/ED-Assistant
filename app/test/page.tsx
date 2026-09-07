'use client';

import { useState, useEffect, useCallback } from 'react';
import { TestProviders, useBoard } from './providers';
import { BoardHeader } from './components/board/BoardHeader';
import { BoardSidebar } from './components/board/BoardSidebar';
import { PatientChart } from './components/chart/PatientChart';
import { PatientCardV2 } from './components/board/PatientCardV2';
import { FilterRow } from './components/board/FilterRow';
import { CommandPalette } from './components/overlays/CommandPalette';
import { AddPatientModal } from './components/overlays/AddPatientModal';
import { Loader2 } from 'lucide-react';

function BoardContent() {
  const { nav, loading, filteredPatients, selectedId, setSelectedId, selectedPatient } = useBoard();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: '8px', color: 'var(--warm-text-3)', fontSize: '14px',
      }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        Loading patients...
      </div>
    );
  }

  // Split view
  if (nav === 'split') {
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
        <BoardSidebar />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {selectedPatient ? (
            <PatientChart patient={selectedPatient} onBack={() => setSelectedId(null)} />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--warm-text-3)', fontSize: '14px', background: 'var(--warm-bg)',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--warm-text-2)', marginBottom: '6px' }}>
                  Select a patient
                </div>
                <div>Choose a patient from the sidebar to view their chart.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Grid view
  if (nav === 'grid') {
    return (
      <div style={{ padding: '0 18px 18px' }}>
        <FilterRow />
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px',
        }}>
          {filteredPatients.map(p => (
            <PatientCardV2 key={p.rowIndex} patient={p}
              selected={selectedId === p.rowIndex}
              onSelect={() => setSelectedId(selectedId === p.rowIndex ? null : p.rowIndex)} />
          ))}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div style={{ padding: '0 18px 18px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
      <FilterRow />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredPatients.map(p => (
          <PatientCardV2 key={p.rowIndex} patient={p}
            selected={selectedId === p.rowIndex}
            onSelect={() => setSelectedId(selectedId === p.rowIndex ? null : p.rowIndex)} />
        ))}
      </div>
    </div>
  );
}

function AppShell() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
      if (e.key === 'Escape') {
        setCmdOpen(false);
        setAddOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <BoardHeader onSearchClick={() => setCmdOpen(true)} onAddClick={() => setAddOpen(true)} />
      <main style={{ flex: 1, overflow: 'hidden' }}>
        <BoardContent />
      </main>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <AddPatientModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

export default function TestPage() {
  return (
    <TestProviders>
      <AppShell />
    </TestProviders>
  );
}
