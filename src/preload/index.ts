import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  AppSettings,
  Candle,
  ChatMessage,
  DeskBridge,
  DeskContext,
  Interval
} from '@shared/types'

// The ONLY surface the renderer can touch. No secrets, no network, no DB here —
// every call is forwarded to a main-process IPC handler.
const bridge: DeskBridge = {
  searchSymbols: (query) => ipcRenderer.invoke('searchSymbols', query),
  getCandles: (symbol, interval: Interval) => ipcRenderer.invoke('getCandles', symbol, interval),
  getQuote: (symbol) => ipcRenderer.invoke('getQuote', symbol),
  getTicker: (symbol) => ipcRenderer.invoke('getTicker', symbol),
  subscribeStream: (symbol, interval: Interval) => ipcRenderer.invoke('subscribeStream', symbol, interval),
  unsubscribeStream: () => ipcRenderer.invoke('unsubscribeStream'),
  onStreamCandle: (cb: (candle: Candle, closed: boolean) => void) => {
    const handler = (_e: IpcRendererEvent, candle: Candle, closed: boolean) => cb(candle, closed)
    ipcRenderer.on('stream:candle', handler)
    return () => ipcRenderer.removeListener('stream:candle', handler)
  },
  analyze: (symbol, interval: Interval) => ipcRenderer.invoke('analyze', symbol, interval),
  runResearch: (symbol, interval: Interval) => ipcRenderer.invoke('runResearch', symbol, interval),
  getPromoted: () => ipcRenderer.invoke('getPromoted'),
  deskVerdict: (ctx: DeskContext) => ipcRenderer.invoke('deskVerdict', ctx),
  deskChat: (ctx: DeskContext, history: ChatMessage[], message: string) =>
    ipcRenderer.invoke('deskChat', ctx, history, message),
  testDesk: () => ipcRenderer.invoke('testDesk'),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('saveSettings', patch)
}

contextBridge.exposeInMainWorld('desk', bridge)
