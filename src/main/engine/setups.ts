import type { Candle, Direction, EntryTrigger, Interval, Setup, Zone } from '@shared/types'
import { detectSwings } from './swings'
import { detectZones, nearestZone, ZoneParams } from './zones'
import { ema } from '@shared/indicators'

// A template is the testable rule that produces concrete entry/stop/target prices.
// It is evaluated bar-by-bar with ONLY the data available up to that bar (no lookahead).
export interface SetupTemplate {
  id: string
  name: string
  source: 'library' | 'generator'
  trigger: EntryTrigger
  direction: Direction
  reasoning: string
  zoneParams: ZoneParams
  params: { rr: number; stopBufferPct: number; volumeMult: number; emaFast: number; emaSlow: number }
  evaluate: (candles: Candle[], i: number, zones: Zone[]) => Signal | null
}

export interface Signal {
  entryPrice: number
  stopPrice: number
  targetPrice: number
  support: { low: number; high: number; touches: number; strength: number }
  resistance: { low: number; high: number; touches: number; strength: number }
}

const EMPTY_ZONE = { low: 0, high: 0, touches: 0, strength: 0 }

function zoneToBand(z: Zone | null) {
  if (!z) return null
  return { low: z.low, high: z.low === z.high ? z.high * 1.001 : z.high, touches: z.touches, strength: z.strength }
}

function avgVolume(candles: Candle[], i: number, n = 20): number {
  let s = 0
  let c = 0
  for (let j = Math.max(0, i - n + 1); j <= i; j++) {
    s += candles[j].volume
    c++
  }
  return c ? s / c : 0
}

// ---- Trigger evaluators. Each returns a Signal when the rule fires at bar i. ----

function evalSupportBounce(p: SetupTemplate['params']): SetupTemplate['evaluate'] {
  return (candles, i, zones) => {
    if (i < 1) return null
    const bar = candles[i]
    const sup = nearestZone(bar.close, zones, 'support')
    const res = nearestZone(bar.close, zones, 'resistance')
    if (!sup) return null
    // Wick dipped into support but close held above the zone high -> bounce.
    const dipped = bar.low <= sup.high && bar.low >= sup.low * (1 - 0.03)
    const held = bar.close > sup.high
    const bullish = bar.close > bar.open
    if (!(dipped && held && bullish)) return null
    const entry = bar.close
    const stop = sup.low * (1 - p.stopBufferPct)
    const risk = entry - stop
    if (risk <= 0) return null
    const targetByRr = entry + risk * p.rr
    const target = res ? Math.min(targetByRr, res.low) : targetByRr
    if (target <= entry) return null
    return {
      entryPrice: entry,
      stopPrice: stop,
      targetPrice: target,
      support: zoneToBand(sup)!,
      resistance: zoneToBand(res) ?? EMPTY_ZONE
    }
  }
}

function evalResistanceBreakout(p: SetupTemplate['params']): SetupTemplate['evaluate'] {
  return (candles, i, zones) => {
    if (i < 1) return null
    const bar = candles[i]
    const prev = candles[i - 1]
    const res = nearestZone(bar.close, zones, 'resistance')
    if (!res) return null
    const brokeNow = bar.close > res.high && prev.close <= res.high
    const volOk = bar.volume >= avgVolume(candles, i) * p.volumeMult
    if (!(brokeNow && volOk)) return null
    const entry = bar.close
    const stop = res.low * (1 - p.stopBufferPct)
    const risk = entry - stop
    if (risk <= 0) return null
    const target = entry + risk * p.rr
    return {
      entryPrice: entry,
      stopPrice: stop,
      targetPrice: target,
      support: zoneToBand(res)!, // broken resistance becomes support
      resistance: EMPTY_ZONE
    }
  }
}

function evalBreakoutRetest(p: SetupTemplate['params']): SetupTemplate['evaluate'] {
  return (candles, i, zones) => {
    if (i < 3) return null
    const bar = candles[i]
    const res = nearestZone(bar.close, zones, 'resistance')
    if (!res) return null
    // Look back a few bars for a breakout above this zone, then a retest that holds.
    let brokeEarlier = false
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      if (candles[j].close > res.high) brokeEarlier = true
    }
    const retested = bar.low <= res.high && bar.close > res.high
    if (!(brokeEarlier && retested)) return null
    const entry = bar.close
    const stop = res.low * (1 - p.stopBufferPct)
    const risk = entry - stop
    if (risk <= 0) return null
    const target = entry + risk * p.rr
    return {
      entryPrice: entry,
      stopPrice: stop,
      targetPrice: target,
      support: zoneToBand(res)!,
      resistance: EMPTY_ZONE
    }
  }
}

