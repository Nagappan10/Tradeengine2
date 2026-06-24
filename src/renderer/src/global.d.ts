import type { DeskBridge } from '@shared/types'

declare global {
  interface Window {
    desk: DeskBridge
  }
  // Injected at build time by electron.vite.config.ts
  const __APP_BUILD__: string
}

export {}
