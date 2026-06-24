import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { initDb } from './db'
import { registerIpc } from './ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#14130F',
    autoHideMenuBar: true,
    title: 'Strategy Desk',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  initDb()
  registerIpc()

  // Headless self-test: boot the engine against real data and exit. Used by CI /
  // `npm run smoke` to verify DB + data layer + setup engine without a display.
  if (process.env['STRATEGY_DESK_SMOKE']) {
    try {
      // Offline engine check on a synthetic series (no network needed).
      if (process.env['STRATEGY_DESK_SMOKE'] === 'SYNTH') {
        const { detectSwings } = await import('./engine/swings')
        const { detectZones } = await import('./engine/zones')
        const { runResearch, firingFromPromoted } = await import('./engine/research')
        const { mlSignal } = await import('./engine/ml')
        const candles = []
        const start = Math.floor(Date.now() / 1000) - 600 * 86400
        let prev = 100
        for (let i = 0; i < 600; i++) {
          // Ranging market that repeatedly tests ~85 support and ~115 resistance,
          // so zones accumulate touches and bounce/reversal setups can trigger.
          const center = 100 + Math.sin(i / 30) * 15
          const open = prev
          const close = center + (Math.random() - 0.5) * 6
          const high = Math.max(open, close) + Math.random() * 3
          const low = Math.min(open, close) - Math.random() * 3
          prev = close
          candles.push({ time: start + i * 86400, open, high, low, close, volume: 1000 + Math.random() * 500 })
        }
        const swings = detectSwings(candles, 3, 3)
        const zones = detectZones(candles, swings)
        const run = runResearch(candles, 'SYNTH', '1d')
        const firing = firingFromPromoted(run.promoted, candles, 'SYNTH', '1d')
        const ml = mlSignal(candles)
        // eslint-disable-next-line no-console
        console.log(
          `SMOKE OK (synthetic) bars=${candles.length} swings=${swings.length} zones=${zones.length} ` +
            `tested=${run.diagnostics.candidatesTested} promoted=${run.diagnostics.promoted} ` +
            `overfitWithheld=${run.diagnostics.flaggedOverfit} failedOOS=${run.diagnostics.failedOutOfSample} ` +
            `firing=${firing.length} mlAvailable=${ml.available} mlAcc=${ml.modelAccuracy} base=${ml.baselineAccuracy}`
        )
        app.exit(0)
        return
      }
      const { analyzeSymbol } = await import('./engine/analyze')
      const a = await analyzeSymbol(process.env['STRATEGY_DESK_SMOKE'] || 'BTCUSDT', '1d')
      // eslint-disable-next-line no-console
      console.log(
        `SMOKE OK source=${a.meta.source} res=${a.meta.resolution} bars=${a.candles.length} ` +
          `zones=${a.zones.length} firing=${a.firingSetups.length} tested=${a.diagnostics.candidatesTested} ` +
          `promoted=${a.diagnostics.promoted} overfitWithheld=${a.diagnostics.flaggedOverfit} ml=${a.ml.available}`
      )
      app.exit(0)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('SMOKE FAIL', (err as Error).message)
      app.exit(1)
    }
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
