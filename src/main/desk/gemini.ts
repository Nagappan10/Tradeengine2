import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'

// The Desk system prompt (honesty rules intact).
const SYSTEM_PROMPT = `You are a disciplined trading-strategy analyst. Honest, never hype, never certainty. NOT a financial advisor; nothing you say is a guarantee.

You are given: the instrument, the strategies currently firing on it (each with out-of-sample backtest stats and sample size), the auto-detected support/resistance and trendlines, the trader's timeframe, and optionally a fragile ML probability.

Use Google Search for CURRENT price, recent action, and catalysts when available. If reliable current data is missing, lower confidence and say so.

Keep SEPARATE: (1) HISTORICAL EDGE — from the supplied out-of-sample stats; trust it only if sample size is adequate, and distrust suspiciously high numbers as possible overfitting; (2) CURRENT READ — from price action, the detected levels, and context. Weight conviction toward firing strategies with real, sufficient-sample, out-of-sample track records. Reference each firing setup's entry/stop/target explicitly. Flag small sample sizes (< 10 trades).

When asked the first time, respond with ONLY a raw JSON object — no markdown, no fences:
{
  "verdict":"YES"|"NO"|"WAIT",
  "direction":"LONG"|"SHORT"|"NEUTRAL",
  "confidence":"LOW"|"MEDIUM"|"HIGH",
  "headline":"one concise sentence",
  "firingStrategies":"which promoted setups are signalling now with entry/stop/target and out-of-sample win rate + sample size, or 'none firing'",
  "currentRead":"what price action + detected S/R/trendlines say now",
  "keyLevels":{"support":"","resistance":"","invalidation":""},
  "mlNote":"one line, flagged fragile, or 'n/a'",
  "risk":"one sentence on the main risk"
}

For follow-up questions in the chat, answer conversationally as a patient analyst teaching a beginner — plain language, honest, separating historical edge from current read. Do not output JSON for follow-ups.`

function contextBlock(ctx: DeskContext): string {
  const setups = ctx.firingSetups.length
    ? ctx.firingSetups
        .map(
          (f) =>
            `- ${f.setup.name} [${f.setup.direction.toUpperCase()}] entry ${f.setup.entryPrice}, stop ${f.setup.stopPrice}, target ${f.setup.targetPrice}, R:R ${f.setup.riskReward}; OOS win rate ${(f.stats.winRate * 100).toFixed(0)}% over ${f.stats.sampleSize} trades, profit factor ${f.stats.profitFactor}${f.stats.overfit ? ' (FLAGGED OVERFIT)' : ''}`
        )
        .join('\n')
    : 'none firing'
  const zones = ctx.zones
    .slice(0, 6)
    .map((z) => `${z.kind} ${z.low.toFixed(2)}-${z.high.toFixed(2)} (touches ${z.touches}, strength ${z.strength})`)
    .join('; ')
  return `INSTRUMENT: ${ctx.symbol}
TIMEFRAME: ${ctx.interval}
DATA: ${ctx.source} @ ${ctx.resolution}
FIRING SETUPS:
${setups}
DETECTED S/R ZONES: ${zones || 'none'}
ML: ${ctx.ml.available ? `P(up)=${ctx.ml.probabilityUp}, ${ctx.ml.note}` : 'n/a (' + ctx.ml.note + ')'}`
}

function fallbackVerdict(ctx: DeskContext, reason: string): DeskVerdict {
  const firing = ctx.firingSetups[0]
  return {
    verdict: 'WAIT',
    direction: firing ? (firing.setup.direction === 'long' ? 'LONG' : 'SHORT') : 'NEUTRAL',
    confidence: 'LOW',
    headline: reason,
    firingStrategies: firing
      ? `${firing.setup.name}: entry ${firing.setup.entryPrice}, stop ${firing.setup.stopPrice}, target ${firing.setup.targetPrice}; OOS ${(firing.stats.winRate * 100).toFixed(0)}% / ${firing.stats.sampleSize} trades`
      : 'none firing',
    currentRead: 'Desk LLM unavailable; showing engine output only.',
    keyLevels: {
      support: ctx.zones.find((z) => z.kind === 'support')?.low.toFixed(2) ?? 'n/a',
      resistance: ctx.zones.find((z) => z.kind === 'resistance')?.high.toFixed(2) ?? 'n/a',
      invalidation: firing ? String(firing.setup.stopPrice) : 'n/a'
    },
    mlNote: ctx.ml.available ? ctx.ml.note : 'n/a',
    risk: 'Hypothesis, not a guarantee. Paper-trade before risking capital. Not financial advice.'
  }
}

// Build a model, optionally with Google Search grounding. Never throws here.
function makeModel(useSearch: boolean) {
  const s = readSettings()
  if (!s.geminiApiKey) return null
  const genAI = new GoogleGenerativeAI(s.geminiApiKey)
  // googleSearch is a valid tool for Gemini 2.x but isn't in the SDK's older types.
  const cfg: Record<string, unknown> = {
    model: s.geminiModel || 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT
  }
  if (useSearch) cfg.tools = [{ googleSearch: {} }]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return genAI.getGenerativeModel(cfg as any)
}

export async function deskVerdict(ctx: DeskContext): Promise<DeskVerdict> {
  const s = readSettings()
  if (!s.geminiApiKey) return fallbackVerdict(ctx, 'No Gemini API key set — add one in Settings. Showing engine output.')
  const prompt = `Give your first structured verdict for this setup. Respond with ONLY the JSON object.\n\n${contextBlock(ctx)}`
  // Try with Search grounding first; if the model/SDK rejects the tool, retry plain.
  for (const useSearch of [true, false]) {
    try {
      const m = makeModel(useSearch)
      if (!m) return fallbackVerdict(ctx, 'No Gemini API key set.')
      const resp = await m.generateContent(prompt)
      const text = resp.response.text()
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No JSON in response')
      return JSON.parse(text.slice(start, end + 1)) as DeskVerdict
    } catch (err) {
      if (useSearch) continue // grounding may be unsupported — fall back to a plain call
      return fallbackVerdict(ctx, `Desk error: ${(err as Error).message}`)
    }
  }
  return fallbackVerdict(ctx, 'Desk unavailable.')
}

export async function deskChat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
  const s = readSettings()
  if (!s.geminiApiKey) return 'No Gemini API key set. Add one in Settings to chat with the Desk.'
  for (const useSearch of [true, false]) {
    try {
      const m = makeModel(useSearch)
      if (!m) return 'No Gemini API key set.'
      const chat = m.startChat({
        history: [
          { role: 'user', parts: [{ text: `Context for this conversation:\n${contextBlock(ctx)}` }] },
          { role: 'model', parts: [{ text: 'Understood. I have the current context and will answer in it.' }] },
          ...history.slice(0, -1).map((h) => ({ role: h.role, parts: [{ text: h.content }] }))
        ]
      })
      const resp = await chat.sendMessage(message)
      return resp.response.text()
    } catch (err) {
      if (useSearch) continue
      return `Desk error: ${(err as Error).message}`
    }
  }
  return 'Desk unavailable.'
}

// Lightweight reachability check for the Settings "Test key" button.
export async function testGemini(): Promise<{ ok: boolean; message: string }> {
  const s = readSettings()
  if (!s.geminiApiKey) return { ok: false, message: 'No API key saved yet.' }
  try {
    const m = makeModel(false)
    if (!m) return { ok: false, message: 'No API key saved yet.' }
    const r = await m.generateContent('Reply with the single word OK')
    const t = r.response.text().trim()
    return { ok: true, message: `Connected — ${s.geminiModel} replied "${t.slice(0, 12)}".` }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}
