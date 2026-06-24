import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'
import { contextBlock, fallbackVerdict, isOverloaded, parseVerdict, sleep, SYSTEM_PROMPT } from './prompt'

// Groq is OpenAI-compatible and free-tier. No web-search grounding, so the Desk
// reasons purely from the supplied engine context. Key lives in main only.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

interface Msg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function groqChat(messages: Msg[], jsonMode: boolean): Promise<string> {
  const s = readSettings()
  if (!s.groqApiKey) throw new Error('No Groq API key set')
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
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

export async function deskVerdict(ctx: DeskContext): Promise<DeskVerdict> {
  const s = readSettings()
  if (!s.groqApiKey) return fallbackVerdict(ctx, 'No Groq API key set — add one in Settings. Showing engine output.')
  const messages: Msg[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Give your first structured verdict for this setup. Respond with ONLY the JSON object.\n\n${contextBlock(ctx)}`
    }
  ]
  let lastErr = 'unknown error'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return parseVerdict(await groqChat(messages, true))
    } catch (err) {
      lastErr = (err as Error).message
      if (isOverloaded(lastErr) && attempt < 2) {
        await sleep(1200)
        continue
      }
      break
    }
  }
  return fallbackVerdict(ctx, `Desk busy (${lastErr.slice(0, 80)}). Engine output shown; try again shortly.`)
}

export async function deskChat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
  const s = readSettings()
  if (!s.groqApiKey) return 'No Groq API key set. Add one in Settings to chat with the Desk.'
  const messages: Msg[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Context for this conversation:\n${contextBlock(ctx)}` },
    { role: 'assistant', content: 'Understood. I have the current context and will answer in it.' },
    ...history.slice(0, -1).map((h): Msg => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
    { role: 'user', content: message }
  ]
  let lastErr = 'unknown error'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await groqChat(messages, false)
    } catch (err) {
      lastErr = (err as Error).message
      if (isOverloaded(lastErr) && attempt < 2) {
        await sleep(1200)
        continue
      }
      break
    }
  }
  return `Desk busy: ${lastErr}. The model may be rate-limited — try again in a moment.`
}

export async function testGroq(): Promise<{ ok: boolean; message: string }> {
  const s = readSettings()
  if (!s.groqApiKey) return { ok: false, message: 'No Groq API key saved yet.' }
  try {
    const out = await groqChat([{ role: 'user', content: 'Reply with the single word OK' }], false)
    return { ok: true, message: `Connected — ${s.groqModel} replied "${out.trim().slice(0, 12)}".` }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}
