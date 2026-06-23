import type { Candle, Swing, Zone } from '@shared/types'

export interface ZoneParams {
  // proximity for clustering pivots into a band, as a fraction of price
  clusterPct: number
  minTouches: number
}

export const DEFAULT_ZONE_PARAMS: ZoneParams = { clusterPct: 0.012, minTouches: 2 }

// Cluster pivot prices into zones by proximity/density, score by touch count + recency.
export function detectZones(candles: Candle[], swings: Swing[], params: ZoneParams = DEFAULT_ZONE_PARAMS): Zone[] {
  if (candles.length === 0) return []
  const lastTime = candles[candles.length - 1].time
  const barSeconds = candles.length > 1 ? candles[1].time - candles[0].time : 86400
  const avgPrice = candles.reduce((s, c) => s + c.close, 0) / candles.length
  const tol = avgPrice * params.clusterPct

  // Greedy clustering on sorted pivot prices.
  const sorted = [...swings].sort((a, b) => a.price - b.price)
  type Cluster = { prices: number[]; times: number[]; kinds: Swing['kind'][] }
  const clusters: Cluster[] = []
  for (const s of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && s.price - last.prices[last.prices.length - 1] <= tol) {
      last.prices.push(s.price)
      last.times.push(s.time)
      last.kinds.push(s.kind)
    } else {
      clusters.push({ prices: [s.price], times: [s.time], kinds: [s.kind] })
    }
  }

  const zones: Zone[] = []
  let idx = 0
  for (const c of clusters) {
    if (c.prices.length < params.minTouches) continue
    const low = Math.min(...c.prices)
    const high = Math.max(...c.prices)
    const mid = (low + high) / 2
    const lastTouch = Math.max(...c.times)
    const recencyBars = Math.max(0, Math.round((lastTime - lastTouch) / barSeconds))
    const highCount = c.kinds.filter((k) => k === 'high').length
    const kind: Zone['kind'] = mid >= avgPrice ? 'resistance' : highCount > c.prices.length / 2 ? 'resistance' : 'support'

    // Strength: more touches & fresher = stronger. Squashed to 0..1.
    const touchScore = Math.min(1, c.prices.length / 6)
    const recencyScore = Math.exp(-recencyBars / (candles.length / 2 || 1))
    const strength = Math.max(0.05, Math.min(1, 0.6 * touchScore + 0.4 * recencyScore))

    zones.push({
      id: `zone_${idx++}`,
      kind,
      low,
      high,
      touches: c.prices.length,
      recencyBars,
      strength: Number(strength.toFixed(3))
    })
  }
  return zones.sort((a, b) => b.strength - a.strength)
}

export function nearestZone(price: number, zones: Zone[], kind: Zone['kind']): Zone | null {
  const candidates = zones.filter((z) => z.kind === kind)
  if (candidates.length === 0) return null
  let best: Zone | null = null
  let bestDist = Infinity
  for (const z of candidates) {
    const center = (z.low + z.high) / 2
    const d = Math.abs(center - price)
    if (d < bestDist) {
      bestDist = d
      best = z
    }
  }
  return best
}
