'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import type { Patient } from '@/lib/google-sheets';
import { parseBillingItems, calculateTotal, getAllBillingCodes, type BillingItem } from '@/lib/billing';
import { Eyebrow } from '../primitives/Eyebrow';
import { Button } from '../primitives/Button';

function CodeRow({ item, onToggle }: { item: BillingItem & { enabled: boolean }; onToggle: () => void }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '11px 16px',
      minHeight: '48px',
      opacity: item.enabled ? 1 : 0.45,
      borderBottom: '1px solid var(--warm-border)',
    }}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={item.enabled}
        onChange={onToggle}
        style={{
          width: '22px', height: '22px', borderRadius: '7px',
          accentColor: 'var(--warm-accent)',
          cursor: 'pointer', flexShrink: 0,
        }}
      />
      {/* Code */}
      <span style={{
        fontSize: '14px', fontWeight: 650, fontVariantNumeric: 'tabular-nums',
        color: 'var(--warm-accent)', width: '60px', flexShrink: 0,
      }}>
        {item.code}
      </span>
      {/* Description */}
      <span style={{ flex: 1, fontSize: '13px', color: 'var(--warm-text-2)' }}>
        {item.description}
      </span>
      {/* Unit */}
      <span style={{
        fontSize: '13px', fontVariantNumeric: 'tabular-nums',
        color: 'var(--warm-text-3)', width: '30px', textAlign: 'center' as const,
      }}>
        {item.unit || '1'}
      </span>
      {/* Line total */}
      <span style={{
        fontSize: '14px', fontWeight: 650, fontVariantNumeric: 'tabular-nums',
        color: item.enabled ? 'var(--warm-text)' : 'var(--warm-text-3)',
        width: '70px', textAlign: 'right' as const,
      }}>
        ${(parseFloat(item.fee || '0') * parseInt(item.unit || '1')).toFixed(2)}
      </span>
    </div>
  );
}

export function BillingTab({ patient }: { patient: Patient }) {
  const [codeQuery, setCodeQuery] = useState('');

  // Parse existing billing items
  const existingItems = parseBillingItems(
    patient.visitProcedure || '', patient.procCode || '', patient.fee || '', patient.unit || ''
  );

  const itemsWithState = existingItems.map(item => ({ ...item, enabled: true }));

  // Code search
  const allCodes = getAllBillingCodes();
  const searchResults = codeQuery.trim()
    ? allCodes.filter(c =>
        c.code.includes(codeQuery) ||
        c.description.toLowerCase().includes(codeQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  // Calculate total
  const total = calculateTotal(existingItems);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
      {/* Billing codes from note */}
      <div style={{
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--warm-border)' }}>
          <Eyebrow>BILLING CODES</Eyebrow>
          {existingItems.length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--warm-text-3)', marginTop: '2px' }}>
              {existingItems.length} code{existingItems.length !== 1 ? 's' : ''} · tap to include/exclude
            </div>
          )}
        </div>

        {itemsWithState.length > 0 ? (
          itemsWithState.map((item, idx) => (
            <CodeRow key={idx} item={item} onToggle={() => {}} />
          ))
        ) : (
          <div style={{ padding: '30px 20px', textAlign: 'center' as const, color: 'var(--warm-text-3)', fontSize: '13px' }}>
            No billing codes yet. Generate the encounter note first, or add codes manually.
          </div>
        )}
      </div>

      {/* Add a code */}
      <div style={{
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        padding: '13px 16px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--warm-surface-2)', borderRadius: 'var(--warm-radius-input)',
          border: '1px solid var(--warm-border)', padding: '0 12px',
        }}>
          <Search size={15} style={{ color: 'var(--warm-text-3)', flexShrink: 0 }} />
          <input
            type="text"
            value={codeQuery}
            onChange={(e) => setCodeQuery(e.target.value)}
            placeholder="Add a code — number or description…"
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontSize: '14px', padding: '10px 0', color: 'var(--warm-text)',
              fontFamily: 'var(--warm-font)',
            }}
          />
        </div>

        {searchResults.length > 0 && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column' as const, gap: '2px' }}>
            {searchResults.map(code => (
              <button
                key={code.code}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px', borderRadius: '8px', border: 'none',
                  background: 'transparent', cursor: 'pointer', width: '100%',
                  textAlign: 'left' as const, fontFamily: 'var(--warm-font)',
                  transition: 'background var(--warm-dur-fast)',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--warm-accent)', fontVariantNumeric: 'tabular-nums', width: '50px' }}>
                  {code.code}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--warm-text-2)', flex: 1 }}>
                  {code.description}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--warm-text-3)', fontVariantNumeric: 'tabular-nums' }}>
                  ${code.fee}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      <div style={{
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        padding: '15px 17px',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          paddingTop: '8px',
          borderTop: '1px solid var(--warm-border)',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--warm-text-2)' }}>
            Claim total
          </span>
          <span style={{
            fontSize: '17px', fontWeight: 650, color: 'var(--warm-accent)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            ${total || '0.00'}
          </span>
        </div>
      </div>
    </div>
  );
}
