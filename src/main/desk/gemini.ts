import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'
import { contextBlock, isOverloaded, parseVerdict, sleep, SYSTEM_PROMPT } from './prompt'
import type { DeskProvider } from './types'

function makeModel(model: string, useSearch: boolean) {
  const s = readSettings()
  if (!s.geminiApiKey) return null
  const genAI = new GoogleGenerativeAI(s.geminiApiKey)
  const cfg: Record<string, unknown> = { model, systemInstruction: SYSTEM_PROMPT }
  if (useSearch) cfg.tools = [{ googleSearch: {} }]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return genAI.getGenerativeModel(cfg as any)
}

function modelChain(): string[] {
  const s = readSettings()
  const primary = s.geminiModel || 'gemini-2.5-flash'
  const chain = [primary]
  if (primary !== 'gemini-2.0-flash') chain.push('gemini-2.0-flash')
  return chain
}

// Runs a single Gemini call across model/grounding/retry combos; THROWS if all fail.
async function run<T>(fn: (model: string, useSearch: boolean) => Promise<T>): Promise<T> {
  let lastErr = 'unknown error'
  for (const model of modelChain()) {
    for (const useSearch of [true, false]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await fn(model, useSearch)
        } catch (err) {
          lastErr = (err as Error).message
          if (isOverloaded(lastErr) && attempt === 0) {
            await sleep(1000)
            continue
          }
          break
        }
      }
    }
  }
  throw new Error(lastErr)
}

export const gemini: DeskProvider = {
  name: 'Gemini',
  hasKey: () => !!readSettings().geminiApiKey,
  async verdict(ctx: DeskContext): Promise<DeskVerdict> {
    const prompt = `Give your first structured verdict for this setup. Respond with ONLY the JSON object.\n\n${contextBlock(ctx)}`
    return run(async (model, useSearch) => {
      const m = makeModel(model, useSearch)
      if (!m) throw new Error('No Gemini API key')
      return parseVerdict((await m.generateContent(prompt)).response.text())
    })
  },
  async chat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
    return run(async (model, useSearch) => {
      const m = makeModel(model, useSearch)
      if (!m) throw new Error('No Gemini API key')
      const chat = m.startChat({
        history: [
          { role: 'user', parts: [{ text: `Context for this conversation:\n${contextBlock(ctx)}` }] },
          { role: 'model', parts: [{ text: 'Understood. I have the current context and will answer in it.' }] },
          ...history.slice(0, -1).map((h) => ({ role: h.role, parts: [{ text: h.content }] }))
        ]
      })
      return (await chat.sendMessage(message)).response.text()
    })
  },
  async test() {
    const s = readSettings()
    if (!s.geminiApiKey) return { ok: false, message: 'No Gemini key.' }
    try {
      const m = makeModel(s.geminiModel || 'gemini-2.5-flash', false)!
      const r = await m.generateContent('Reply with the single word OK')
      return { ok: true, message: `Gemini (${s.geminiModel}) OK: "${r.response.text().trim().slice(0, 12)}".` }
    } catch (err) {
      return { ok: false, message: `Gemini: ${(err as Error).message}` }
    }
  }
}
