import type { Interval, SymbolAnalysis, ResearchRun } from '@shared/types'
import { getSeries } from '../data/registry'
import { detectSwings } from './swings'
import { detectZones } from './zones'
import { detectTrendlines } from './trendlines'
import { mlSignal } from './ml'
import { trackDecay } from './decay'
import { currentFromPromoted, runResearch } from './research'
import { loadPromoted, savePromoted, saveResearchRun } from '../db'

// Full analysis for a symbol: data + zones + firing promoted setups + ML + decay.
// Runs research automatically the first time a symbol/interval has no promoted set.
export async function analyzeSymbol(symbol: string, interval: Interval): Promise<SymbolAnalysis> {
  const series = await getSeries(symbol, interval)
  const candles = series.candles
  const swings = detectSwings(candles, 3, 3)
  const zones = detectZones(candles, swings)
  const trendlines = detectTrendlines(candles, swings)

  let promoted = loadPromoted(symbol, interval)
  let diagnostics
  if (promoted.length === 0) {
    const run = runResearch(candles, symbol, interval)
    saveResearchRun(run)
    savePromoted(symbol, interval, run.promoted)
    promoted = run.promoted
    diagnostics = run.diagnostics
  } else {
    // Re-derive diagnostics cheaply for the empty-state explainer.
    diagnostics = {
      candidatesTested: promoted.length,
      failedInSample: 0,
      failedOutOfSample: 0,
      failedNoEntryTrigger: 0,
      flaggedOverfit: 0,
      promoted: promoted.length
    }
  }

  const promotedSetups = currentFromPromoted(promoted, candles, symbol, interval)
  const firingSetups = promotedSetups.filter((f) => f.setup.firing)
  const ml = mlSignal(candles)
  const decay = trackDecay(promoted, candles, interval)

  return {
    meta: series.meta,
    candles,
    zones,
    swings,
    trendlines,
    firingSetups,
    promotedSetups,
    diagnostics,
    ml,
    decay
  }
}

export async function research(symbol: string, interval: Interval): Promise<ResearchRun> {
  const series = await getSeries(symbol, interval)
  const run = runResearch(series.candles, symbol, interval)
  saveResearchRun(run)
  savePromoted(symbol, interval, run.promoted)
  return run
}
