import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'
import { contextBlock, isOverloaded, parseVerdict, sleep, SYSTEM_PROMPT } from './prompt'
import type { DeskProvider } from './types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

interface Msg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function groqChat(messages: Msg[], jsonMode: boolean): Promise<string> {
  const s = readSettings()
  if (!s.groqApiKey) throw new Error('No Groq API key')
  const body: Record<string, unknown> = {
    model: s.groqModel || 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.4,
    max_tokens: 1024
  }
  if (jsonMode) body.response_format = { type: 'json_object' }
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.groqApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
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

export const groq: DeskProvider = {
  name: 'Groq',
  hasKey: () => !!readSettings().groqApiKey,
  async verdict(ctx: DeskContext): Promise<DeskVerdict> {
    const messages: Msg[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Give your first structured verdict for this setup. Respond with ONLY the JSON object.\n\n${contextBlock(ctx)}`
      }
    ]
    return withRetry(async () => parseVerdict(await groqChat(messages, true)))
  },
  async chat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
    const messages: Msg[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Context for this conversation:\n${contextBlock(ctx)}` },
      { role: 'assistant', content: 'Understood. I have the current context and will answer in it.' },
      ...history.slice(0, -1).map((h): Msg => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: message }
    ]
    return withRetry(() => groqChat(messages, false))
  },
  async test() {
    const s = readSettings()
    if (!s.groqApiKey) return { ok: false, message: 'No Groq key.' }
    try {
      const out = await groqChat([{ role: 'user', content: 'Reply with the single word OK' }], false)
      return { ok: true, message: `Groq (${s.groqModel}) OK: "${out.trim().slice(0, 12)}".` }
    } catch (err) {
      return { ok: false, message: `Groq: ${(err as Error).message}` }
    }
  }
}
