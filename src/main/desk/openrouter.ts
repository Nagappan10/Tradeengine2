import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'
import { contextBlock, fallbackVerdict, isOverloaded, parseVerdict, sleep, SYSTEM_PROMPT } from './prompt'

// OpenRouter is OpenAI-compatible and offers free models (":free" suffix). No
// web-search grounding. Key lives in the main process only.
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions'

interface Msg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function orChat(messages: Msg[]): Promise<string> {
  const s = readSettings()
  if (!s.openrouterApiKey) throw new Error('No OpenRouter API key set')
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
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

export async function deskVerdict(ctx: DeskContext): Promise<DeskVerdict> {
  const s = readSettings()
  if (!s.openrouterApiKey)
    return fallbackVerdict(ctx, 'No OpenRouter API key set — add one in Settings. Showing engine output.')
  const messages: Msg[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Give your first structured verdict for this setup. Respond with ONLY the JSON object, no prose.\n\n${contextBlock(ctx)}`
    }
  ]
  let lastErr = 'unknown error'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return parseVerdict(await orChat(messages))
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
  if (!s.openrouterApiKey) return 'No OpenRouter API key set. Add one in Settings to chat with the Desk.'
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
      return await orChat(messages)
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

export async function testOpenRouter(): Promise<{ ok: boolean; message: string }> {
  const s = readSettings()
  if (!s.openrouterApiKey) return { ok: false, message: 'No OpenRouter API key saved yet.' }
  try {
    const out = await orChat([{ role: 'user', content: 'Reply with the single word OK' }])
    return { ok: true, message: `Connected — ${s.openrouterModel} replied "${out.trim().slice(0, 12)}".` }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}
