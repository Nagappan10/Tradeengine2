import type { AssetClass, CandleSeries, Interval, SeriesMeta } from '@shared/types'
import { BinanceProvider, MarketDataProvider, YahooProvider } from './providers'
import { candleRange, readCandles, writeCandles } from '../db'

const binance = new BinanceProvider()
const yahoo = new YahooProvider()
const PROVIDERS: MarketDataProvider[] = [binance, yahoo]

// Auto-resolve a symbol to the best provider (crypto -> Binance, else Yahoo).
export function resolveProvider(symbol: string): MarketDataProvider {
  if (binance.resolve(symbol)) return binance
  return yahoo
}

const INTERVAL_SECONDS: Record<Interval, number> = {
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800
}

// How far back to request by interval. Daily defaults to 2+ years so setups/ML have
// enough data to validate and train honestly.
function defaultLookbackSeconds(interval: Interval): number {
  switch (interval) {
    case '5m':
    case '15m':
      return 30 * 86400
    case '1h':
      return 180 * 86400
    case '4h':
      return 365 * 86400
    case '1d':
      return 800 * 86400 // ~2.2 years
    case '1w':
      return 6 * 365 * 86400
  }
}

const STALE_SECONDS = 6 * 3600

export async function getSeries(symbol: string, interval: Interval): Promise<CandleSeries> {
  const provider = resolveProvider(symbol)
  const now = Math.floor(Date.now() / 1000)
  const from = now - defaultLookbackSeconds(interval)

  const existing = candleRange(symbol, interval)
  let degraded = false
  let resolution: Interval = interval

  // Fetch only the missing/stale ranges.
  const needFetch =
    !existing || existing.min > from + INTERVAL_SECONDS[interval] || existing.max < now - STALE_SECONDS

  if (needFetch) {
    try {
      const fetchFrom = existing && existing.max > from ? existing.max - INTERVAL_SECONDS[interval] : from
      const res = await provider.getCandles(symbol, interval, fetchFrom, now)
      resolution = res.resolution
      if (resolution !== interval) degraded = true
      if (res.candles.length > 0) writeCandles(symbol, interval, provider.id, res.candles)
    } catch (err) {
      // Degrade to daily and tell the caller, if we weren't already on daily.
      if (interval !== '1d') {
        const dailyFrom = now - defaultLookbackSeconds('1d')
        const res = await provider.getCandles(symbol, '1d', dailyFrom, now)
        if (res.candles.length > 0) writeCandles(symbol, '1d', provider.id, res.candles)
        degraded = true
        resolution = '1d'
        const candles = readCandles(symbol, '1d')
        const meta: SeriesMeta = { symbol, interval, source: provider.id, resolution, degraded }
        return { meta, candles }
      }
      throw err
    }
  }

  const candles = readCandles(symbol, degraded && resolution !== interval ? resolution : interval)
  const meta: SeriesMeta = { symbol, interval, source: provider.id, resolution, degraded }
  return { meta, candles }
}

interface SearchHit {
  symbol: string
  name: string
  assetClass: AssetClass
  source: string
}

const QUICK_PICKS: SearchHit[] = [
  { symbol: 'BTCUSDT', name: 'Bitcoin / USDT', assetClass: 'crypto', source: 'binance' },
  { symbol: 'ETHUSDT', name: 'Ethereum / USDT', assetClass: 'crypto', source: 'binance' },
  { symbol: 'SOLUSDT', name: 'Solana / USDT', assetClass: 'crypto', source: 'binance' },
  { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'stock', source: 'yahoo' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', assetClass: 'stock', source: 'yahoo' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', assetClass: 'stock', source: 'yahoo' },
  { symbol: 'SPY', name: 'S&P 500 ETF', assetClass: 'index', source: 'yahoo' },
  { symbol: 'EURUSD=X', name: 'EUR / USD', assetClass: 'forex', source: 'yahoo' },
  { symbol: 'GC=F', name: 'Gold Futures', assetClass: 'commodity', source: 'yahoo' }
]

export function searchSymbols(query: string): SearchHit[] {
  const q = query.trim().toUpperCase()
  if (!q) return QUICK_PICKS
  const matches = QUICK_PICKS.filter((p) => p.symbol.includes(q) || p.name.toUpperCase().includes(q))
  // Always offer the raw query resolved to a provider so any symbol is reachable.
  const provider = resolveProvider(q)
  const resolved = provider.resolve(q) ?? q
  if (!matches.find((m) => m.symbol === resolved)) {
    matches.unshift({
      symbol: resolved,
      name: q,
      assetClass: provider.id === 'binance' ? 'crypto' : 'stock',
      source: provider.id
    })
  }
  return matches.slice(0, 12)
}

export { PROVIDERS }
