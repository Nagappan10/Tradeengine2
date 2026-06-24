import type { AppSettings, MaskedSettings } from '@shared/types'
import { getSetting, setSetting } from './db'

const DEFAULTS: AppSettings = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  openrouterApiKey: '',
  openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
  deskProvider: 'gemini',
  alpacaKey: '',
  alpacaSecret: '',
  twelveDataKey: '',
  llmAugmentation: false,
  theme: 'dark'
}

export function readSettings(): AppSettings {
  return {
    geminiApiKey: getSetting('geminiApiKey') ?? DEFAULTS.geminiApiKey,
    geminiModel: getSetting('geminiModel') ?? DEFAULTS.geminiModel,
    groqApiKey: getSetting('groqApiKey') ?? DEFAULTS.groqApiKey,
    groqModel: getSetting('groqModel') ?? DEFAULTS.groqModel,
    openrouterApiKey: getSetting('openrouterApiKey') ?? DEFAULTS.openrouterApiKey,
    openrouterModel: getSetting('openrouterModel') ?? DEFAULTS.openrouterModel,
    deskProvider: (getSetting('deskProvider') as AppSettings['deskProvider']) ?? DEFAULTS.deskProvider,
    alpacaKey: getSetting('alpacaKey') ?? DEFAULTS.alpacaKey,
    alpacaSecret: getSetting('alpacaSecret') ?? DEFAULTS.alpacaSecret,
    twelveDataKey: getSetting('twelveDataKey') ?? DEFAULTS.twelveDataKey,
    llmAugmentation: (getSetting('llmAugmentation') ?? 'false') === 'true',
    theme: (getSetting('theme') as 'dark' | 'light') ?? DEFAULTS.theme
  }
}

// Never expose secrets to the renderer — only booleans indicating presence.
export function mask(s: AppSettings): MaskedSettings {
  return {
    geminiModel: s.geminiModel,
    groqModel: s.groqModel,
    openrouterModel: s.openrouterModel,
    deskProvider: s.deskProvider,
    alpacaKey: s.alpacaKey,
    llmAugmentation: s.llmAugmentation,
    theme: s.theme,
    hasGeminiKey: s.geminiApiKey.length > 0,
    hasGroqKey: s.groqApiKey.length > 0,
    hasOpenrouterKey: s.openrouterApiKey.length > 0,
    hasAlpacaKey: s.alpacaKey.length > 0 && s.alpacaSecret.length > 0,
    hasTwelveDataKey: s.twelveDataKey.length > 0
  }
}

export function writeSettings(patch: Partial<AppSettings>): MaskedSettings {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    setSetting(k, typeof v === 'boolean' ? String(v) : String(v))
  }
  return mask(readSettings())
}
