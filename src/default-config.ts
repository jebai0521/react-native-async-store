import { IODriver } from './drivers/IODriver'
import { BaseAsyncStoreConfig } from './interfaces'

export const defaultConfig: BaseAsyncStoreConfig<{}> = {
  IODriver,
  debug: __DEV__,
  defaultMaxAge: 86000,
  autoRemoveStaleImages: false,
  maxParallelDownloads: 10,
  maxAttemptsBeforeAbort: 3,
  sleepBetweenAttempts: 400,
  imageMetaInfoFetcher: () => ({})
}
