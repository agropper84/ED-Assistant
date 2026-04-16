'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, ExternalLink, Calculator, Loader2, ArrowLeft } from 'lucide-react';
import { Patient } from '@/lib/google-sheets';

interface QAMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

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

interface ClinicalChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  onUpdate: () => void;
  initialTab?: 'qa' | 'calculator';
}

/** Render markdown links as clickable <a> tags */
function renderWithLinks(text: string): React.ReactNode[] {
  if (!text) return [text];
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)<>]+)/g);
  return parts.map((part, i) => {
    const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (mdMatch) {
      return (
        <a key={i} href={mdMatch[2]} target="_blank" rel="noopener noreferrer"
          className="underline opacity-80 hover:opacity-100"
        >{mdMatch[1]}</a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          className="underline opacity-80 hover:opacity-100"
        >{part}</a>
      );
    }
    return part;
  });
}

/** Typing indicator with three animated dots */
function TypingIndicator() {
  return (
    <div className="flex justify-start animate-msgIn">
      <div className="bg-[var(--bg-tertiary)] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-[var(--text-muted)]"
            style={{
              animation: `typingDot 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Format time for message timestamp */
function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Basic calculator widget */
function BasicCalc() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleNum = (n: string) => {
    if (fresh) { setDisplay(n === '.' ? '0.' : n); setFresh(false); }
    else { setDisplay(prev => prev === '0' && n !== '.' ? n : prev + n); }
  };

  const handleOp = (o: string) => {
    const cur = parseFloat(display);
    if (prev !== null && op && !fresh) {
      const r = calc(prev, cur, op);
      setDisplay(String(r));
      setPrev(r);
    } else {
      setPrev(cur);
    }
    setOp(o);
    setFresh(true);
  };

  const handleEq = () => {
    if (prev === null || !op) return;
    const cur = parseFloat(display);
    const r = calc(prev, cur, op);
    setDisplay(String(r));
    setPrev(null);
    setOp(null);
    setFresh(true);
  };

  const handleClear = () => {
    setDisplay('0'); setPrev(null); setOp(null); setFresh(true);
  };

  const handleBackspace = () => {
    setDisplay(d => {
      if (d.length <= 1 || d === '0') return '0';
      return d.slice(0, -1);
    });
  };

  const calc = (a: number, b: number, o: string) => {
    switch (o) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') { handleNum(e.key); e.preventDefault(); }
      else if (e.key === '.') { handleNum('.'); e.preventDefault(); }
      else if (e.key === '+') { handleOp('+'); e.preventDefault(); }
      else if (e.key === '-') { handleOp('-'); e.preventDefault(); }
      else if (e.key === '*') { handleOp('*'); e.preventDefault(); }
      else if (e.key === '/') { handleOp('/'); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === '=') { handleEq(); e.preventDefault(); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { handleBackspace(); e.preventDefault(); }
      else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') { handleClear(); e.preventDefault(); }
      else if (e.key === '%') { setDisplay(d => String(parseFloat(d) / 100)); e.preventDefault(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  useEffect(() => { containerRef.current?.focus(); }, []);

  const btn = (label: string, action: () => void, cls: string = '') => (
    <button onClick={action}
      className={`py-3 rounded-xl text-base font-medium transition-colors active:scale-95 ${cls}`}
    >{label}</button>
  );

  return (
    <div className="space-y-2 animate-fadeIn" ref={containerRef} tabIndex={-1} style={{ outline: 'none' }}>
      <div className="bg-[var(--bg-tertiary)] rounded-xl px-4 py-3 text-right">
        <div className="text-[10px] text-[var(--text-muted)] h-4">
          {prev !== null && op ? `${prev} ${op}` : ''}
        </div>
        <div className="text-2xl font-mono text-[var(--text-primary)] truncate">{display}</div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {btn('C', handleClear, 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400')}
        {btn('±', () => setDisplay(d => String(-parseFloat(d))), 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]')}
        {btn('%', () => setDisplay(d => String(parseFloat(d) / 100)), 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]')}
        {btn('÷', () => handleOp('/'), 'bg-teal-600 text-white')}

        {btn('7', () => handleNum('7'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('8', () => handleNum('8'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('9', () => handleNum('9'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('×', () => handleOp('*'), 'bg-teal-600 text-white')}

        {btn('4', () => handleNum('4'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('5', () => handleNum('5'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('6', () => handleNum('6'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('−', () => handleOp('-'), 'bg-teal-600 text-white')}

        {btn('1', () => handleNum('1'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('2', () => handleNum('2'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('3', () => handleNum('3'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('+', () => handleOp('+'), 'bg-teal-600 text-white')}

        <button onClick={() => handleNum('0')}
          className="col-span-2 py-3 rounded-xl text-base font-medium bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors active:scale-95"
        >0</button>
        {btn('.', () => handleNum('.'), 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]')}
        {btn('=', handleEq, 'bg-teal-600 text-white')}
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

export function ClinicalChatModal({ isOpen, onClose, patient, onUpdate, initialTab }: ClinicalChatModalProps) {
  const [tab, setTab] = useState<'qa' | 'calculator'>(initialTab || 'qa');

  // --- Q&A state ---
  const [messages, setMessages] = useState<QAMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [useOpenEvidence, setUseOpenEvidence] = useState(false);
  const [useUpToDate, setUseUpToDate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // --- Calculator state ---
  const [calcMessages, setCalcMessages] = useState<CalcMessage[]>([]);
  const [calcInput, setCalcInput] = useState('');
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcSpec, setCalcSpec] = useState<CalcSpec | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [calculating, setCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState<string | null>(null);
  const [showBasicCalc, setShowBasicCalc] = useState(false);
  const calcScrollRef = useRef<HTMLDivElement>(null);
  const calcInputRef = useRef<HTMLTextAreaElement>(null);

  // Parse existing QA history when modal opens or patient changes
  useEffect(() => {
    if (!isOpen) return;
    try {
      const parsed = patient.clinicalQA ? JSON.parse(patient.clinicalQA) : [];
      setMessages(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMessages([]);
    }
  }, [isOpen, patient.clinicalQA]);

  // Smooth scroll to bottom on new messages
  useEffect(() => {
    if (tab === 'qa' && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading, tab]);

  useEffect(() => {
    if (tab === 'calculator' && calcScrollRef.current) {
      calcScrollRef.current.scrollTo({ top: calcScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [calcMessages, calcLoading, calcSpec, calcResult, tab]);

  // Focus input when modal opens or tab changes
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (tab === 'qa') inputRef.current?.focus();
        else calcInputRef.current?.focus();
      }, 200);
    }
  }, [isOpen, tab]);

  // Reset calculator state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCalcMessages([]);
      setCalcInput('');
      setCalcSpec(null);
      setVarValues({});
      setCalcResult(null);
      if (initialTab) setTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // --- Q&A handlers ---
  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);

    const userMsg: QAMessage = { role: 'user', content: question, ts: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch('/api/clinical-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: patient.rowIndex,
          sheetName: patient.sheetName,
          question,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          useOpenEvidence: useOpenEvidence || useUpToDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to get answer');
      }

      const { answer, oeQuery } = await res.json();
      const reframedQuery = oeQuery || question;

      if (useOpenEvidence && reframedQuery) {
        window.open(`https://www.openevidence.com/?oe_q=${encodeURIComponent(reframedQuery)}`, '_blank', 'noopener,noreferrer');
      }
      if (useUpToDate && reframedQuery) {
        window.open(`https://www.uptodate.com/contents/search?search=${encodeURIComponent(reframedQuery)}`, '_blank', 'noopener,noreferrer');
      }

      const assistantMsg: QAMessage = { role: 'assistant', content: answer, ts: new Date().toISOString() };
      setMessages(prev => [...prev, assistantMsg]);
      onUpdate();
    } catch (err: any) {
      setMessages(prev => prev.slice(0, -1));
      setInput(question);
      console.error('Clinical question error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQAKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --- Calculator handlers ---
  const patientPayload = {
    name: patient.name, age: patient.age, gender: patient.gender,
    triageVitals: patient.triageVitals,
    transcript: patient.transcript,
    additional: patient.additional,
    diagnosis: patient.diagnosis,
    objective: (patient as any).objective || '',
    hpi: (patient as any).hpi || '',
    investigations: (patient as any).investigations || '',
  };

  const handleSelectCalc = async (query: string) => {
    setCalcLoading(true);
    setCalcSpec(null);
    setCalcResult(null);
    setCalcMessages([{ role: 'user', content: query }]);

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
        const initial: Record<string, string> = {};
        for (const v of variables.variables) {
          initial[v.id] = v.value !== null && v.value !== undefined ? String(v.value) : '';
        }
        setVarValues(initial);
      }
    } catch {
      setCalcMessages(prev => [...prev, { role: 'assistant', content: 'Failed to load calculator. Try asking as a free-form question.' }]);
    } finally {
      setCalcLoading(false);
    }
  };

  const handleCalculate = async () => {
    if (!calcSpec) return;
    setCalculating(true);
    setCalcResult(null);

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
      setCalcResult(data.result);
    } catch {
      setCalcResult('Calculation failed. Please check your inputs.');
    } finally {
      setCalculating(false);
    }
  };

  const handleCalcFreeForm = async (query?: string) => {
    const q = (query || calcInput).trim();
    if (!q || calcLoading) return;
    if (!query) setCalcInput('');
    setCalcSpec(null);
    setCalcResult(null);
    setCalcLoading(true);

    setCalcMessages(prev => [...prev, { role: 'user', content: q }]);

    try {
      const res = await fetch('/api/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q, patient: patientPayload,
          history: calcMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCalcMessages(prev => [...prev, { role: 'assistant', content: data.result }]);
    } catch {
      setCalcMessages(prev => prev.slice(0, -1));
      if (!query) setCalcInput(q);
    } finally {
      setCalcLoading(false);
    }
  };

  const handleCalcBack = () => {
    setCalcSpec(null);
    setVarValues({});
    setCalcResult(null);
    setCalcMessages([]);
  };

  const allVarsFilled = calcSpec?.variables.every(v => varValues[v.id]?.trim()) ?? false;

  const isWorking = tab === 'qa' ? loading : (calcLoading || calculating);

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center">
      <div
        className="bg-[var(--card-bg)] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl flex flex-col animate-slideUp"
        style={{ boxShadow: 'var(--card-shadow-elevated)', height: 'min(88vh, 680px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] flex-shrink-0">
          {tab === 'calculator' && calcSpec && (
            <button onClick={handleCalcBack} className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
              <ArrowLeft className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          )}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">AI</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {tab === 'calculator' && calcSpec ? calcSpec.name : 'Clinical Assistant'}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {isWorking ? 'Thinking...' : patient.name || 'Patient'}
            </p>
          </div>
          {tab === 'calculator' && (
            <button
              onClick={() => setShowBasicCalc(!showBasicCalc)}
              className={`p-1.5 rounded transition-colors ${showBasicCalc ? 'text-teal-500 bg-teal-50 dark:bg-teal-900/30' : 'text-[var(--text-muted)] hover:text-teal-500'}`}
              title={showBasicCalc ? 'Medical calculators' : 'Basic calculator'}
            >
              <Calculator className="w-3.5 h-3.5" />
            </button>
          )}
          {tab === 'calculator' && calcSpec?.mdcalcUrl && (
            <a href={calcSpec.mdcalcUrl} target="_blank" rel="noopener noreferrer"
              className="p-1.5 text-[var(--text-muted)] hover:text-teal-500 rounded transition-colors" title="Open on MDCalc">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={onClose} className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-[var(--bg-tertiary)] rounded-full flex-shrink-0 transition-colors">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[var(--border)] flex-shrink-0 px-5">
          <button
            onClick={() => setTab('qa')}
            className={`px-4 py-2 text-xs font-semibold transition-colors relative ${
              tab === 'qa'
                ? 'text-teal-600 dark:text-teal-400'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Clinical Q&A
            {tab === 'qa' && <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-teal-500 rounded-full" />}
          </button>
          <button
            onClick={() => setTab('calculator')}
            className={`px-4 py-2 text-xs font-semibold transition-colors relative ${
              tab === 'calculator'
                ? 'text-teal-600 dark:text-teal-400'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Calculator
            {tab === 'calculator' && <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-teal-500 rounded-full" />}
          </button>
        </div>

        {/* ==================== Q&A TAB ==================== */}
        {tab === 'qa' && (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-center animate-fadeIn">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-400/20 to-teal-600/20 flex items-center justify-center mb-4">
                    <span className="text-2xl">?</span>
                  </div>
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Ask a clinical question</p>
                  <p className="text-xs text-[var(--text-muted)] max-w-[240px]">
                    I have access to this patient&apos;s full clinical data and can help with differential, management, and evidence.
                  </p>
                </div>
              )}

              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                const isLast = i === messages.length - 1;
                const showTime = isLast || messages[i + 1]?.role !== msg.role;
                const prevSameRole = i > 0 && messages[i - 1]?.role === msg.role;

                return (
                  <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed ${
                        isUser
                          ? `bg-teal-600 text-white ${prevSameRole ? 'rounded-2xl rounded-tr-lg' : 'rounded-2xl rounded-br-lg'}`
                          : `bg-[var(--bg-tertiary)] text-[var(--text-primary)] ${prevSameRole ? 'rounded-2xl rounded-tl-lg' : 'rounded-2xl rounded-bl-lg'}`
                      } ${isLast ? 'animate-msgIn' : ''}`}
                    >
                      <div className="whitespace-pre-wrap">{renderWithLinks(msg.content)}</div>
                    </div>
                    {showTime && (
                      <span className={`text-[10px] text-[var(--text-muted)] mt-1 mb-2 ${isUser ? 'mr-1' : 'ml-1'}`}>
                        {formatTime(msg.ts)}
                      </span>
                    )}
                  </div>
                );
              })}

              {loading && <TypingIndicator />}
            </div>

            {/* Q&A Input area */}
            <div className="px-3 py-2.5 pb-safe border-t border-[var(--border)] bg-[var(--card-bg)] sm:rounded-b-3xl flex-shrink-0">
              <div className="flex items-center gap-4 mb-1.5 ml-1">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useOpenEvidence}
                    onChange={(e) => setUseOpenEvidence(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[var(--input-border)] text-teal-600 focus:ring-teal-500 accent-teal-600"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">Open Evidence</span>
                  <ExternalLink className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useUpToDate}
                    onChange={(e) => setUseUpToDate(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[var(--input-border)] text-teal-600 focus:ring-teal-500 accent-teal-600"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">UpToDate</span>
                  <ExternalLink className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                </label>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleQAKeyDown}
                  placeholder="Ask a question..."
                  rows={1}
                  className="flex-1 resize-none py-2.5 px-4 border border-[var(--input-border)] rounded-full text-base focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
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
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all flex-shrink-0 ${
                    input.trim() && !loading
                      ? 'bg-teal-600 text-white hover:bg-teal-700 active:scale-90'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                  }`}
                >
                  <Send className="w-5 h-5" style={{ transform: 'rotate(-45deg) translateX(1px)' }} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* ==================== CALCULATOR TAB ==================== */}
        {tab === 'calculator' && (
          <>
            <div ref={calcScrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {showBasicCalc && <BasicCalc />}

              {/* Variable input form */}
              {!showBasicCalc && calcSpec && !calcResult && (
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
                          className="w-full p-2.5 border border-[var(--input-border)] rounded-xl text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
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
                          className="w-full p-2.5 border border-[var(--input-border)] rounded-xl text-sm bg-[var(--input-bg)] text-[var(--text-primary)] focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
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
                    className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
                  >
                    {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                    Calculate
                  </button>
                </div>
              )}

              {/* Result */}
              {!showBasicCalc && calcResult && (
                <div className="animate-msgIn bg-[var(--bg-tertiary)] rounded-2xl p-4 text-sm leading-relaxed text-[var(--text-primary)]">
                  <div className="whitespace-pre-wrap">{renderWithLinks(calcResult)}</div>
                </div>
              )}

              {/* Chat messages (free-form mode) */}
              {!showBasicCalc && !calcSpec && calcMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-teal-600 text-white rounded-2xl rounded-br-lg'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-2xl rounded-bl-lg'
                  } ${i === calcMessages.length - 1 ? 'animate-msgIn' : ''}`}>
                    <div className="whitespace-pre-wrap">{renderWithLinks(msg.content)}</div>
                  </div>
                </div>
              ))}

              {calcLoading && <TypingIndicator />}

              {/* Empty state */}
              {!showBasicCalc && !calcSpec && calcMessages.length === 0 && !calcLoading && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-400/20 to-teal-600/20 flex items-center justify-center mb-3">
                      <Calculator className="w-7 h-7 text-teal-500" />
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
                        className="px-2.5 py-1.5 text-[11px] font-medium bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 rounded-full hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
                      >
                        {calc}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Calculator input */}
            {!showBasicCalc && (
              <div className="px-3 py-2.5 pb-safe border-t border-[var(--border)] bg-[var(--card-bg)] sm:rounded-b-3xl flex-shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={calcInputRef}
                    value={calcInput}
                    onChange={(e) => setCalcInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCalcFreeForm(); } }}
                    placeholder={calcSpec ? 'Ask a follow-up...' : 'Calculate CrCl, dose, score...'}
                    rows={1}
                    className="flex-1 resize-none py-2.5 px-4 border border-[var(--input-border)] rounded-full text-base focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
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
                    onClick={() => handleCalcFreeForm()}
                    disabled={!calcInput.trim() || calcLoading}
                    className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all flex-shrink-0 ${
                      calcInput.trim() && !calcLoading
                        ? 'bg-teal-600 text-white hover:bg-teal-700 active:scale-90'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                    }`}
                  >
                    <Send className="w-5 h-5" style={{ transform: 'rotate(-45deg) translateX(1px)' }} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
