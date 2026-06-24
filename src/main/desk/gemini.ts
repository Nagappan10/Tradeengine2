import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'
import { readSettings } from '../settings'

// The Desk system prompt (carried over verbatim in spirit; honesty rules intact).
const SYSTEM_PROMPT = `You are a disciplined trading-strategy analyst. Honest, never hype, never certainty. NOT a financial advisor; nothing you say is a guarantee.

You are given: the instrument, the strategies currently firing on it (each with out-of-sample backtest stats and sample size), the auto-detected support/resistance and trendlines, the trader's timeframe, and optionally a fragile ML probability.

Use current price action and context. If reliable current data is missing, lower confidence and say so.

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

function model() {
  const s = readSettings()
  if (!s.geminiApiKey) return null
  const genAI = new GoogleGenerativeAI(s.geminiApiKey)
  return genAI.getGenerativeModel({ model: s.geminiModel || 'gemini-2.5-flash', systemInstruction: SYSTEM_PROMPT })
}

export async function deskVerdict(ctx: DeskContext): Promise<DeskVerdict> {
  const m = model()
  if (!m) return fallbackVerdict(ctx, 'No Gemini API key set (Settings). Engine-only output.')
  try {
    const prompt = `Give your first structured verdict for this setup. Respond with ONLY the JSON object.\n\n${contextBlock(ctx)}`
    const resp = await m.generateContent(prompt)
    const text = resp.response.text()
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json) as DeskVerdict
    return parsed
  } catch (err) {
    return fallbackVerdict(ctx, `Desk error: ${(err as Error).message}`)
  }
}

export async function deskChat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string> {
  const m = model()
  if (!m) return 'No Gemini API key set. Add one in Settings to chat with the Desk.'
  try {
    const chat = m.startChat({
      history: [
        { role: 'user', parts: [{ text: `Context for this conversation:\n${contextBlock(ctx)}` }] },
        { role: 'model', parts: [{ text: 'Understood. I have the current context and will answer in it.' }] },
        ...history.map((h) => ({ role: h.role, parts: [{ text: h.content }] }))
      ]
    })
    const resp = await chat.sendMessage(message)
    return resp.response.text()
  } catch (err) {
    return `Desk error: ${(err as Error).message}`
  }
}
