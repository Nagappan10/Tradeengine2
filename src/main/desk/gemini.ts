import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'
import { contextBlock, fallbackVerdict, isOverloaded, parseVerdict, sleep, SYSTEM_PROMPT } from './prompt'

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

export async function deskVerdict(ctx: DeskContext): Promise<DeskVerdict> {
  const s = readSettings()
  if (!s.geminiApiKey) return fallbackVerdict(ctx, 'No Gemini API key set — add one in Settings. Showing engine output.')
  const prompt = `Give your first structured verdict for this setup. Respond with ONLY the JSON object.\n\n${contextBlock(ctx)}`
  let lastErr = 'unknown error'
  for (const model of modelChain()) {
    for (const useSearch of [true, false]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const m = makeModel(model, useSearch)
          if (!m) return fallbackVerdict(ctx, 'No Gemini API key set.')
          return parseVerdict((await m.generateContent(prompt)).response.text())
        } catch (err) {
          lastErr = (err as Error).message
          if (isOverloaded(lastErr) && attempt === 0) {
            await sleep(1200)
            continue
          }
          break
        }
      }
    }
  }
  return fallbackVerdict(ctx, `Desk busy (${lastErr.slice(0, 80)}). Engine output shown; try again shortly.`)
}

export async function deskChat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
  const s = readSettings()
  if (!s.geminiApiKey) return 'No Gemini API key set. Add one in Settings to chat with the Desk.'
  let lastErr = 'unknown error'
  for (const model of modelChain()) {
    for (const useSearch of [true, false]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const m = makeModel(model, useSearch)
          if (!m) return 'No Gemini API key set.'
          const chat = m.startChat({
            history: [
              { role: 'user', parts: [{ text: `Context for this conversation:\n${contextBlock(ctx)}` }] },
              { role: 'model', parts: [{ text: 'Understood. I have the current context and will answer in it.' }] },
              ...history.slice(0, -1).map((h) => ({ role: h.role, parts: [{ text: h.content }] }))
            ]
          })
          return (await chat.sendMessage(message)).response.text()
        } catch (err) {
          lastErr = (err as Error).message
          if (isOverloaded(lastErr) && attempt === 0) {
            await sleep(1200)
            continue
          }
          break
        }
      }
    }
  }
  return `Desk busy: ${lastErr}. The model may be overloaded (503) — try again in a moment.`
}

export async function testGemini(): Promise<{ ok: boolean; message: string }> {
  const s = readSettings()
  if (!s.geminiApiKey) return { ok: false, message: 'No Gemini API key saved yet.' }
  try {
    const m = makeModel(s.geminiModel || 'gemini-2.5-flash', false)
    if (!m) return { ok: false, message: 'No Gemini API key saved yet.' }
    const r = await m.generateContent('Reply with the single word OK')
    return { ok: true, message: `Connected — ${s.geminiModel} replied "${r.response.text().trim().slice(0, 12)}".` }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}
