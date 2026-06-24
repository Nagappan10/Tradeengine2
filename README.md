# Strategy Desk

An autonomous, **chart-is-hero** desktop trading-research app. The engine is the
researcher: it generates many candidate trade *setups*, backtests them on real
data with no lookahead, keeps only the ones that survive an untouched
out-of-sample holdout, and draws the firing setup directly on the chart — green
support / red resistance zones, a dashed entry line, and green target / red stop
rectangles so the risk:reward reads as two boxes. A Gemini-powered **Desk** then
turns the engine output into a YES / NO / WAIT call you can interrogate in chat.

> **Hypothesis, not a guarantee. Paper-trade before risking capital. Not financial advice.**

## Stack

- **Electron + React + Vite + TypeScript** via `electron-vite`
- **TradingView Lightweight Charts** + a custom SVG overlay (`SetupOverlay`) for setup markup
- **SQLite** (`better-sqlite3`, main process) for cached candles, promoted setups, research runs
- **Gemini** (`@google/generative-ai`) for the conversational Desk
- Secure Electron: `contextIsolation: true`, `nodeIntegration: false`. All
  secrets, network and DB access live in the **main** process; the renderer only
  sees the typed `window.desk.*` bridge. **API keys never reach the renderer.**

## Install & run

```bash
npm install
# Rebuild the native SQLite module against Electron's headers (needed once before first run):
npm run rebuild
# Launch the app in dev:
npm run dev
```

`npm run rebuild` is only required to *run* the Electron app (it relinks
`better-sqlite3` for Electron's Node ABI). It is **not** needed for
`npm run build` or `npm run typecheck`.

### Build & typecheck

```bash
npm run typecheck   # tsc over main/preload + renderer
npm run build       # electron-vite production build
```

### Package a desktop binary

```bash
npm run package     # builds + electron-builder for your current OS
```

Outputs to `release/` (AppImage on Linux, dmg on macOS, nsis on Windows).

#### Windows installer via CI (no local toolchain needed)

A Windows `.exe` installer is built on a real Windows runner by the
**Build Windows installer** GitHub Action (`.github/workflows/release.yml`):

1. Push a tag like `v3.0.0`, or open the repo's **Actions** tab → *Build Windows
   installer* → **Run workflow**.
2. When it finishes, open the run and download the
   **StrategyDesk-Windows-Installer** artifact (a zip containing
   `Strategy Desk Setup <version>.exe`).
3. Unzip and run the installer. (It's unsigned, so Windows SmartScreen may warn —
   choose *More info → Run anyway*.)

## Where keys & data live

- **Keys** (Gemini, optional Alpaca / Twelve Data) are entered in **Settings**
  and stored in the local SQLite DB, read only in the main process. The renderer
  receives a *masked* settings object (booleans for "is a key set"), never the
  secret itself.
- **DB file**: `<userData>/strategy-desk.sqlite` (e.g. `~/.config/Strategy Desk/`
  on Linux, `~/Library/Application Support/Strategy Desk/` on macOS). Holds
  cached candles, promoted setups and research-run provenance.

## How it works

1. **Data layer** — pluggable providers. Binance (crypto, deep intraday) and a
   Yahoo-style fallback (stocks / indices / forex / commodities, mostly daily).
   Symbols auto-resolve to a provider; candles are cached in SQLite and only the
   missing range is fetched. Every series carries `source` + `resolution`, shown
   as a badge on the chart. New symbols default to **Daily** and pull ~2+ years
   of history so setups and the ML model have enough data to validate honestly.
2. **Auto-annotation** — N-bar pivot detection → support/resistance **zones**
   (price bands clustered by proximity, scored by touch count + recency).
3. **Setups** — concrete, testable objects: entry trigger, entry/stop/target
   prices, support & resistance bands, direction, R:R and a short reasoning
   label. A built-in library (support bounce, resistance breakout, breakout
   retest, range reversal, trend-channel pullback) plus an autonomous generator
   that invents variants over zone params, R:R and stop distances.
4. **Backtester** — event-driven, bar-by-bar, **no lookahead** (every decision at
   bar `i` uses only candles `0..i`). Models fees + slippage. Reports in-sample
   and out-of-sample **separately**.
5. **Research loop** — generate → backtest in-sample → validate survivors on the
   untouched out-of-sample holdout → promote only OOS passers. Records how many
   candidates were tested, how many failed in-sample / out-of-sample / had no
   entry trigger, and how many were **flagged overfit and withheld**. When zero
   setups fire, the panel shows these diagnostics so the empty state is explained.
6. **Desk** — pick the provider in Settings: **Gemini** Flash (with Google Search
   grounding) or **Groq** (free, very fast, OpenAI-compatible, no web search).
   First message is the structured
   YES/NO/WAIT verdict (separating historical edge from current read); after that
   it's a chat — ask "why short here?", "what invalidates this?" — with the full
   context (symbol, firing setups + OOS stats, S/R levels, timeframe, ML note)
   carried every turn.
7. **ML secondary signal** — a small logistic-regression on engineered features,
   chronological split (no leakage), reported against a naive baseline and always
   labelled **fragile**, with low weight by design.
8. **Decay tracking** — each promoted setup's rolling/forward win rate is compared
   to its baseline; fading edges are flagged so the Desk stops leaning on them.

## Honesty guardrails (built into the product)

- A hard **out-of-sample holdout** the generator/optimizer never touches.
- Setups are promoted only if they pass **out-of-sample**, not just in-sample.
- The number of candidates tested per run is recorded (multiple-testing is
  visible) and shown in the empty-state diagnostics.
- In-sample-great / out-of-sample-poor setups are auto-flagged **likely overfit**
  and **withheld**, never surfaced as winners.
- Suspiciously high win rates on small samples are treated as possible overfit.
- The standing banner appears on every screen; the Desk repeats the disclaimer.
- The LLM does **not** predict prices — generation is local/deterministic; Gemini
  only narrates the call. Predictions come from backtests.

## Free-data limits

Crypto (Binance) has deep intraday history — strongest results. Equities / forex
/ commodities on free Yahoo are mostly daily or shallow intraday; the app degrades
to daily and says so on the chart badge. Source + resolution are shown everywhere.

## Notes / decisions left to defaults

- Alpaca and Twelve Data adapters are scaffolded via Settings keys but the app
  works keyless on Binance + Yahoo out of the box.
- Gemini model defaults to `gemini-2.5-flash` (configurable in Settings;
  `gemini-2.0-flash` offers higher free-tier throughput if you hit rate limits).
- Walk-forward is approximated by the IS/OOS split + the rolling decay window.
