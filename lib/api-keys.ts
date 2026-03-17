/**
 * Per-user API key management.
 * Users must provide their own API keys in Settings > Privacy.
 */

import { getSessionFromCookies } from './session';
import { getUserSettings } from './kv';

export async function getClaudeApiKey(): Promise<string> {
  try {
    const session = await getSessionFromCookies();
    if (session.userId) {
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
      const settings = await getUserSettings(session.userId);
      const userKey = settings?.openaiApiKey as string;
      if (userKey && userKey.startsWith('sk-')) return userKey;
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
