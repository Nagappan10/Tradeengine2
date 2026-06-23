import type {
  Candle,
  Interval,
  PromotedSetup,
  ResearchDiagnostics,
  ResearchRun,
  Setup,
  SetupStats
} from '@shared/types'
import { backtest, DEFAULT_BT_OPTIONS } from './backtester'
import { currentSetup, generatorTemplates, libraryTemplates, SetupTemplate } from './setups'

// Thresholds for what counts as a usable / overfit setup.
const MIN_IS_TRADES = 8
const MIN_OOS_TRADES = 4
const MIN_OOS_WINRATE = 0.4
const MIN_OOS_PROFIT_FACTOR = 1.05
// In-sample great but out-of-sample poor => likely overfit.
const OVERFIT_WINRATE_GAP = 0.25
const SUSPICIOUS_WINRATE = 0.9

export interface CandidateResult {
  setup: Setup
  stats: SetupStats
  promoted: boolean
}

function evaluateCandidate(tpl: SetupTemplate, candles: Candle[], symbol: string, interval: Interval) {
  const bt = backtest(tpl, candles, DEFAULT_BT_OPTIONS)
  const setup = currentSetup(tpl, candles, symbol, interval)
  const isWin = bt.inSample.winRate
  const oosWin = bt.outOfSample.winRate
  const gap = isWin - oosWin

  let overfit = false
  let overfitReason: string | undefined

  if (bt.inSample.trades < MIN_IS_TRADES) {
    // not enough in-sample evidence — handled by caller as a different bucket
  }
  if (gap >= OVERFIT_WINRATE_GAP && oosWin < MIN_OOS_WINRATE) {
    overfit = true
    overfitReason = `In-sample win rate ${(isWin * 100).toFixed(0)}% collapses to ${(oosWin * 100).toFixed(0)}% out-of-sample.`
  }
  if (oosWin >= SUSPICIOUS_WINRATE && bt.outOfSample.trades < 12) {
    overfit = true
    overfitReason = `Suspiciously high ${(oosWin * 100).toFixed(0)}% win rate on a small sample (${bt.outOfSample.trades}).`
  }

  const stats: SetupStats = {
    setupId: tpl.id,
    winRate: oosWin,
    sampleSize: bt.outOfSample.trades,
    avgRiskReward: bt.outOfSample.avgRiskReward,
    profitFactor: bt.outOfSample.profitFactor,
    inSampleWinRate: isWin,
    outOfSampleWinRate: oosWin,
    inSampleReturnPct: bt.inSample.totalReturnPct,
    outOfSampleReturnPct: bt.outOfSample.totalReturnPct,
    overfit,
    overfitReason
  }
  return { setup, stats, bt }
}

export function runResearch(candles: Candle[], symbol: string, interval: Interval): ResearchRun {
  const startedAt = Date.now()
  const templates = [...libraryTemplates(), ...generatorTemplates()]

  const diag: ResearchDiagnostics = {
    candidatesTested: 0,
    failedInSample: 0,
    failedOutOfSample: 0,
    failedNoEntryTrigger: 0,
    flaggedOverfit: 0,
    promoted: 0
  }

  const promoted: PromotedSetup[] = []

  for (const tpl of templates) {
    diag.candidatesTested++
    const { setup, stats, bt } = evaluateCandidate(tpl, candles, symbol, interval)

    if (bt.inSample.trades === 0 && bt.outOfSample.trades === 0) {
      diag.failedNoEntryTrigger++
      continue
    }
    if (bt.inSample.trades < MIN_IS_TRADES) {
      diag.failedInSample++
      continue
    }
    if (stats.overfit) {
      diag.flaggedOverfit++
      continue // overfit setups are WITHHELD, never surfaced as winners
    }
    const passesOos =
      bt.outOfSample.trades >= MIN_OOS_TRADES &&
      stats.winRate >= MIN_OOS_WINRATE &&
      stats.profitFactor >= MIN_OOS_PROFIT_FACTOR
    if (!passesOos) {
      diag.failedOutOfSample++
      continue
    }

    promoted.push({ setup, stats, promotedAt: Date.now() })
    diag.promoted++
  }

  // Keep the best (by OOS profit factor then win rate), dedup by trigger+direction to stay clean.
  promoted.sort((a, b) =>
    b.stats.profitFactor - a.stats.profitFactor || b.stats.winRate - a.stats.winRate
  )

  return {
    id: `run_${startedAt}`,
    symbol,
    interval,
    startedAt,
    finishedAt: Date.now(),
    diagnostics: diag,
    promoted
  }
}

// Determine which promoted setups are firing right now on the latest bar.
export function firingFromPromoted(promoted: PromotedSetup[], candles: Candle[], symbol: string, interval: Interval) {
  const byId = new Map<string, SetupTemplate>()
  for (const tpl of [...libraryTemplates(), ...generatorTemplates()]) byId.set(tpl.id, tpl)
  const firing: { setup: Setup; stats: SetupStats }[] = []
  for (const p of promoted) {
    const tpl = byId.get(p.setup.id)
    if (!tpl) continue
    const fresh = currentSetup(tpl, candles, symbol, interval)
    if (fresh.firing) firing.push({ setup: fresh, stats: p.stats })
  }
  return firing
}
