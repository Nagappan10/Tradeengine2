import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'
import { contextBlock, isOverloaded, parseVerdict, sleep, SYSTEM_PROMPT } from './prompt'
import type { DeskProvider } from './types'

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions'

interface Msg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function orChat(messages: Msg[]): Promise<string> {
  const s = readSettings()
  if (!s.openrouterApiKey) throw new Error('No OpenRouter API key')
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.openrouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Nagappan10/Tradeengine2',
      'X-Title': 'Strategy Desk'
    },
    body: JSON.stringify({
      model: s.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
      messages,
      temperature: 0.4,
      max_tokens: 1024
    })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr = 'unknown error'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = (err as Error).message
      if (isOverloaded(lastErr) && attempt < 2) {
        await sleep(1000)
        continue
      }
      break
    }
  }
  throw new Error(lastErr)
}

export const openrouter: DeskProvider = {
  name: 'OpenRouter',
  hasKey: () => !!readSettings().openrouterApiKey,
  async verdict(ctx: DeskContext): Promise<DeskVerdict> {
    const messages: Msg[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Give your first structured verdict for this setup. Respond with ONLY the JSON object, no prose.\n\n${contextBlock(ctx)}`
      }
    ]
    return withRetry(async () => parseVerdict(await orChat(messages)))
  },
  async chat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
    const messages: Msg[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Context for this conversation:\n${contextBlock(ctx)}` },
      { role: 'assistant', content: 'Understood. I have the current context and will answer in it.' },
      ...history.slice(0, -1).map((h): Msg => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: message }
    ]
    return withRetry(() => orChat(messages))
  },
  async test() {
    const s = readSettings()
    if (!s.openrouterApiKey) return { ok: false, message: 'No OpenRouter key.' }
    try {
      const out = await orChat([{ role: 'user', content: 'Reply with the single word OK' }])
      return { ok: true, message: `OpenRouter (${s.openrouterModel}) OK: "${out.trim().slice(0, 12)}".` }
    } catch (err) {
      return { ok: false, message: `OpenRouter: ${(err as Error).message}` }
    }
  }
}