function evalRangeReversal(p: SetupTemplate['params']): SetupTemplate['evaluate'] {
  return (candles, i, zones) => {
    if (i < 1) return null
    const bar = candles[i]
    const res = nearestZone(bar.close, zones, 'resistance')
    const sup = nearestZone(bar.close, zones, 'support')
    if (!res || !sup) return null
    // Bearish reversal at the top of the range -> short.
    const atResistance = bar.high >= res.low && bar.high <= res.high * (1 + 0.01)
    const bearish = bar.close < bar.open && candles[i - 1].close > candles[i - 1].open
    if (!(atResistance && bearish)) return null
    const entry = bar.close
    const stop = res.high * (1 + p.stopBufferPct)
    const risk = stop - entry
    if (risk <= 0) return null
    const targetByRr = entry - risk * p.rr
    const target = Math.max(targetByRr, sup.high)
    if (target >= entry) return null
    return {
      entryPrice: entry,
      stopPrice: stop,
      targetPrice: target,
      support: zoneToBand(sup)!,
      resistance: zoneToBand(res)!
    }
  }
}

function evalChannelPullback(p: SetupTemplate['params']): SetupTemplate['evaluate'] {
  return (candles, i, zones) => {
    if (i < p.emaSlow + 2) return null
    const closes = candles.slice(0, i + 1).map((c) => c.close)
    const fast = ema(closes, p.emaFast)
    const slow = ema(closes, p.emaSlow)
    const f = fast[i]
    const s = slow[i]
    if (f === null || s === null) return null
    const bar = candles[i]
    const uptrend = f > s
    // Pullback to fast EMA in an uptrend, then a bullish close = trend-channel pullback.
    const pulledBack = bar.low <= f && bar.close > f
    const bullish = bar.close > bar.open
    if (!(uptrend && pulledBack && bullish)) return null
    const sup = nearestZone(bar.close, zones, 'support')
    const res = nearestZone(bar.close, zones, 'resistance')
    const entry = bar.close
    const stop = (sup ? sup.low : bar.low) * (1 - p.stopBufferPct)
    const risk = entry - stop
    if (risk <= 0) return null
    const target = entry + risk * p.rr
    return {
      entryPrice: entry,
      stopPrice: stop,
      targetPrice: target,
      support: zoneToBand(sup) ?? { low: stop, high: entry, touches: 0, strength: 0.2 },
      resistance: zoneToBand(res) ?? EMPTY_ZONE
    }
  }
}

const EVALUATORS: Record<EntryTrigger, (p: SetupTemplate['params']) => SetupTemplate['evaluate']> = {
  support_bounce: evalSupportBounce,
  resistance_breakout: evalResistanceBreakout,
  breakout_retest: evalBreakoutRetest,
  range_reversal: evalRangeReversal,
  channel_pullback: evalChannelPullback,
  reversal_candle_at_zone: evalRangeReversal
}

const REASONING: Record<EntryTrigger, string> = {
  support_bounce: 'support bounce',
  resistance_breakout: 'resistance breakout',
  breakout_retest: 'breakout retest',
  range_reversal: 'bear-trap reversal',
  channel_pullback: 'trend-channel pullback',
  reversal_candle_at_zone: 'reversal at zone'
}

const DIRECTION: Record<EntryTrigger, Direction> = {
  support_bounce: 'long',
  resistance_breakout: 'long',
  breakout_retest: 'long',
  range_reversal: 'short',
  channel_pullback: 'long',
  reversal_candle_at_zone: 'short'
}

function buildTemplate(
  trigger: EntryTrigger,
  source: 'library' | 'generator',
  zoneParams: ZoneParams,
  params: SetupTemplate['params'],
  idSuffix = ''
): SetupTemplate {
  const name = `${REASONING[trigger]} (R:R 1:${params.rr})`
  return {
    id: `${trigger}_${source}_${idSuffix || params.rr}`,
    name,
    source,
    trigger,
    direction: DIRECTION[trigger],
    reasoning: REASONING[trigger],
    zoneParams,
    params,
    evaluate: EVALUATORS[trigger](params)
  }
}

