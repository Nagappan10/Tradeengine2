import type { BacktestResult, Candle, Metrics, Trade } from '@shared/types'
import { SetupTemplate, zonesForTemplate } from './setups'

export interface BacktestOptions {
  feePct: number // per side, e.g. 0.0004 (4 bps)
  slippagePct: number // per side
  oosFraction: number // fraction of the time range reserved for out-of-sample (untouched)
  maxBarsInTrade: number
}

export const DEFAULT_BT_OPTIONS: BacktestOptions = {
  feePct: 0.0004,
  slippagePct: 0.0005,
  oosFraction: 0.3,
  maxBarsInTrade: 60
}

const EMPTY_METRICS: Metrics = {
  trades: 0,
  winRate: 0,
  profitFactor: 0,
  avgReturnPct: 0,
  avgWinPct: 0,
  avgLossPct: 0,
  totalReturnPct: 0,
  cagr: 0,
  maxDrawdownPct: 0,
  sharpe: 0,
  sortino: 0,
  avgRiskReward: 0,
  exposure: 0
}

// Event-driven, bar-by-bar backtest with NO lookahead: every decision at bar i uses
// only candles[0..i]; execution happens at that bar's close. Stops/targets are checked
// on subsequent bars' high/low (stop assumed to fill first when both are touched).
export function backtest(tpl: SetupTemplate, candles: Candle[], opts: BacktestOptions = DEFAULT_BT_OPTIONS): BacktestResult {
  const trades: Trade[] = []
  if (candles.length < 60) {
    return {
      inSample: EMPTY_METRICS,
      outOfSample: EMPTY_METRICS,
      trades: [],
      equityCurve: [],
      fees: opts.feePct,
      slippage: opts.slippagePct,
      splitTime: candles.length ? candles[candles.length - 1].time : 0
    }
  }

  const firstTime = candles[0].time
  const lastTime = candles[candles.length - 1].time
  const splitTime = firstTime + (lastTime - firstTime) * (1 - opts.oosFraction)

  const warmup = 60
  let openIdx = -1
  let entryPrice = 0
  let stopPrice = 0
  let targetPrice = 0
  let plannedRr = 0

  const cost = opts.feePct + opts.slippagePct

  for (let i = warmup; i < candles.length; i++) {
    if (openIdx === -1) {
      const zones = zonesForTemplate(tpl, candles, i)
      const sig = tpl.evaluate(candles, i, zones)
      if (sig) {
        openIdx = i
        entryPrice = sig.entryPrice
        stopPrice = sig.stopPrice
        targetPrice = sig.targetPrice
        const risk = Math.abs(entryPrice - stopPrice)
        plannedRr = risk > 0 ? Math.abs(targetPrice - entryPrice) / risk : 0
      }
      continue
    }

    // Manage open position on this bar (i > openIdx).
    const bar = candles[i]
    const long = tpl.direction === 'long'
    let exitPrice: number | null = null
    let exitReason: Trade['exitReason'] | null = null

    if (long) {
      if (bar.low <= stopPrice) {
        exitPrice = stopPrice
        exitReason = 'stop'
      } else if (bar.high >= targetPrice) {
        exitPrice = targetPrice
        exitReason = 'target'
      }
    } else {
      if (bar.high >= stopPrice) {
        exitPrice = stopPrice
        exitReason = 'stop'
      } else if (bar.low <= targetPrice) {
        exitPrice = targetPrice
        exitReason = 'target'
      }
    }

    if (exitPrice === null && i - openIdx >= opts.maxBarsInTrade) {
      exitPrice = bar.close
      exitReason = 'eod'
    }

    if (exitPrice !== null && exitReason !== null) {
      const gross = long ? exitPrice / entryPrice - 1 : entryPrice / exitPrice - 1
      const net = gross - 2 * cost
      trades.push({
        entryTime: candles[openIdx].time,
        exitTime: bar.time,
        direction: tpl.direction,
        entryPrice,
        exitPrice,
        returnPct: net * 100,
        bars: i - openIdx,
        exitReason
      })
      openIdx = -1
    }
  }

  const isTrades = trades.filter((t) => t.entryTime < splitTime)
  const oosTrades = trades.filter((t) => t.entryTime >= splitTime)
  const isMetrics = computeMetrics(isTrades, candles, plannedRr)
  const oosMetrics = computeMetrics(oosTrades, candles, plannedRr)
  const equity = buildEquity(oosTrades)

  return {
    inSample: isMetrics,
    outOfSample: oosMetrics,
    trades: oosTrades,
    equityCurve: equity,
    fees: opts.feePct,
    slippage: opts.slippagePct,
    splitTime
  }
}

function buildEquity(trades: Trade[]): { time: number; equity: number }[] {
  const curve: { time: number; equity: number }[] = []
  let eq = 1
  for (const t of trades) {
    eq *= 1 + t.returnPct / 100
    curve.push({ time: t.exitTime, equity: Number(eq.toFixed(4)) })
  }
  return curve
}

export function computeMetrics(trades: Trade[], candles: Candle[], plannedRr: number): Metrics {
  if (trades.length === 0) return { ...EMPTY_METRICS, avgRiskReward: plannedRr }

  const rets = trades.map((t) => t.returnPct / 100)
  const wins = trades.filter((t) => t.returnPct > 0)
  const losses = trades.filter((t) => t.returnPct <= 0)
  const grossWin = wins.reduce((s, t) => s + t.returnPct, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0))

  let equity = 1
  let peak = 1
  let maxDd = 0
  for (const r of rets) {
    equity *= 1 + r
    peak = Math.max(peak, equity)
    maxDd = Math.max(maxDd, (peak - equity) / peak)
  }
  const totalReturn = (equity - 1) * 100

  const spanSeconds = candles[candles.length - 1].time - candles[0].time
  const years = Math.max(spanSeconds / (365.25 * 86400), 1 / 12)
  const cagr = equity > 0 ? (Math.pow(equity, 1 / years) - 1) * 100 : -100

  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length
  const std = Math.sqrt(variance)
  const downside = Math.sqrt(
    rets.filter((r) => r < 0).reduce((s, r) => s + r ** 2, 0) / Math.max(1, rets.filter((r) => r < 0).length)
  )
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(trades.length) : 0
  const sortino = downside > 0 ? (mean / downside) * Math.sqrt(trades.length) : 0

  const totalBars = candles.length
  const barsInTrades = trades.reduce((s, t) => s + t.bars, 0)

  return {
    trades: trades.length,
    winRate: Number((wins.length / trades.length).toFixed(4)),
    profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(3)) : grossWin > 0 ? 99 : 0,
    avgReturnPct: Number((mean * 100).toFixed(3)),
    avgWinPct: wins.length ? Number((grossWin / wins.length).toFixed(3)) : 0,
    avgLossPct: losses.length ? Number((-grossLoss / losses.length).toFixed(3)) : 0,
    totalReturnPct: Number(totalReturn.toFixed(2)),
    cagr: Number(cagr.toFixed(2)),
    maxDrawdownPct: Number((maxDd * 100).toFixed(2)),
    sharpe: Number(sharpe.toFixed(2)),
    sortino: Number(sortino.toFixed(2)),
    avgRiskReward: Number(plannedRr.toFixed(2)),
    exposure: Number((barsInTrades / totalBars).toFixed(3))
  }
}
