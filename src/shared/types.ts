// Shared types used across main, preload and renderer.
// Keep this file free of any Node/Electron imports so it can be bundled in the renderer.

export type AssetClass = 'crypto' | 'stock' | 'forex' | 'commodity' | 'index'

export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w'

export interface Candle {
  time: number // unix seconds (UTC)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Quote {
  symbol: string
  price: number
  time: number
}

export interface SeriesMeta {
  symbol: string
  interval: Interval
  source: string // provider id, e.g. "binance"
  resolution: Interval // actual resolution served (may be degraded vs requested)
  degraded: boolean // true if we fell back to a coarser resolution than requested
}

export interface CandleSeries {
  meta: SeriesMeta
  candles: Candle[]
}

// ---------- Auto-annotation: zones & swings ----------

export interface Swing {
  time: number
  price: number
  kind: 'high' | 'low'
}

export interface Zone {
  // A support/resistance price band (low..high), not a single line.
  id: string
  kind: 'support' | 'resistance'
  low: number
  high: number
  touches: number
  recencyBars: number // bars since last touch (smaller = fresher)
  strength: number // 0..1 score
}

// ---------- Setups: concrete, testable trade objects ----------

export type EntryTrigger =
  | 'support_bounce'
  | 'resistance_breakout'
  | 'breakout_retest'
  | 'range_reversal'
  | 'channel_pullback'
  | 'reversal_candle_at_zone'

export type Direction = 'long' | 'short'

export interface Setup {
  id: string
  name: string
  source: 'library' | 'generator' | 'llm'
  symbol: string
  interval: Interval
  direction: Direction
  trigger: EntryTrigger
  reasoning: string // short human label, e.g. "breakout retest", "bear-trap reversal"

  supportZone: { low: number; high: number; touches: number; strength: number }
  resistanceZone: { low: number; high: number; touches: number; strength: number }

  entryPrice: number
  stopPrice: number
  targetPrice: number
  riskReward: number

  // generator parameters used to build this variant (for provenance/uniqueness)
  params: Record<string, number>

  firing: boolean // is the trigger active on the most recent bar?
}

// ---------- Backtesting ----------

export interface Trade {
  entryTime: number
  exitTime: number
  direction: Direction
  entryPrice: number
  exitPrice: number
  returnPct: number
  bars: number
  exitReason: 'target' | 'stop' | 'signal' | 'eod'
}

export interface Metrics {
  trades: number
  winRate: number
  profitFactor: number
  avgReturnPct: number
  avgWinPct: number
  avgLossPct: number
  totalReturnPct: number
  cagr: number
  maxDrawdownPct: number
  sharpe: number
  sortino: number
  avgRiskReward: number
  exposure: number
}

export interface BacktestResult {
  inSample: Metrics
  outOfSample: Metrics
  trades: Trade[] // out-of-sample trades for chart display
  equityCurve: { time: number; equity: number }[]
  fees: number
  slippage: number
  splitTime: number // boundary time between IS and OOS
}

export interface SetupStats {
  setupId: string
  winRate: number // out-of-sample
  sampleSize: number // out-of-sample trades
  avgRiskReward: number
  profitFactor: number
  inSampleWinRate: number
  outOfSampleWinRate: number
  inSampleReturnPct: number
  outOfSampleReturnPct: number
  overfit: boolean
  overfitReason?: string
}

export interface PromotedSetup {
  setup: Setup
  stats: SetupStats
  promotedAt: number
}

// ---------- Research run provenance ----------

export interface ResearchDiagnostics {
  candidatesTested: number
  failedInSample: number
  failedOutOfSample: number
  failedNoEntryTrigger: number
  flaggedOverfit: number
  promoted: number
}

export interface ResearchRun {
  id: string
  symbol: string
  interval: Interval
  startedAt: number
  finishedAt: number
  diagnostics: ResearchDiagnostics
  promoted: PromotedSetup[]
}

// ---------- ML secondary signal ----------

export interface MlSignal {
  available: boolean
  probabilityUp: number // 0..1
  baselineAccuracy: number
  modelAccuracy: number // out-of-sample
  note: string // always carries the "fragile" caveat
}

// ---------- Decay tracking ----------

export interface DecayStatus {
  setupId: string
  setupName: string
  rollingWinRate: number
  baselineWinRate: number
  decaying: boolean
  note: string
}

// ---------- Desk chat ----------

export interface DeskVerdict {
  verdict: 'YES' | 'NO' | 'WAIT'
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  headline: string
  firingStrategies: string
  currentRead: string
  keyLevels: { support: string; resistance: string; invalidation: string }
  mlNote: string
  risk: string
}

export interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

export interface DeskContext {
  symbol: string
  interval: Interval
  firingSetups: { setup: Setup; stats: SetupStats }[]
  zones: Zone[]
  ml: MlSignal
  source: string
  resolution: Interval
}

// ---------- Settings ----------

export interface AppSettings {
  geminiApiKey: string // masked when returned to renderer
  geminiModel: string
  groqApiKey: string
  groqModel: string
  openrouterApiKey: string
  openrouterModel: string
  deskProvider: 'gemini' | 'groq' | 'openrouter'
  alpacaKey: string
  alpacaSecret: string
  twelveDataKey: string
  llmAugmentation: boolean
  theme: 'dark' | 'light'
}

export type MaskedSettings = Omit<
  AppSettings,
  'geminiApiKey' | 'groqApiKey' | 'openrouterApiKey' | 'alpacaSecret' | 'twelveDataKey'
> & {
  hasGeminiKey: boolean
  hasGroqKey: boolean
  hasOpenrouterKey: boolean
  hasAlpacaKey: boolean
  hasTwelveDataKey: boolean
}

// ---------- Aggregate analysis returned to the renderer ----------

export interface SymbolAnalysis {
  meta: SeriesMeta
  candles: Candle[]
  zones: Zone[]
  swings: Swing[]
  firingSetups: { setup: Setup; stats: SetupStats }[]
  promotedSetups: { setup: Setup; stats: SetupStats }[]
  diagnostics: ResearchDiagnostics
  ml: MlSignal
  decay: DecayStatus[]
}

// ---------- The bridge surface exposed on window.desk ----------

export interface DeskBridge {
  searchSymbols(query: string): Promise<{ symbol: string; name: string; assetClass: AssetClass; source: string }[]>
  getCandles(symbol: string, interval: Interval): Promise<CandleSeries>
  getQuote(symbol: string): Promise<Quote>
  subscribeStream(symbol: string, interval: Interval): Promise<boolean>
  unsubscribeStream(): Promise<void>
  onStreamCandle(cb: (candle: Candle, closed: boolean) => void): () => void
  analyze(symbol: string, interval: Interval): Promise<SymbolAnalysis>
  runResearch(symbol: string, interval: Interval): Promise<ResearchRun>
  getPromoted(): Promise<PromotedSetup[]>
  deskVerdict(ctx: DeskContext): Promise<DeskVerdict>
  deskChat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string>
  testDesk(): Promise<{ ok: boolean; message: string }>
  getSettings(): Promise<MaskedSettings>
  saveSettings(patch: Partial<AppSettings>): Promise<MaskedSettings>
}
