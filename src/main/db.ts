import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { Candle, Interval, PromotedSetup, ResearchRun } from '@shared/types'

let db: Database.Database

export function initDb(): Database.Database {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'strategy-desk.sqlite')
  db = new Database(file)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS candles (
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      time INTEGER NOT NULL,
      open REAL, high REAL, low REAL, close REAL, volume REAL,
      source TEXT,
      PRIMARY KEY (symbol, interval, time)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS promoted (
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      setup_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      promoted_at INTEGER,
      PRIMARY KEY (symbol, interval, setup_id)
    );
    CREATE TABLE IF NOT EXISTS research_runs (
      id TEXT PRIMARY KEY,
      symbol TEXT, interval TEXT, started_at INTEGER, payload TEXT
    );
  `)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

// ---- candle cache ----

export function readCandles(symbol: string, interval: Interval): Candle[] {
  const rows = getDb()
    .prepare('SELECT time, open, high, low, close, volume FROM candles WHERE symbol=? AND interval=? ORDER BY time ASC')
    .all(symbol, interval) as Candle[]
  return rows
}

export function writeCandles(symbol: string, interval: Interval, source: string, candles: Candle[]): void {
  const stmt = getDb().prepare(
    'INSERT OR REPLACE INTO candles (symbol, interval, time, open, high, low, close, volume, source) VALUES (?,?,?,?,?,?,?,?,?)'
  )
  const tx = getDb().transaction((rows: Candle[]) => {
    for (const c of rows) stmt.run(symbol, interval, c.time, c.open, c.high, c.low, c.close, c.volume, source)
  })
  tx(candles)
}

export function candleRange(symbol: string, interval: Interval): { min: number; max: number } | null {
  const row = getDb()
    .prepare('SELECT MIN(time) as min, MAX(time) as max FROM candles WHERE symbol=? AND interval=?')
    .get(symbol, interval) as { min: number | null; max: number | null }
  if (row.min === null || row.max === null) return null
  return { min: row.min, max: row.max }
}

// ---- settings ----

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined
  return row ? row.value : null
}

export function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

// ---- promoted setups ----

export function savePromoted(symbol: string, interval: Interval, list: PromotedSetup[]): void {
  const del = getDb().prepare('DELETE FROM promoted WHERE symbol=? AND interval=?')
  const ins = getDb().prepare(
    'INSERT OR REPLACE INTO promoted (symbol, interval, setup_id, payload, promoted_at) VALUES (?,?,?,?,?)'
  )
  const tx = getDb().transaction(() => {
    del.run(symbol, interval)
    for (const p of list) ins.run(symbol, interval, p.setup.id, JSON.stringify(p), p.promotedAt)
  })
  tx()
}

export function loadPromoted(symbol: string, interval: Interval): PromotedSetup[] {
  const rows = getDb()
    .prepare('SELECT payload FROM promoted WHERE symbol=? AND interval=? ORDER BY promoted_at DESC')
    .all(symbol, interval) as { payload: string }[]
  return rows.map((r) => JSON.parse(r.payload) as PromotedSetup)
}

export function loadAllPromoted(): PromotedSetup[] {
  const rows = getDb().prepare('SELECT payload FROM promoted ORDER BY promoted_at DESC').all() as { payload: string }[]
  return rows.map((r) => JSON.parse(r.payload) as PromotedSetup)
}

export function saveResearchRun(run: ResearchRun): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO research_runs (id, symbol, interval, started_at, payload) VALUES (?,?,?,?,?)')
    .run(run.id, run.symbol, run.interval, run.startedAt, JSON.stringify(run))
}
