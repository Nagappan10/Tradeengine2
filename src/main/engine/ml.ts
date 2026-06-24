import type { Candle, MlSignal } from '@shared/types'
import { rsi, macd, atr } from '@shared/indicators'

// A disciplined, intentionally-simple secondary signal: logistic regression on
// engineered features, trained chronologically (no leakage), reported against a
// naive baseline, and ALWAYS labelled fragile. It is NOT a price predictor.

interface Sample {
  x: number[]
  y: number // 1 if next-bar return > 0
}

function buildSamples(candles: Candle[]): Sample[] {
  const closes = candles.map((c) => c.close)
  const r = rsi(closes, 14)
  const m = macd(closes)
  const a = atr(candles, 14)
  const samples: Sample[] = []
  for (let i = 30; i < candles.length - 1; i++) {
    const ret1 = closes[i] / closes[i - 1] - 1
    const ret5 = closes[i] / closes[i - 5] - 1
    const rsiV = (r[i] ?? 50) / 100
    const histV = m[i].hist ?? 0
    const vol = (a[i] ?? 0) / closes[i]
    const regime = closes[i] > closes[i - 20] ? 1 : 0
    const x = [1, ret1 * 10, ret5 * 5, rsiV, Math.tanh(histV / closes[i]), vol * 10, regime]
    const y = closes[i + 1] > closes[i] ? 1 : 0
    samples.push({ x, y })
  }
  return samples
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

function trainLogReg(samples: Sample[], dim: number, epochs = 200, lr = 0.1): number[] {
  const w = new Array(dim).fill(0)
  for (let e = 0; e < epochs; e++) {
    for (const s of samples) {
      const z = s.x.reduce((acc, xi, k) => acc + xi * w[k], 0)
      const p = sigmoid(z)
      const err = p - s.y
      for (let k = 0; k < dim; k++) w[k] -= lr * err * s.x[k]
    }
  }
  return w
}

export function mlSignal(candles: Candle[]): MlSignal {
  const FRAGILE = 'Fragile secondary signal — not a price prediction; low weight by design.'
  if (candles.length < 120) {
    return { available: false, probabilityUp: 0.5, baselineAccuracy: 0.5, modelAccuracy: 0.5, note: 'Insufficient history. ' + FRAGILE }
  }
  const samples = buildSamples(candles)
  if (samples.length < 80) {
    return { available: false, probabilityUp: 0.5, baselineAccuracy: 0.5, modelAccuracy: 0.5, note: 'Insufficient samples. ' + FRAGILE }
  }
  const dim = samples[0].x.length
  // Chronological split: 70% train, 30% test. No shuffling -> no leakage.
  const split = Math.floor(samples.length * 0.7)
  const train = samples.slice(0, split)
  const test = samples.slice(split)
  const w = trainLogReg(train, dim)

  // Naive baseline = always predict the majority class of the training window.
  const trainUp = train.filter((s) => s.y === 1).length / train.length
  const baselinePred = trainUp >= 0.5 ? 1 : 0
  let correct = 0
  let baseCorrect = 0
  for (const s of test) {
    const p = sigmoid(s.x.reduce((acc, xi, k) => acc + xi * w[k], 0))
    if ((p >= 0.5 ? 1 : 0) === s.y) correct++
    if (baselinePred === s.y) baseCorrect++
  }
  const modelAcc = correct / test.length
  const baseAcc = baseCorrect / test.length

  const last = samples[samples.length - 1]
  const probUp = sigmoid(last.x.reduce((acc, xi, k) => acc + xi * w[k], 0))

  return {
    available: true,
    probabilityUp: Number(probUp.toFixed(3)),
    baselineAccuracy: Number(baseAcc.toFixed(3)),
    modelAccuracy: Number(modelAcc.toFixed(3)),
    note:
      modelAcc <= baseAcc
        ? `Model does not beat the naive baseline (model ${(modelAcc * 100).toFixed(0)}% vs base ${(baseAcc * 100).toFixed(0)}%). ${FRAGILE}`
        : `Out-of-sample accuracy ${(modelAcc * 100).toFixed(0)}% vs baseline ${(baseAcc * 100).toFixed(0)}%. ${FRAGILE}`
  }
}
