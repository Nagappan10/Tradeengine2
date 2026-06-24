import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'
import { fallbackVerdict } from './prompt'
import { gemini } from './gemini'
import { groq } from './groq'
import { openrouter } from './openrouter'
import type { DeskProvider } from './types'

const ALL: Record<string, DeskProvider> = { gemini, groq, openrouter }

// Configured provider first, then the others — but only those that have a key.
// This is what makes a 503 on one provider fail over to another automatically.
function chain(): DeskProvider[] {
  const s = readSettings()
  const order = [s.deskProvider, 'gemini', 'groq', 'openrouter']
  const seen = new Set<string>()
  const out: DeskProvider[] = []
  for (const key of order) {
    if (seen.has(key)) continue
    seen.add(key)
    const p = ALL[key]
    if (p && p.hasKey()) out.push(p)
  }
  return out
}

export async function deskVerdict(ctx: DeskContext): Promise<DeskVerdict> {
  const providers = chain()
  if (providers.length === 0) return fallbackVerdict(ctx, 'No Desk API key set — add Gemini, Groq or OpenRouter in Settings.')
  const errors: string[] = []
  for (const p of providers) {
    try {
      return await p.verdict(ctx)
    } catch (err) {
      errors.push(`${p.name}: ${(err as Error).message.slice(0, 70)}`)
    }
  }
  return fallbackVerdict(ctx, `All Desk providers busy. ${errors.join(' | ')}. Engine output shown.`)
}

export async function deskChat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
  const providers = chain()
  if (providers.length === 0) return 'No Desk API key set. Add Gemini, Groq or OpenRouter in Settings.'
  const errors: string[] = []
  for (const p of providers) {
    try {
      return await p.chat(ctx, history, message)
    } catch (err) {
      errors.push(`${p.name}: ${(err as Error).message.slice(0, 70)}`)
    }
  }
  return `All Desk providers busy — ${errors.join(' | ')}. Try again in a moment.`
}

// Test the configured provider; if it fails, fall over to others and report which
// one actually answered, so the result reflects what the Desk will really use.
export async function testDesk(): Promise<{ ok: boolean; message: string }> {
  const providers = chain()
  if (providers.length === 0) return { ok: false, message: 'No Desk API key saved yet.' }
  const msgs: string[] = []
  for (const p of providers) {
    const res = await p.test()
    if (res.ok) return res
    msgs.push(res.message)
  }
  return { ok: false, message: msgs.join(' | ') }
}
