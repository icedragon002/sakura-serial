import type { SerialApi } from '../../preload/index'

declare global {
  interface Window {
    api: SerialApi
  }
}