const DEFAULT_PARAMS: SetupTemplate['params'] = {
  rr: 2,
  stopBufferPct: 0.005,
  volumeMult: 1.2,
  emaFast: 20,
  emaSlow: 50
}

// Built-in library of known setups.
export function libraryTemplates(): SetupTemplate[] {
  const zp: ZoneParams = { clusterPct: 0.012, minTouches: 2 }
  return [
    buildTemplate('support_bounce', 'library', zp, { ...DEFAULT_PARAMS, rr: 2 }),
    buildTemplate('resistance_breakout', 'library', zp, { ...DEFAULT_PARAMS, rr: 2.5 }),
    buildTemplate('breakout_retest', 'library', zp, { ...DEFAULT_PARAMS, rr: 2 }),
    buildTemplate('range_reversal', 'library', zp, { ...DEFAULT_PARAMS, rr: 2 }),
    buildTemplate('channel_pullback', 'library', zp, { ...DEFAULT_PARAMS, rr: 2 })
  ]
}

// Autonomous generator: invent variants over zone-detection params, R:R, stop distance, etc.
export function generatorTemplates(): SetupTemplate[] {
  const out: SetupTemplate[] = []
  const triggers: EntryTrigger[] = [
    'support_bounce',
    'resistance_breakout',
    'breakout_retest',
    'range_reversal',
    'channel_pullback'
  ]
  const clusterPcts = [0.008, 0.012, 0.02]
  const rrs = [1.5, 2, 2.5, 3]
  const stopBuffers = [0.003, 0.008]
  let n = 0
  for (const t of triggers) {
    for (const cp of clusterPcts) {
      for (const rr of rrs) {
        for (const sb of stopBuffers) {
          const zp: ZoneParams = { clusterPct: cp, minTouches: 2 }
          out.push(
            buildTemplate('reversal_candle_at_zone' === t ? t : t, 'generator', zp, {
              ...DEFAULT_PARAMS,
              rr,
              stopBufferPct: sb
            }, `g${n++}`)
          )
        }
      }
    }
  }
  return out
}

// Compute the zones for a given template at a given bar (window ending at i).
export function zonesForTemplate(tpl: SetupTemplate, candles: Candle[], i: number, lookback = 160): Zone[] {
  const start = Math.max(0, i - lookback)
  const window = candles.slice(start, i + 1)
  const swings = detectSwings(window, 3, 3)
  return detectZones(window, swings, tpl.zoneParams)
}

// Build a concrete Setup object for the most recent bar (used for "firing" markup).
export function currentSetup(tpl: SetupTemplate, candles: Candle[], symbol: string, interval: Interval): Setup {
  const i = candles.length - 1
  const zones = zonesForTemplate(tpl, candles, i)
  const sig = tpl.evaluate(candles, i, zones)
  const fallbackSup = nearestZone(candles[i].close, zones, 'support')
  const fallbackRes = nearestZone(candles[i].close, zones, 'resistance')
  const support = sig?.support ??
    (fallbackSup ? { low: fallbackSup.low, high: fallbackSup.high, touches: fallbackSup.touches, strength: fallbackSup.strength } : EMPTY_ZONE)
  const resistance = sig?.resistance ??
    (fallbackRes ? { low: fallbackRes.low, high: fallbackRes.high, touches: fallbackRes.touches, strength: fallbackRes.strength } : EMPTY_ZONE)
  const entry = sig?.entryPrice ?? candles[i].close
  const stop = sig?.stopPrice ?? (tpl.direction === 'long' ? entry * 0.97 : entry * 1.03)
  const target = sig?.targetPrice ?? (tpl.direction === 'long' ? entry * 1.06 : entry * 0.94)
  const risk = Math.abs(entry - stop)
  const reward = Math.abs(target - entry)
  return {
    id: tpl.id,
    name: tpl.name,
    source: tpl.source,
    symbol,
    interval,
    direction: tpl.direction,
    trigger: tpl.trigger,
    reasoning: tpl.reasoning,
    supportZone: support,
    resistanceZone: resistance,
    entryPrice: Number(entry.toFixed(6)),
    stopPrice: Number(stop.toFixed(6)),
    targetPrice: Number(target.toFixed(6)),
    riskReward: risk > 0 ? Number((reward / risk).toFixed(2)) : 0,
    params: { rr: tpl.params.rr, stopBufferPct: tpl.params.stopBufferPct, clusterPct: tpl.zoneParams.clusterPct },
    firing: !!sig
  }
}
