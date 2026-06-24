import WebSocket from 'ws'
import type { Candle, Interval } from '@shared/types'
import { BinanceProvider } from './providers'

const binance = new BinanceProvider()

export type CandleListener = (candle: Candle, closed: boolean) => void

// Streams real-time kline updates from Binance for crypto symbols so the chart
// ticks tick-by-tick. Only one subscription is active at a time; switching
// symbol/interval transparently reconnects. Non-crypto symbols return false.
export class BinanceStream {
  private ws: WebSocket | null = null
  private streamName = ''
  private listener: CandleListener | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  subscribe(symbol: string, interval: Interval, listener: CandleListener): boolean {
    const sym = binance.resolve(symbol)
    if (!sym) {
      this.stop()
      return false
    }
    const stream = `${sym.toLowerCase()}@kline_${interval}`
    if (stream === this.streamName && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.listener = listener
      return true
    }
    this.stop()
    this.streamName = stream
    this.listener = listener
    this.open()
    return true
  }

  private open(): void {
    const stream = this.streamName
    if (!stream) return
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`)
    this.ws = ws

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString()) as { k?: Record<string, string | number | boolean> }
        const k = msg.k
        if (!k) return
        const candle: Candle = {
          time: Math.floor(Number(k.t) / 1000),
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
          volume: Number(k.v)
        }
        this.listener?.(candle, Boolean(k.x))
      } catch {
        /* ignore malformed frames */
      }
    })

    ws.on('close', () => {
      // Reconnect only if this is still the active stream.
      if (this.streamName === stream && !this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          if (this.streamName === stream) this.open()
        }, 2000)
      }
    })
    ws.on('error', () => {
      try {
        ws.close()
      } catch {
        /* noop */
      }
    })
  }

  stop(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.streamName = ''
    this.listener = null
    if (this.ws) {
      try {
        this.ws.removeAllListeners()
        this.ws.close()
      } catch {
        /* noop */
      }
      this.ws = null
    }
  }
}
