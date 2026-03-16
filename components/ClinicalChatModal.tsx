'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, ExternalLink } from 'lucide-react';
import { Patient } from '@/lib/google-sheets';

interface QAMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

interface ClinicalChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  onUpdate: () => void;
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

export function ClinicalChatModal({ isOpen, onClose, patient, onUpdate }: ClinicalChatModalProps) {
  const [messages, setMessages] = useState<QAMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [useOpenEvidence, setUseOpenEvidence] = useState(false);
  const [useUpToDate, setUseUpToDate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, loading]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    // Reset textarea height
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

      // Open external evidence sources with the reframed query
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">AI</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">Clinical Assistant</h2>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {loading ? 'Thinking...' : patient.name || 'Patient'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-[var(--bg-tertiary)] rounded-full flex-shrink-0 transition-colors">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Messages */}
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

        {/* Input area */}
        <div className="px-3 py-2.5 pb-safe border-t border-[var(--border)] bg-[var(--card-bg)] sm:rounded-b-3xl flex-shrink-0">
          {/* External evidence source toggles */}
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
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              rows={1}
              className="flex-1 resize-none py-2.5 px-4 border border-[var(--input-border)] rounded-full text-base focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              style={{ maxHeight: '100px' }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                const h = Math.min(t.scrollHeight, 100);
                t.style.height = h + 'px';
                // Switch to rounded-xl when multi-line
                if (h > 44) {
                  t.classList.remove('rounded-full');
                  t.classList.add('rounded-xl');
                } else {
                  t.classList.remove('rounded-xl');
                  t.classList.add('rounded-full');
                }
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
      </div>
    </div>
  );
}
