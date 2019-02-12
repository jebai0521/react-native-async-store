export interface AsyncImageStoreConfig {
  /**
   * Log events to the console
   * 
   * **Default**: `__DEV__`
   */
  debug?: boolean,
  /**
   * 
   * This value will be used when no `Cache-control: max-age` directive or `Expires` header have been given in the image response.
   * `Infinity` can be used to denote an **immutable**, never-expire image default policy.
   * 
   * **Info** `max-age` is a cache control directive specifying the duration, in seconds, during which images are considered fresh.
   * 
   * **Default**: `84000` seconds (1 day)
   */
  defaultMaxAge?: number
  /**
   * This value will override any `Cache-control: max-age` directive or `Expires` header in the image response.
   * `Infinity` can be used to denote an **immutable**, never-expire policy.
   *
   * **Info** `max-age` is a cache control directive specifying the duration, in seconds, during which images are considered fresh.
   * 
   * **Default**: `undefined` (don't override)
   */
  overrideMaxAge?: number
  /**
   * When this option is set to `true`, the store will automatically remove stale (expired)
   * images on mount.
   * 
   * **Default**: `false`
   */
  autoRemoveStaleImages?: boolean
  /**
   * Which kind of file-system should be used.
   * 
   * Files stored while `fsKind` is set to `PERMANENT` will never be (intentionnaly) altered
   * by the operating system, while `CACHE` option offers no such guarantee thus limitating your application storage footprint.
   * 
   * **Implementation note**: See [`RNFetchBlob.fs.dirs.DocumentDir` and `RNFetchBlob.fs.dirs.CacheDir`](https://github.com/joltup/rn-fetch-blob/wiki/File-System-Access-API#dirs)
   * 
   * **Default**: `PERMANENT`
   */
  fsKind?: 'CACHE' | 'PERMANENT'
  /**
   * The maximum number of I/O operations per second handled by one Store at a time.
   * This is a balance between operation speed and JS thread obstruction.
   * 
   * **Default**: `10`
   */
  ioThrottleFrequency?: number
  /**
   * A `class` which produces `StorageInterface` instances.
   * This class is used to instanciate a storage instance which get called to persist meta-info updates.
   * 
   * **Default**: The default implementation uses `AsyncStorage`
   * 
   * @see StorageInstance
   * @see StorageConstructor
   * @see URICacheRegistry
   * 
   */
  Storage?: StorageConstructor<any>
}

export interface StorageInstance {
  load(): Promise<URICacheRegistry|null>
  save(registry: URICacheRegistry): Promise<void>
  clear(): Promise<void>
}

export type StorageConstructor<C extends StorageInstance = StorageInstance> = new(name: string) => C

export interface HTTPHeaders {
  [n: string]: string
}

export interface ImageSource {
  uri: string,
  headers?: HTTPHeaders
}

export interface URIVersionTag {
  type: 'ETag' | 'LastModified'
  value: string
}

export type URICommandType = 'PRELOAD' | 'REVALIDATE' | 'DELETE'

export type URICacheFileState = 'UNAVAILABLE' | 'FRESH' | 'STALE'

export type URICacheSyncState = 'IDLE_SUCCESS' | 'IDLE_ERROR' | 'FETCHING' | 'REFRESHING' | 'DELETED'

export type CacheNetworkState = 'AVAILABLE' | 'UNAVAILABLE'

export interface URICacheModel {
  uri: string
  headers?: {[key: string]: string}
  registered: boolean
  fileExists: boolean
  expired: boolean
  fetching: boolean
  path: string
  localURI: string
  versionTag: URIVersionTag|null
  error: Error|null
}

export type URIEventType = 'NETWORK_UPDATE' | 'URI_UPDATE' | 'URI_INIT'

export type URIPatch = Partial<URICacheModel>

export interface URIEvent {
  type: URIEventType
  nextModel: URICacheModel
  nextState: URICacheState
}

export type URIEventListener = (event: URIEvent) => Promise<void>|void

export interface URICacheState {
  fileState: URICacheFileState
  syncState: URICacheSyncState
  networkState: CacheNetworkState
}

export interface URICacheRegistry {
  [uri: string]: URICacheModel
}
