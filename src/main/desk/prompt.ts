import type { DeskContext, DeskVerdict } from '@shared/types'

// Shared Desk system prompt + context formatting, used by every provider
// (Gemini, Groq, …). Honesty rules intact.
export const SYSTEM_PROMPT = `You are a friendly trading coach for a BEGINNER. Honest, never hype, never certainty. NOT a financial advisor; nothing you say is a guarantee.

Style rules (important):
- Use simple words. No jargon without a 3-word explanation.
- Be SHORT. Each field one short sentence. In chat, 2-4 short sentences max, plain English.
- Talk like you are teaching a friend who is new to trading.

You are given: the instrument, the strategies currently firing (each with out-of-sample win rate and sample size), the auto-detected support/resistance, the timeframe, and an optional fragile ML probability.

Keep two things SEPARATE in your head: (1) the HISTORICAL EDGE from the backtested stats — only trust it if the sample size is decent (10+ trades), and be suspicious of very high win rates; (2) the CURRENT READ from price and the levels. If a setup is firing, say plainly what to do: the entry price, where the stop goes, and the target. If nothing is firing, say "wait" and what price level to watch.

When asked the first time, respond with ONLY a raw JSON object — no markdown, no fences:
{
  "verdict":"YES"|"NO"|"WAIT",
  "direction":"LONG"|"SHORT"|"NEUTRAL",
  "confidence":"LOW"|"MEDIUM"|"HIGH",
  "headline":"one short plain sentence a beginner gets",
  "firingStrategies":"the firing setup in plain words: e.g. 'Buy near 100, stop 98, target 105 — won 60% of 14 past trades', or 'none firing — wait'",
  "currentRead":"one short sentence on what price is doing now",
  "keyLevels":{"support":"","resistance":"","invalidation":""},
  "mlNote":"one short line, say it's a weak hint, or 'n/a'",
  "risk":"one short sentence on what could go wrong"
}

For follow-up chat questions, do NOT output JSON or code fences. Reply in 2-4 short, simple sentences only.`

// Fill any blank key levels the model left empty, using the detected zones / setup.
export function fillVerdict(ctx: DeskContext, v: DeskVerdict): DeskVerdict {
  const sup = ctx.zones.find((z) => z.kind === 'support')
  const res = ctx.zones.find((z) => z.kind === 'resistance')
  const firing = ctx.firingSetups[0]
  const kl = v.keyLevels || { support: '', resistance: '', invalidation: '' }
  return {
    ...v,
    keyLevels: {
      support: kl.support?.trim() || (sup ? `${sup.low.toFixed(2)}-${sup.high.toFixed(2)}` : 'n/a'),
      resistance: kl.resistance?.trim() || (res ? `${res.low.toFixed(2)}-${res.high.toFixed(2)}` : 'n/a'),
      invalidation: kl.invalidation?.trim() || (firing ? String(firing.setup.stopPrice) : 'n/a')
    }
  }
}

// Strip code fences / stray JSON from a chat reply so the user never sees raw JSON.
export function cleanChatReply(text: string): string {
  let t = text.trim()
  t = t.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const o = JSON.parse(t) as Partial<DeskVerdict>
      const parts = [o.headline, o.currentRead, o.firingStrategies, o.risk].filter(Boolean)
      if (parts.length) return parts.join(' ')
    } catch {
      /* leave as-is */
    }
  }
  return t
}

export function contextBlock(ctx: DeskContext): string {
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

export function parseVerdict(text: string): DeskVerdict {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON in response')
  return JSON.parse(text.slice(start, end + 1)) as DeskVerdict
}

export function fallbackVerdict(ctx: DeskContext, reason: string): DeskVerdict {
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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const isOverloaded = (msg: string) => /503|overloaded|high demand|UNAVAILABLE|rate limit|429/i.test(msg)
