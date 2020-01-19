import { createStore } from "react-native-async-store"
import { ExpoDownloadManager } from "./ExpoDownloadManager"
import { FileSystemDriver } from "./FileSystemDriver"
import { AsyncStorageDriver } from "./AsyncStorageDriver"

export const asyncStore = createStore('GoldenProject', {
    StorageDriver: AsyncStorageDriver,
    DownloadManager: ExpoDownloadManager,
    FileSystemDriver: FileSystemDriver,
    overrideMaxAge: Infinity,
    maxAttemptsBeforeAbort: 5,
    sleepBetweenAttempts: 800
  })