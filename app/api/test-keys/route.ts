import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import {
  getUserClaudeApiKey, getUserOpenAIApiKey, getUserDeepgramApiKey,
  getUserWisprApiKey, getUserElevenlabsApiKey,
} from '@/lib/kv';

export const maxDuration = 30;

interface KeyResult {
  key: string;
  label: string;
  status: 'ok' | 'missing' | 'error';
  latency?: number;
  detail?: string;
}

async function testClaude(apiKey: string): Promise<{ ok: boolean; detail: string; ms: number }> {
  const start = Date.now();
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 10,
    messages: [{ role: 'user', content: 'Reply OK' }],
  });
  const text = res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
  return { ok: !!text, detail: text || 'No response', ms: Date.now() - start };
}

async function testOpenAI(apiKey: string): Promise<{ ok: boolean; detail: string; ms: number }> {
  const start = Date.now();
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini', max_tokens: 10,
    messages: [{ role: 'user', content: 'Reply OK' }],
  });
  const text = res.choices[0]?.message?.content?.trim() || '';
  return { ok: !!text, detail: text || 'No response', ms: Date.now() - start };
}

async function testDeepgram(apiKey: string): Promise<{ ok: boolean; detail: string; ms: number }> {
  const start = Date.now();
  // Just validate the key with a projects list call (no audio needed)
  const res = await fetch('https://api.deepgram.com/v1/projects', {
    headers: { 'Authorization': `Token ${apiKey}` },
  });
  const ms = Date.now() - start;
  if (res.ok) return { ok: true, detail: 'Authenticated', ms };
  return { ok: false, detail: `HTTP ${res.status}`, ms };
}

async function testElevenLabs(apiKey: string): Promise<{ ok: boolean; detail: string; ms: number }> {
  const start = Date.now();
  const res = await fetch('https://api.elevenlabs.io/v1/user', {
    headers: { 'xi-api-key': apiKey },
  });
  const ms = Date.now() - start;
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: true, detail: `${data.subscription?.tier || 'Active'}`, ms };
  }
  return { ok: false, detail: `HTTP ${res.status}`, ms };
}

async function testWispr(apiKey: string): Promise<{ ok: boolean; detail: string; ms: number }> {
  const start = Date.now();
  // Wispr doesn't have a simple auth check endpoint — just verify key format
  if (apiKey && apiKey.length > 10) {
    return { ok: true, detail: 'Key present (no validation endpoint)', ms: Date.now() - start };
  }
  return { ok: false, detail: 'Invalid key format', ms: Date.now() - start };
}

export async function POST() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const results: KeyResult[] = [];

    // Claude API Key
    let claudeKey = '';
    try { claudeKey = await getUserClaudeApiKey(session.userId) || ''; } catch {}
    if (!claudeKey) {
      results.push({ key: 'claude', label: 'Claude (Anthropic)', status: 'missing', detail: 'Not configured' });
    } else {
      try {
        const r = await testClaude(claudeKey);
        results.push({ key: 'claude', label: 'Claude (Anthropic)', status: r.ok ? 'ok' : 'error', latency: r.ms, detail: r.detail });
      } catch (e: any) {
        results.push({ key: 'claude', label: 'Claude (Anthropic)', status: 'error', detail: e?.message?.substring(0, 100) || 'Failed' });
      }
    }

    // OpenAI API Key
    let openaiKey = '';
    try { openaiKey = await getUserOpenAIApiKey(session.userId) || ''; } catch {}
    if (!openaiKey) {
      results.push({ key: 'openai', label: 'OpenAI (Whisper)', status: 'missing', detail: 'Not configured — optional, used for Whisper transcription' });
    } else {
      try {
        const r = await testOpenAI(openaiKey);
        results.push({ key: 'openai', label: 'OpenAI (Whisper)', status: r.ok ? 'ok' : 'error', latency: r.ms, detail: r.detail });
      } catch (e: any) {
        results.push({ key: 'openai', label: 'OpenAI (Whisper)', status: 'error', detail: e?.message?.substring(0, 100) || 'Failed' });
      }
    }

    // Deepgram
    let dgKey = '';
    try { dgKey = await getUserDeepgramApiKey(session.userId) || ''; } catch {}
    if (!dgKey) dgKey = process.env.DEEPGRAM_API_KEY || '';
    if (!dgKey) {
      results.push({ key: 'deepgram', label: 'Deepgram', status: 'missing', detail: 'Not configured — optional, used for live transcription' });
    } else {
      try {
        const r = await testDeepgram(dgKey);
        results.push({ key: 'deepgram', label: 'Deepgram', status: r.ok ? 'ok' : 'error', latency: r.ms, detail: r.detail });
      } catch (e: any) {
        results.push({ key: 'deepgram', label: 'Deepgram', status: 'error', detail: e?.message?.substring(0, 100) || 'Failed' });
      }
    }

    // ElevenLabs
    let elKey = '';
    try { elKey = await getUserElevenlabsApiKey(session.userId) || ''; } catch {}
    if (!elKey) elKey = process.env.ELEVENLABS_API_KEY || '';
    if (!elKey) {
      results.push({ key: 'elevenlabs', label: 'ElevenLabs', status: 'missing', detail: 'Not configured — required for encounter transcription' });
    } else {
      try {
        const r = await testElevenLabs(elKey);
        results.push({ key: 'elevenlabs', label: 'ElevenLabs', status: r.ok ? 'ok' : 'error', latency: r.ms, detail: r.detail });
      } catch (e: any) {
        results.push({ key: 'elevenlabs', label: 'ElevenLabs', status: 'error', detail: e?.message?.substring(0, 100) || 'Failed' });
      }
    }

    // Wispr
    let wisprKey = '';
    try { wisprKey = await getUserWisprApiKey(session.userId) || ''; } catch {}
    if (!wisprKey) {
      results.push({ key: 'wispr', label: 'Wispr Flow', status: 'missing', detail: 'Not configured — optional' });
    } else {
      try {
        const r = await testWispr(wisprKey);
        results.push({ key: 'wispr', label: 'Wispr Flow', status: r.ok ? 'ok' : 'error', latency: r.ms, detail: r.detail });
      } catch (e: any) {
        results.push({ key: 'wispr', label: 'Wispr Flow', status: 'error', detail: e?.message?.substring(0, 100) || 'Failed' });
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Test failed' }, { status: 500 });
  }
}
