import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'
import * as gemini from './gemini'
import * as groq from './groq'

// Route Desk calls to the configured provider (Gemini or Groq). Falls back to
// whichever provider actually has a key if the configured one is unset.
function provider() {
  const s = readSettings()
  const choice = s.deskProvider
  if (choice === 'groq' && s.groqApiKey) return groq
  if (choice === 'gemini' && s.geminiApiKey) return gemini
  if (s.groqApiKey) return groq
  if (s.geminiApiKey) return gemini
  return gemini // returns its own "no key" fallback verdict
}

export function deskVerdict(ctx: DeskContext): Promise<DeskVerdict> {
  return provider().deskVerdict(ctx)
}

export function deskChat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
  return provider().deskChat(ctx, history, message)
}

export function testDesk(): Promise<{ ok: boolean; message: string }> {
  const s = readSettings()
  const useGroq = s.deskProvider === 'groq' || (s.deskProvider !== 'gemini' && !!s.groqApiKey && !s.geminiApiKey)
  return useGroq ? groq.testGroq() : gemini.testGemini()
}
