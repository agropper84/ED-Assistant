'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Send, ExternalLink } from 'lucide-react';
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

export function ClinicalChatModal({ isOpen, onClose, patient, onUpdate }: ClinicalChatModalProps) {
  const [messages, setMessages] = useState<QAMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [useOpenEvidence, setUseOpenEvidence] = useState(false);
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setLoading(true);

    // Open on OpenEvidence if checkbox is checked
    if (useOpenEvidence) {
      const oeUrl = `https://www.openevidence.com/?oe_q=${encodeURIComponent(question)}`;
      window.open(oeUrl, '_blank', 'noopener,noreferrer');
    }

    // Optimistically add user message
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
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to get answer');
      }

      const { answer } = await res.json();
      const assistantMsg: QAMessage = { role: 'assistant', content: answer, ts: new Date().toISOString() };
      setMessages(prev => [...prev, assistantMsg]);
      onUpdate();
    } catch (err: any) {
      // Remove the optimistic user message on error
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
        style={{ boxShadow: 'var(--card-shadow-elevated)', height: 'min(85vh, 640px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">Clinical Questions</h2>
            <p className="text-xs text-[var(--text-muted)] truncate">{patient.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full flex-shrink-0">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">
              <p className="mb-1">Ask a clinical question about this patient.</p>
              <p className="text-xs">e.g. &quot;What antibiotics should I consider?&quot;</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[var(--bg-tertiary)] rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-tertiary)] sm:rounded-b-3xl flex-shrink-0">
          {/* Open Evidence toggle */}
          <label className="flex items-center gap-1.5 mb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useOpenEvidence}
              onChange={(e) => setUseOpenEvidence(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-[var(--input-border)] text-teal-600 focus:ring-teal-500 accent-teal-600"
            />
            <span className="text-xs text-[var(--text-muted)]">
              Open Evidence
            </span>
            <ExternalLink className="w-2.5 h-2.5 text-[var(--text-muted)]" />
          </label>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              rows={1}
              className="flex-1 resize-none p-3 border border-[var(--input-border)] rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              style={{ maxHeight: '120px' }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="p-3 bg-teal-600 text-white rounded-xl disabled:opacity-40 hover:bg-teal-700 active:scale-95 transition-all flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
