import type { Candle, DecayStatus, Interval, PromotedSetup } from '@shared/types'
import { backtest, DEFAULT_BT_OPTIONS } from './backtester'
import { generatorTemplates, libraryTemplates, SetupTemplate } from './setups'

// Monitor each promoted setup's rolling out-of-sample/forward performance and flag
// strategies whose edge is fading, so the Desk stops leaning on dead ones.
export function trackDecay(promoted: PromotedSetup[], candles: Candle[], _interval: Interval): DecayStatus[] {
  const byId = new Map<string, SetupTemplate>()
  for (const tpl of [...libraryTemplates(), ...generatorTemplates()]) byId.set(tpl.id, tpl)

  const out: DecayStatus[] = []
  // Use the most recent ~30% as the "rolling/forward" window vs the prior baseline.
  const recentWindow = candles.slice(Math.floor(candles.length * 0.7))

  for (const p of promoted) {
    const tpl = byId.get(p.setup.id)
    if (!tpl) continue
    const recentBt = backtest(tpl, recentWindow.length >= 60 ? recentWindow : candles, DEFAULT_BT_OPTIONS)
    const rolling = recentBt.outOfSample.trades > 0 ? recentBt.outOfSample.winRate : recentBt.inSample.winRate
    const baseline = p.stats.outOfSampleWinRate
    const decaying = rolling < baseline - 0.15 && baseline > 0
    out.push({
      setupId: p.setup.id,
      setupName: p.setup.name,
      rollingWinRate: Number(rolling.toFixed(3)),
      baselineWinRate: Number(baseline.toFixed(3)),
      decaying,
      note: decaying
        ? `Edge fading: rolling win rate ${(rolling * 100).toFixed(0)}% vs baseline ${(baseline * 100).toFixed(0)}%.`
        : `Stable: rolling ${(rolling * 100).toFixed(0)}% vs baseline ${(baseline * 100).toFixed(0)}%.`
    })
  }
  return out
}
