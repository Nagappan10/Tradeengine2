import { ipcMain } from 'electron'
import type { AppSettings, ChatMessage, DeskContext, Interval } from '@shared/types'
import { getQuote, getSeries, searchSymbols } from './data/registry'
import { analyzeSymbol, research } from './engine/analyze'
import { loadAllPromoted } from './db'
import { deskChat, deskVerdict, testGemini } from './desk/gemini'
import { mask, readSettings, writeSettings } from './settings'

// All network/DB/secret access lives here in the main process. The renderer only
// ever talks to these channels through the typed contextBridge in preload.
export function registerIpc(): void {
  ipcMain.handle('searchSymbols', (_e, query: string) => searchSymbols(query))

  ipcMain.handle('getCandles', (_e, symbol: string, interval: Interval) => getSeries(symbol, interval))

  ipcMain.handle('getQuote', (_e, symbol: string) => getQuote(symbol))

  ipcMain.handle('analyze', (_e, symbol: string, interval: Interval) => analyzeSymbol(symbol, interval))

  ipcMain.handle('runResearch', (_e, symbol: string, interval: Interval) => research(symbol, interval))

  ipcMain.handle('getPromoted', () => loadAllPromoted())

  ipcMain.handle('deskVerdict', (_e, ctx: DeskContext) => deskVerdict(ctx))

  ipcMain.handle('deskChat', (_e, ctx: DeskContext, history: ChatMessage[], message: string) =>
    deskChat(ctx, history, message)
  )

  ipcMain.handle('testGemini', () => testGemini())

  ipcMain.handle('getSettings', () => mask(readSettings()))

  ipcMain.handle('saveSettings', (_e, patch: Partial<AppSettings>) => writeSettings(patch))
}
