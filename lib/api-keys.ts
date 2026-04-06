/**
 * Per-user API key management.
 * Keys are stored encrypted in Redis (AES-256-GCM via KV layer).
 * Falls back to legacy settings-based storage for migration.
 */

import { getSessionFromCookies } from './session';
import {
  getUserClaudeApiKey, getUserOpenAIApiKey, getUserDeepgramApiKey, getUserWisprApiKey,
  getUserSettings,
} from './kv';

export async function getClaudeApiKey(): Promise<string> {
  try {
    const session = await getSessionFromCookies();
    if (session.userId) {
      // Try encrypted KV first
      const kvKey = await getUserClaudeApiKey(session.userId);
      if (kvKey && kvKey.startsWith('sk-ant-')) return kvKey;

      // Fall back to legacy settings (plaintext in Redis JSON blob)
      const settings = await getUserSettings(session.userId);
      const userKey = settings?.claudeApiKey as string;
      if (userKey && userKey.startsWith('sk-ant-')) return userKey;
    }
  } catch {}
  return '';
}

export async function getOpenAIApiKey(): Promise<string> {
  try {
    const session = await getSessionFromCookies();
    if (session.userId) {
      const kvKey = await getUserOpenAIApiKey(session.userId);
      if (kvKey && kvKey.startsWith('sk-')) return kvKey;

      const settings = await getUserSettings(session.userId);
      const userKey = settings?.openaiApiKey as string;
      if (userKey && userKey.startsWith('sk-')) return userKey;
    }
  } catch {}
  return '';
}

export async function getWisprApiKey(): Promise<string> {
  try {
    const session = await getSessionFromCookies();
    if (session.userId) {
      const kvKey = await getUserWisprApiKey(session.userId);
      if (kvKey) return kvKey;

      const settings = await getUserSettings(session.userId);
      const userKey = settings?.wisprApiKey as string;
      if (userKey) return userKey;
    }
  } catch {}
  return '';
}

export async function getDeepgramApiKey(): Promise<string> {
  try {
    const session = await getSessionFromCookies();
    if (session.userId) {
      const kvKey = await getUserDeepgramApiKey(session.userId);
      if (kvKey) return kvKey;

      const settings = await getUserSettings(session.userId);
      const userKey = settings?.deepgramApiKey as string;
      if (userKey) return userKey;
    }
  } catch {}
  return '';
}

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/** Get an Anthropic client using the user's key */
export async function getAnthropicClient(): Promise<Anthropic> {
  const apiKey = await getClaudeApiKey();
  if (!apiKey) throw new Error('Claude API key not configured. Add your key in Settings > Privacy.');
  return new Anthropic({ apiKey });
}

/** Get an OpenAI client using the user's key */
export async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getOpenAIApiKey();
  if (!apiKey) throw new Error('OpenAI API key not configured. Add your key in Settings > Privacy.');
  return new OpenAI({ apiKey });
}
