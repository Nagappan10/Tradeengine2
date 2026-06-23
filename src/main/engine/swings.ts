import type { Candle, Swing } from '@shared/types'

// N-bar fractal/pivot detection. A pivot high at i requires `left`/`right` bars
// on each side to have strictly lower highs (mirror for lows).
export function detectSwings(candles: Candle[], left = 3, right = 3): Swing[] {
  const swings: Swing[] = []
  for (let i = left; i < candles.length - right; i++) {
    const h = candles[i].high
    const l = candles[i].low
    let isHigh = true
    let isLow = true
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue
      if (candles[j].high >= h) isHigh = false
      if (candles[j].low <= l) isLow = false
    }
    if (isHigh) swings.push({ time: candles[i].time, price: h, kind: 'high' })
    if (isLow) swings.push({ time: candles[i].time, price: l, kind: 'low' })
  }
  return swings
}
