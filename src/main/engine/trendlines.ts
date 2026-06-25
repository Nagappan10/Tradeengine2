import type { Candle, Swing, Trendline } from '@shared/types'

// Fit one support trendline through swing lows and one resistance trendline through
// swing highs, choosing the line (through two pivots) that is touched the most and
// not materially violated by later price. Heuristic, labelled with touch count.
export function detectTrendlines(candles: Candle[], swings: Swing[]): Trendline[] {
  if (candles.length < 10) return []
  const avg = candles.reduce((s, c) => s + c.close, 0) / candles.length
  const tol = avg * 0.012
  const out: Trendline[] = []

  const lows = swings.filter((s) => s.kind === 'low').slice(-10)
  const highs = swings.filter((s) => s.kind === 'high').slice(-10)

  const fit = (pivots: Swing[], kind: 'support' | 'resistance'): Trendline | null => {
    let best: Trendline | null = null
    let bestTouches = 1
    for (let i = 0; i < pivots.length; i++) {
      for (let j = i + 1; j < pivots.length; j++) {
        const a = pivots[i]
        const b = pivots[j]
        if (b.time === a.time) continue
        const slope = (b.price - a.price) / (b.time - a.time)
        const at = (t: number) => a.price + slope * (t - a.time)
        // Reject lines materially violated by candles between the two anchors.
        let valid = true
        for (const c of candles) {
          if (c.time < a.time || c.time > b.time) continue
          if (kind === 'support' && c.low < at(c.time) - tol) valid = false
          if (kind === 'resistance' && c.high > at(c.time) + tol) valid = false
        }
        if (!valid) continue
        const touches = pivots.filter((p) => Math.abs(p.price - at(p.time)) <= tol).length
        if (touches > bestTouches) {
          bestTouches = touches
          best = { kind, t1: a.time, p1: a.price, t2: b.time, p2: b.price, touches }
        }
      }
    }
    return best
  }

  const sup = fit(lows, 'support')
  const res = fit(highs, 'resistance')
  if (sup) out.push(sup)
  if (res) out.push(res)
  return out
}
