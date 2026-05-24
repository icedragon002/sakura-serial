import type { DeviceApi } from '../../preload/index'

declare global {
  interface Window {
    deviceApi: DeviceApi
  }
}
