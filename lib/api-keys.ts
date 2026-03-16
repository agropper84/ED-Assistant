/**
 * Per-user API key management.
 * Falls back to environment variables (admin keys) if no user key is set.
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
  return process.env.CLAUDE_API_KEY || '';
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
  return process.env.OPENAI_API_KEY || '';
}

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/** Get an Anthropic client using the user's key or fallback to env */
export async function getAnthropicClient(): Promise<Anthropic> {
  const apiKey = await getClaudeApiKey();
  return new Anthropic({ apiKey });
}

/** Get an OpenAI client using the user's key or fallback to env */
export async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getOpenAIApiKey();
  return new OpenAI({ apiKey });
}
