import type { AssetClass, Candle, Interval, Quote, Ticker } from '@shared/types'

export interface MarketDataProvider {
  id: string
  assetClasses: AssetClass[]
  supportsIntraday(symbol: string): boolean
  // Resolve the provider-native symbol; return null if this provider can't serve it.
  resolve(symbol: string): string | null
  getCandles(symbol: string, interval: Interval, from: number, to: number): Promise<{ candles: Candle[]; resolution: Interval }>
  getLatest(symbol: string): Promise<Quote>
  getTicker(symbol: string): Promise<Ticker>
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'StrategyDesk/3.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

// ---------------- Binance (crypto, deep intraday) ----------------

const BINANCE_INTERVALS: Record<Interval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w'
}

const KNOWN_CRYPTO = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'MATIC', 'DOT', 'LTC']

export class BinanceProvider implements MarketDataProvider {
  id = 'binance'
  assetClasses: AssetClass[] = ['crypto']
  supportsIntraday(): boolean {
    return true
  }
  resolve(symbol: string): string | null {
    const s = symbol.toUpperCase().replace('/', '')
    if (s.endsWith('USDT')) return s
    if (s.endsWith('USD')) return s.slice(0, -3) + 'USDT'
    if (KNOWN_CRYPTO.includes(s)) return s + 'USDT'
    return null
  }
  async getCandles(symbol: string, interval: Interval, from: number, to: number) {
    const sym = this.resolve(symbol)
    if (!sym) throw new Error(`Binance cannot resolve ${symbol}`)
    const out: Candle[] = []
    let start = from * 1000
    const end = to * 1000
    // page through 1000-candle limits
    for (let guard = 0; guard < 50; guard++) {
      const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${BINANCE_INTERVALS[interval]}&startTime=${start}&endTime=${end}&limit=1000`
      const rows = (await fetchJson(url)) as any[]
      if (!Array.isArray(rows) || rows.length === 0) break
      for (const r of rows) {
        out.push({
          time: Math.floor(r[0] / 1000),
          open: parseFloat(r[1]),
          high: parseFloat(r[2]),
          low: parseFloat(r[3]),
          close: parseFloat(r[4]),
          volume: parseFloat(r[5])
        })
      }
      const lastOpen = rows[rows.length - 1][0]
      if (rows.length < 1000) break
      start = lastOpen + 1
      if (start >= end) break
    }
    return { candles: out, resolution: interval }
  }
  async getLatest(symbol: string): Promise<Quote> {
    const sym = this.resolve(symbol)
    if (!sym) throw new Error(`Binance cannot resolve ${symbol}`)
    const data = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`)
    return { symbol, price: parseFloat(data.price), time: Math.floor(Date.now() / 1000) }
  }
  async getTicker(symbol: string): Promise<Ticker> {
    const sym = this.resolve(symbol)
    if (!sym) throw new Error(`Binance cannot resolve ${symbol}`)
    const data = await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`)
    return { symbol, price: parseFloat(data.lastPrice), changePct: parseFloat(data.priceChangePercent) }
  }
}

// ---------------- Yahoo (stocks/indices/forex/commodities fallback) ----------------

const YAHOO_INTERVALS: Record<Interval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '60m',
  '4h': '60m', // Yahoo has no 4h; we degrade to 60m
  '1d': '1d',
  '1w': '1wk'
}

export class YahooProvider implements MarketDataProvider {
  id = 'yahoo'
  assetClasses: AssetClass[] = ['stock', 'index', 'forex', 'commodity']
  supportsIntraday(): boolean {
    // Free Yahoo intraday is shallow (a few days); daily is the reliable path.
    return true
  }
  resolve(symbol: string): string | null {
    return symbol.toUpperCase()
  }
  async getCandles(symbol: string, interval: Interval, from: number, to: number) {
    const yi = YAHOO_INTERVALS[interval]
    let resolution: Interval = interval
    if (interval === '4h') resolution = '1h'
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol.toUpperCase()
    )}?period1=${from}&period2=${to}&interval=${yi}&includePrePost=false`
    const data = await fetchJson(url)
    const result = data?.chart?.result?.[0]
    if (!result) return { candles: [], resolution }
    const ts: number[] = result.timestamp ?? []
    const q = result.indicators?.quote?.[0] ?? {}
    const candles: Candle[] = []
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i]
      const h = q.high?.[i]
      const l = q.low?.[i]
      const c = q.close?.[i]
      const v = q.volume?.[i] ?? 0
      if (o == null || h == null || l == null || c == null) continue
      candles.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: v })
    }
    return { candles, resolution }
  }
  async getLatest(symbol: string): Promise<Quote> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol.toUpperCase()
    )}?interval=1d&range=1d`
    const data = await fetchJson(url)
    const result = data?.chart?.result?.[0]
    const price = result?.meta?.regularMarketPrice ?? 0
    return { symbol, price, time: Math.floor(Date.now() / 1000) }
  }
  async getTicker(symbol: string): Promise<Ticker> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol.toUpperCase()
    )}?interval=1d&range=5d`
    const data = await fetchJson(url)
    const result = data?.chart?.result?.[0]
    const meta = result?.meta ?? {}
    const price = meta.regularMarketPrice ?? 0
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? price
    const changePct = prev ? ((price - prev) / prev) * 100 : 0
    return { symbol, price, changePct }
  }
}
