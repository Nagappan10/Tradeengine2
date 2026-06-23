import type { DeskBridge } from '@shared/types'

declare global {
  interface Window {
    desk: DeskBridge
  }
}

export {}
