'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Calculator, ExternalLink } from 'lucide-react';
import { Patient } from '@/lib/google-sheets';

interface CalcMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
}

/** Render markdown links as clickable */
function renderWithLinks(text: string): React.ReactNode[] {
  if (!text) return [text];
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)<>]+)/g);
  return parts.map((part, i) => {
    const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (mdMatch) {
      return <a key={i} href={mdMatch[2]} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">{mdMatch[1]}</a>;
    }
    if (/^https?:\/\//.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">{part}</a>;
    }
    return part;
  });
}

/** Typing dots */
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
  'Ottawa Ankle Rules',
  'CURB-65',
  'PECARN',
  'Canadian C-Spine',
  'Peds dose calculator',
];

export function CalculatorModal({ isOpen, onClose, patient }: CalculatorModalProps) {
  const [messages, setMessages] = useState<CalcMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setInput('');
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleSend = async (query?: string) => {
    const question = (query || input).trim();
    if (!question || loading) return;
    if (!query) setInput('');
    setLoading(true);

    const userMsg: CalcMessage = { role: 'user', content: question };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    try {
      const res = await fetch('/api/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: question,
          patient: {
            name: patient.name,
            age: patient.age,
            gender: patient.gender,
            weight: '', // extracted from vitals if available
            triageVitals: patient.triageVitals,
            transcript: patient.transcript,
            additional: patient.additional,
            diagnosis: patient.diagnosis,
          },
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error('Calculation failed');
      const { result } = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: result }]);
    } catch {
      setMessages(prev => prev.slice(0, -1));
      if (!query) setInput(question);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 modal-overlay z-50 flex items-end sm:items-center justify-center">
      <div
        className="bg-[var(--card-bg)] w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl flex flex-col animate-slideUp"
        style={{ boxShadow: 'var(--card-shadow-elevated)', height: 'min(88vh, 680px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center flex-shrink-0">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">Medical Calculator</h2>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {loading ? 'Calculating...' : patient.name || 'Patient'}
            </p>
          </div>
          <a
            href="https://www.mdcalc.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-[var(--text-muted)] hover:text-orange-500 rounded transition-colors"
            title="Open MDCalc"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={onClose} className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-[var(--bg-tertiary)] rounded-full flex-shrink-0">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {messages.length === 0 && !loading && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400/20 to-orange-600/20 flex items-center justify-center mb-3">
                  <Calculator className="w-7 h-7 text-orange-500" />
                </div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Medical Calculator</p>
                <p className="text-xs text-[var(--text-muted)] max-w-[260px]">
                  Calculate scores, doses, and clinical values using this patient&apos;s data. Ask for any calculation or pick one below.
                </p>
              </div>
              {/* Quick calc buttons */}
              <div className="flex flex-wrap gap-1.5 justify-center">
                {QUICK_CALCS.map(calc => (
                  <button
                    key={calc}
                    onClick={() => handleSend(calc)}
                    className="px-2.5 py-1.5 text-[11px] font-medium bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 rounded-full hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                  >
                    {calc}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-orange-500 text-white rounded-2xl rounded-br-lg'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-2xl rounded-bl-lg'
                  } ${i === messages.length - 1 ? 'animate-msgIn' : ''}`}
                >
                  <div className="whitespace-pre-wrap">{renderWithLinks(msg.content)}</div>
                </div>
              </div>
            );
          })}

          {loading && <TypingDots />}
        </div>

        {/* Input */}
        <div className="px-3 py-2.5 pb-safe border-t border-[var(--border)] bg-[var(--card-bg)] sm:rounded-b-3xl flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Calculate CrCl, HEART score, dose..."
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
              onClick={() => handleSend()}
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
