'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import type { Patient } from '@/lib/google-sheets';
import { Eyebrow } from '../primitives/Eyebrow';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS = [
  'Differential for this presentation',
  'Serial troponin plan',
  'Disposition criteria',
  'Medication dosing',
];

export function AskTab({ patient }: { patient: Patient }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setDraft('');
    setThinking(true);

    try {
      const context = [
        patient.name && `Patient: ${patient.name}`,
        patient.age && `Age: ${patient.age}`,
        patient.gender && `Gender: ${patient.gender}`,
        patient.diagnosis && `Diagnosis: ${patient.diagnosis}`,
        patient.transcript && `Transcript: ${patient.transcript.substring(0, 500)}`,
        patient.hpi && `HPI: ${patient.hpi.substring(0, 500)}`,
        patient.objective && `Exam: ${patient.objective.substring(0, 300)}`,
        patient.assessmentPlan && `A&P: ${patient.assessmentPlan.substring(0, 300)}`,
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/clinical-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text.trim(), context }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer || 'No response.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to get a response. Check your API key in Settings.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please try again.' }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', gap: '12px' }}>
      {/* Scope card */}
      <div style={{
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        padding: '13px 17px',
      }}>
        <Eyebrow>ASK ABOUT THIS PATIENT</Eyebrow>
        <div style={{ fontSize: '13px', color: 'var(--warm-text-3)', marginTop: '4px' }}>
          Scoped to {patient.name || 'this patient'} — transcript, note and triage data are in context.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px', marginTop: '10px' }}>
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => sendMessage(prompt)}
              disabled={thinking}
              style={{
                padding: '7px 14px',
                borderRadius: 'var(--warm-radius-pill)',
                fontSize: '12px',
                fontWeight: 500,
                background: 'var(--warm-surface-2)',
                border: '1px solid var(--warm-border)',
                color: 'var(--warm-text-2)',
                cursor: thinking ? 'default' : 'pointer',
                opacity: thinking ? 0.5 : 1,
                transition: 'all var(--warm-dur-fast)',
                fontFamily: 'var(--warm-font)',
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto' as const,
          display: 'flex',
          flexDirection: 'column' as const,
          gap: '10px',
          minHeight: '200px',
        }}
      >
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={idx}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                animation: 'warm-slideUp 200ms var(--warm-ease) both',
              }}
            >
              <div style={{
                fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em',
                color: 'var(--warm-text-3)', marginBottom: '4px',
                textAlign: isUser ? 'right' as const : 'left' as const,
              }}>
                {isUser ? 'YOU' : 'ASSISTANT'}
              </div>
              <div style={{
                padding: '12px 15px',
                borderRadius: 'var(--warm-radius-card)',
                fontSize: '14px',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap' as const,
                background: isUser ? 'var(--warm-accent-soft)' : 'var(--warm-surface)',
                border: isUser ? '1px solid var(--warm-accent-ring)' : '1px solid var(--warm-border)',
                color: 'var(--warm-text)',
              }}>
                {msg.content}
              </div>
            </div>
          );
        })}

        {thinking && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '5px', padding: '12px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--warm-text-3)',
                animation: `warm-fadeIn 600ms ease-in-out ${i * 150}ms infinite alternate`,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'flex-end',
        background: 'var(--warm-surface)',
        border: '1px solid var(--warm-border)',
        borderRadius: 'var(--warm-radius-card)',
        padding: '10px 14px',
      }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(draft); } }}
          placeholder="Ask a clinical question…"
          disabled={thinking}
          style={{
            flex: 1, border: 'none', outline: 'none', resize: 'none' as const,
            fontSize: '14px', lineHeight: 1.5, minHeight: '24px', maxHeight: '120px',
            background: 'transparent', color: 'var(--warm-text)',
            fontFamily: 'var(--warm-font)',
          }}
          rows={1}
        />
        <button
          onClick={() => sendMessage(draft)}
          disabled={!draft.trim() || thinking}
          style={{
            width: '40px', height: '40px', borderRadius: 'var(--warm-radius-input)',
            background: draft.trim() && !thinking ? 'var(--warm-accent)' : 'var(--warm-surface-2)',
            color: draft.trim() && !thinking ? '#fff' : 'var(--warm-text-3)',
            border: 'none', cursor: draft.trim() && !thinking ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all var(--warm-dur-fast)',
            flexShrink: 0,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
