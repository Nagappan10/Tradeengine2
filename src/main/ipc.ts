import { ipcMain } from 'electron'
import type { AppSettings, ChatMessage, DeskContext, Interval } from '@shared/types'
import { getQuote, getSeries, getTicker, searchSymbols } from './data/registry'
import { BinanceStream } from './data/binanceStream'
import { analyzeSymbol, research } from './engine/analyze'
import { loadAllPromoted } from './db'
import { deskChat, deskVerdict, testDesk } from './desk'
import { mask, readSettings, writeSettings } from './settings'

// All network/DB/secret access lives here in the main process. The renderer only
// ever talks to these channels through the typed contextBridge in preload.
const stream = new BinanceStream()

export function registerIpc(): void {
  ipcMain.handle('searchSymbols', (_e, query: string) => searchSymbols(query))

  // Real-time Binance kline stream -> forwarded to the renderer as 'stream:candle'.
  ipcMain.handle('subscribeStream', (e, symbol: string, interval: Interval) =>
    stream.subscribe(symbol, interval, (candle, closed) => {
      if (!e.sender.isDestroyed()) e.sender.send('stream:candle', candle, closed)
    })
  )
  ipcMain.handle('unsubscribeStream', () => stream.stop())

  ipcMain.handle('getCandles', (_e, symbol: string, interval: Interval) => getSeries(symbol, interval))

  ipcMain.handle('getQuote', (_e, symbol: string) => getQuote(symbol))

  ipcMain.handle('getTicker', (_e, symbol: string) => getTicker(symbol))

  ipcMain.handle('analyze', (_e, symbol: string, interval: Interval) => analyzeSymbol(symbol, interval))

  ipcMain.handle('runResearch', (_e, symbol: string, interval: Interval) => research(symbol, interval))

  ipcMain.handle('getPromoted', () => loadAllPromoted())

  ipcMain.handle('deskVerdict', (_e, ctx: DeskContext) => deskVerdict(ctx))

  ipcMain.handle('deskChat', (_e, ctx: DeskContext, history: ChatMessage[], message: string) =>
    deskChat(ctx, history, message)
  )

  ipcMain.handle('testDesk', () => testDesk())

  ipcMain.handle('getSettings', () => mask(readSettings()))

  ipcMain.handle('saveSettings', (_e, patch: Partial<AppSettings>) => writeSettings(patch))
}
