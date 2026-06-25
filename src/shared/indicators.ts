import type { Candle } from './types'

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  const k = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < values.length; i++) {
    if (prev === null) {
      // seed with SMA once we have `period` values
      if (i >= period - 1) {
        let s = 0
        for (let j = i - period + 1; j <= i; j++) s += values[j]
        prev = s / period
        out[i] = prev
      }
    } else {
      prev = values[i] * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = Math.max(change, 0)
    const loss = Math.max(-change, 0)
    if (i <= period) {
      avgGain += gain
      avgLoss += loss
      if (i === period) {
        avgGain /= period
        avgLoss /= period
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    }
  }
  return out
}

export interface MacdPoint {
  macd: number | null
  signal: number | null
  hist: number | null
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdPoint[] {
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)
  const macdLine: number[] = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? (emaFast[i] as number) - (emaSlow[i] as number) : NaN
  )
  const signalLine = ema(macdLine.map((v) => (isNaN(v) ? 0 : v)), signalPeriod)
  return closes.map((_, i) => {
    const m = isNaN(macdLine[i]) ? null : macdLine[i]
    const s = signalLine[i]
    return { macd: m, signal: s, hist: m !== null && s !== null ? m - s : null }
  })
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null)
  const trs: number[] = []
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low)
    } else {
      const prevClose = candles[i - 1].close
      trs.push(
        Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - prevClose),
          Math.abs(candles[i].low - prevClose)
        )
      )
    }
  }
  let sum = 0
  for (let i = 0; i < trs.length; i++) {
    sum += trs[i]
    if (i >= period) sum -= trs[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period)
  const upper: (number | null)[] = new Array(closes.length).fill(null)
  const lower: (number | null)[] = new Array(closes.length).fill(null)
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0
    for (let j = i - period + 1; j <= i; j++) s += (closes[j] - (mid[i] as number)) ** 2
    const sd = Math.sqrt(s / period)
    upper[i] = (mid[i] as number) + mult * sd
    lower[i] = (mid[i] as number) - mult * sd
  }
  return { mid, upper, lower }
}
