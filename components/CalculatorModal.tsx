'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Calculator, ExternalLink, Loader2, ArrowLeft } from 'lucide-react';
import { Patient } from '@/lib/google-sheets';

interface CalcVariable {
  id: string;
  label: string;
  unit: string;
  type: 'number' | 'select';
  options?: { label: string; value: number }[];
  value: number | null;
  source: 'patient' | null;
}

interface CalcSpec {
  name: string;
  variables: CalcVariable[];
  formula: string;
  mdcalcUrl: string | null;
}

interface CalcMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
}

function renderWithLinks(text: string): React.ReactNode[] {
  if (!text) return [text];
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)<>]+)/g);
  return parts.map((part, i) => {
    const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (mdMatch) return <a key={i} href={mdMatch[2]} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">{mdMatch[1]}</a>;
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">{part}</a>;
    return part;
  });
}

function TypingDots() {
  return (
    <div className="flex justify-start animate-msgIn">
      <div className="bg-[var(--bg-tertiary)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-2 h-2 rounded-full bg-[var(--text-muted)]"
            style={{ animation: `typingDot 1.2s ease-in-out ${i * 0.15}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

const QUICK_CALCS = [
  'CrCl (Cockcroft-Gault)',
  'GFR (CKD-EPI)',
  'HEART Score',
  'Wells Score (PE)',
  'CURB-65',
  'PECARN',
  'Canadian C-Spine',
  'Peds dose calculator',
];

export function CalculatorModal({ isOpen, onClose, patient }: CalculatorModalProps) {
  const [messages, setMessages] = useState<CalcMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [calcSpec, setCalcSpec] = useState<CalcSpec | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setInput('');
      setCalcSpec(null);
      setVarValues({});
      setResult(null);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, calcSpec, result]);

  if (!isOpen) return null;

  const patientPayload = {
    name: patient.name, age: patient.age, gender: patient.gender,
    weight: '', triageVitals: patient.triageVitals,
    transcript: patient.transcript, additional: patient.additional,
    diagnosis: patient.diagnosis,
  };

  const handleSelectCalc = async (query: string) => {
    setLoading(true);
    setCalcSpec(null);
    setResult(null);
    setMessages([{ role: 'user', content: query }]);

    try {
      const res = await fetch('/api/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, patient: patientPayload, mode: 'variables' }),
      });
      if (!res.ok) throw new Error();
      const { variables } = await res.json();
      if (variables?.variables) {
        setCalcSpec(variables);
        // Pre-fill values
        const initial: Record<string, string> = {};
        for (const v of variables.variables) {
          initial[v.id] = v.value !== null && v.value !== undefined ? String(v.value) : '';
        }
        setVarValues(initial);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to load calculator. Try asking as a free-form question.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    if (!calcSpec) return;
    setCalculating(true);
    setResult(null);

    const labeledVars: Record<string, string> = {};
    for (const v of calcSpec.variables) {
      const val = varValues[v.id] || '';
      labeledVars[v.label] = val + (v.unit ? ` ${v.unit}` : '');
    }

    try {
      const res = await fetch('/api/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: calcSpec.name,
          patient: patientPayload,
          mode: 'calculate',
          variables: labeledVars,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult(data.result);
    } catch {
      setResult('Calculation failed. Please check your inputs.');
    } finally {
      setCalculating(false);
    }
  };

  const handleFreeForm = async (query?: string) => {
    const q = (query || input).trim();
    if (!q || loading) return;
    if (!query) setInput('');
    setCalcSpec(null);
    setResult(null);
    setLoading(true);

    const newMessages = [...messages, { role: 'user' as const, content: q }];
    setMessages(newMessages);

    try {
      const res = await fetch('/api/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q, patient: patientPayload,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.result }]);
    } catch {
      setMessages(prev => prev.slice(0, -1));
      if (!query) setInput(q);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setCalcSpec(null);
    setVarValues({});
    setResult(null);
    setMessages([]);
  };

  const allVarsFilled = calcSpec?.variables.every(v => varValues[v.id]?.trim()) ?? false;

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center">
      <div
        className="bg-[var(--card-bg)] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl flex flex-col animate-slideUp"
        style={{ boxShadow: 'var(--card-shadow-elevated)', height: 'min(88vh, 680px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] flex-shrink-0">
          {calcSpec && (
            <button onClick={handleBack} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
              <ArrowLeft className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          )}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {calcSpec ? calcSpec.name : 'Medical Calculator'}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {loading || calculating ? 'Working...' : patient.name || 'Patient'}
            </p>
          </div>
          {calcSpec?.mdcalcUrl && (
            <a href={calcSpec.mdcalcUrl} target="_blank" rel="noopener noreferrer"
              className="p-1.5 text-[var(--text-muted)] hover:text-orange-500 rounded transition-colors" title="Open on MDCalc">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={onClose} className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-[var(--bg-tertiary)] rounded-full flex-shrink-0">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Variable input form */}
          {calcSpec && !result && (
            <div className="animate-fadeIn space-y-3">
              {calcSpec.formula && (
                <p className="text-xs text-[var(--text-muted)] italic">{calcSpec.formula}</p>
              )}
              {calcSpec.variables.map(v => (
                <div key={v.id}>
                  <label className="flex items-baseline justify-between mb-1">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{v.label}</span>
                    {v.unit && <span className="text-[10px] text-[var(--text-muted)]">{v.unit}</span>}
                  </label>
                  {v.type === 'select' && v.options ? (
                    <select
                      value={varValues[v.id] || ''}
                      onChange={(e) => setVarValues(prev => ({ ...prev, [v.id]: e.target.value }))}
                      className="w-full p-2.5 border border-[var(--input-border)] rounded-xl text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Select...</option>
                      {v.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      value={varValues[v.id] || ''}
                      onChange={(e) => setVarValues(prev => ({ ...prev, [v.id]: e.target.value }))}
                      placeholder={v.unit || 'Enter value'}
                      className="w-full p-2.5 border border-[var(--input-border)] rounded-xl text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  )}
                  {v.source === 'patient' && v.value !== null && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 block">Auto-filled from patient data</span>
                  )}
                </div>
              ))}
              <button
                onClick={handleCalculate}
                disabled={!allVarsFilled || calculating}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
              >
                {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                Calculate
              </button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="animate-msgIn bg-[var(--bg-tertiary)] rounded-2xl p-4 text-sm leading-relaxed text-[var(--text-primary)]">
              <div className="whitespace-pre-wrap">{renderWithLinks(result)}</div>
            </div>
          )}

          {/* Chat messages (free-form mode) */}
          {!calcSpec && messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-orange-500 text-white rounded-2xl rounded-br-lg'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-2xl rounded-bl-lg'
              } ${i === messages.length - 1 ? 'animate-msgIn' : ''}`}>
                <div className="whitespace-pre-wrap">{renderWithLinks(msg.content)}</div>
              </div>
            </div>
          ))}

          {loading && <TypingDots />}

          {/* Empty state */}
          {!calcSpec && messages.length === 0 && !loading && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400/20 to-orange-600/20 flex items-center justify-center mb-3">
                  <Calculator className="w-7 h-7 text-orange-500" />
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Medical Calculator</p>
                <p className="text-xs text-[var(--text-muted)] max-w-[260px]">
                  Select a calculator or type any calculation. Patient data is auto-filled where available.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {QUICK_CALCS.map(calc => (
                  <button
                    key={calc}
                    onClick={() => handleSelectCalc(calc)}
                    className="px-2.5 py-1.5 text-[11px] font-medium bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 rounded-full hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                  >
                    {calc}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input — always available for free-form questions */}
        <div className="px-3 py-2.5 pb-safe border-t border-[var(--border)] bg-[var(--card-bg)] sm:rounded-b-3xl flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFreeForm(); } }}
              placeholder={calcSpec ? 'Ask a follow-up...' : 'Calculate CrCl, dose, score...'}
              rows={1}
              className="flex-1 resize-none py-2.5 px-4 border border-[var(--input-border)] rounded-full text-base focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              style={{ maxHeight: '100px' }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                const h = Math.min(t.scrollHeight, 100);
                t.style.height = h + 'px';
                if (h > 44) { t.classList.remove('rounded-full'); t.classList.add('rounded-xl'); }
                else { t.classList.remove('rounded-xl'); t.classList.add('rounded-full'); }
              }}
            />
            <button
              onClick={() => handleFreeForm()}
              disabled={!input.trim() || loading}
              className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all flex-shrink-0 ${
                input.trim() && !loading
                  ? 'bg-orange-500 text-white hover:bg-orange-600 active:scale-90'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
              }`}
            >
              <Send className="w-5 h-5" style={{ transform: 'rotate(-45deg) translateX(1px)' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
