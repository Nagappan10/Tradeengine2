import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'
import * as gemini from './gemini'
import * as groq from './groq'
import * as openrouter from './openrouter'

// Route Desk calls to the configured provider. Falls back to whichever provider
// actually has a key if the configured one is unset.
function provider() {
  const s = readSettings()
  const has = { gemini: !!s.geminiApiKey, groq: !!s.groqApiKey, openrouter: !!s.openrouterApiKey }
  if (s.deskProvider === 'groq' && has.groq) return groq
  if (s.deskProvider === 'openrouter' && has.openrouter) return openrouter
  if (s.deskProvider === 'gemini' && has.gemini) return gemini
  if (has.openrouter) return openrouter
  if (has.groq) return groq
  return gemini // returns its own "no key" fallback verdict
}

export function deskVerdict(ctx: DeskContext): Promise<DeskVerdict> {
  return provider().deskVerdict(ctx)
}

export function deskChat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
  return provider().deskChat(ctx, history, message)
}

export function testDesk(): Promise<{ ok: boolean; message: string }> {
  const p = provider()
  if (p === groq) return groq.testGroq()
  if (p === openrouter) return openrouter.testOpenRouter()
  return gemini.testGemini()
}
