import type { DeskContext, DeskVerdict } from '@shared/types'

// Shared Desk system prompt + context formatting, used by every provider
// (Gemini, Groq, …). Honesty rules intact.
export const SYSTEM_PROMPT = `You are a disciplined trading-strategy analyst. Honest, never hype, never certainty. NOT a financial advisor; nothing you say is a guarantee.

You are given: the instrument, the strategies currently firing on it (each with out-of-sample backtest stats and sample size), the auto-detected support/resistance and trendlines, the trader's timeframe, and optionally a fragile ML probability.

If reliable current data is missing, lower confidence and say so.

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
