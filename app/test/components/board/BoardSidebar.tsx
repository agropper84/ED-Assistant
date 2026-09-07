'use client';

import { useBoard } from '../../providers';
import { FilterRow } from './FilterRow';
import { PatientCardV2 } from './PatientCardV2';

export function BoardSidebar() {
  const { filteredPatients, selectedId, setSelectedId } = useBoard();

  return (
    <aside style={{
      width: '360px',
      flexShrink: 0,
      borderRight: '1px solid var(--warm-border)',
      display: 'flex',
      flexDirection: 'column' as const,
      height: '100%',
      overflow: 'hidden',
      background: 'var(--warm-bg)',
    }}>
      <FilterRow />

      <div style={{
        flex: 1,
        overflowY: 'auto' as const,
        padding: '0 14px 14px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '8px',
      }}>
        {filteredPatients.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center' as const,
            color: 'var(--warm-text-3)',
            fontSize: '13px',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--warm-text-2)', marginBottom: '6px' }}>
              No patients yet today
            </div>
            Add a patient by hand or paste a Meditech export to start the board.
          </div>
        ) : (
          filteredPatients.map(p => (
            <PatientCardV2
              key={p.rowIndex}
              patient={p}
              selected={selectedId === p.rowIndex}
              onSelect={() => setSelectedId(selectedId === p.rowIndex ? null : p.rowIndex)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
