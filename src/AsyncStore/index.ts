import invariant from 'invariant'
import {
    AsyncStoreConfig,
    Source,
    URIPatch,
    URIEvent,
    HTTPHeaders,
    URICacheState,
    URIEventListener,
    URICommandType,
    StorageDriverInterface,
    ProgressCallback,
    RequestReport,
    UserStoreConfig,
    IODriverInterface
} from '@src/interfaces'
import { State, ProposeFunction } from '@src/State'
import { defaultConfig } from '@src/default-config'
import splitEvery from 'ramda/es/splitEvery'

export type Target = string|Source

const storesMap: Map<string, AsyncStore> = new Map()

function getSourceFromUri(target: Target): Source {
  if (typeof target === 'string') {
    return { uri: target }
  }
  return target
}

function reportToProposal(report: RequestReport): URIPatch {
  const { localFileName, versionTag, expires, metaInfo, error } = report
  return {
    versionTag,
    localFileName,
    metaInfo,
    error,
    expired: expires < new Date().getTime(),
    fetching: false,
    fileExists: error === null
  }
}

/**
 * This method allow config values to be JSON-stringified and persisted.
 * It converts `Infinity` to `Number.MAX_SAFE_INTEGER`.
 * 
 * @param config 
 */
function normalizeUserConf<T extends object>(config: Partial<AsyncStoreConfig<T>>): Partial<AsyncStoreConfig<T>> {
  const newConf = {
    ...config
  }
  if (config.defaultMaxAge === Infinity) {
    newConf.defaultMaxAge = Number.MAX_SAFE_INTEGER
  }
  if (config.overrideMaxAge === Infinity) {
    newConf.overrideMaxAge = Number.MAX_SAFE_INTEGER
  }
  return newConf
}

function wait(duration: number) {
  return new Promise(res => setTimeout(res, duration))
}

export class AsyncStore<T extends object = any> {
  // @ts-ignore
  private iodriver: IODriverInterface
  // @ts-ignore
  private state: State
  private mounted: boolean = false
  private config: AsyncStoreConfig<T>
  // @ts-ignore
  private storage: StorageDriverInterface

  constructor(private name: string, userConfig: Partial<AsyncStoreConfig<T>>) {
    invariant(name !== '', 'AsyncStore: store name cannot be empty.')
    invariant(!storesMap.has(name), 'AsyncStore: only one instance per storeName is allowed.')
    storesMap.set(name, this)
    const config = {
      ...defaultConfig,
      ...normalizeUserConf(userConfig)
    } as AsyncStoreConfig<T>
    this.config = config
    this.onDelete = this.onDelete.bind(this)
    this.onPreload = this.onPreload.bind(this)
    this.onRevalidate = this.onRevalidate.bind(this)
    this.initialize()
  }

  private initialize() {
    this.state = new State(this.config, this.name)
    this.iodriver = new this.config.IODriver(this.name, this.config, this.state)
    this.storage = new this.config.StorageDriver(this.name)
    this.state.registerCommandReactor('PRELOAD', this.onPreload)
    this.state.registerCommandReactor('REVALIDATE', this.onRevalidate)
    this.state.registerCommandReactor('DELETE', this.onDelete)
  }

  private async onPreload(event: URIEvent, propose: ProposeFunction, headers?: HTTPHeaders): Promise<void> {
    const { nextModel: model, nextState: state } = event
    const { uri } = model
    let i = 0
    for (i = 0; i < this.config.maxAttemptsBeforeAbort; i += 1) {
      if (state.fileState === 'FRESH') {
        this.log(`File from origin ${uri} is FRESH; ignoring preloading.`)
        return
      }
      if (state.fileState === 'STALE') {
        return this.onRevalidate(event, propose, headers)
      }
      if (state.networkState === 'UNAVAILABLE') {
        this.log(`File from origin ${uri} cannot be preloaded: network is unavailable.`)
        propose({ error: new Error('Network is unavailable.') })
        return
      }
      const preloadProposal: URIPatch = { fetching: true, registered: true, error: null }
      if (headers) {
        preloadProposal.headers = headers
      }
      propose(preloadProposal)
      const report = await this.iodriver.save(model)
      const proposal = reportToProposal(report)
      propose(proposal)
      this.logReport(report, uri)
      if (!proposal.error) {
        return
      }
      if (i + 1 < this.config.maxAttemptsBeforeAbort) {
        await wait(this.config.sleepBetweenAttempts)
      }
    }
  }

  private async onRevalidate(event: URIEvent, propose: ProposeFunction, headers?: HTTPHeaders): Promise<void> {
    const { nextModel: model, nextState: state } = event
    let revalidate = false
    if (!model.registered) {
      this.log(`File with origin ${model.uri} is unregistered; preload must be invoked first; ignoring revalidation.`)
      return
    }
    const exists = await this.iodriver.exists(model)
    if (exists === false) {
      propose({ fileExists: false })
      if (state.networkState === 'AVAILABLE') {
        this.log(`File from origin ${model.uri} does not exists anymore. Revalidating...`)
        revalidate = true
      } else {
        this.log(`File from origin ${model.uri} does not exists anymore but network is unavailable. ignoring revalidation.`)
      }
    } else {
      // if (state.fileState === 'FRESH') {
      //   this.log(`File from origin ${model.uri} is FRESH and file exists, revalidation succeeded.`)
      // }
      if (state.fileState === 'STALE' && state.networkState === 'UNAVAILABLE') {
        this.log(`File from origin ${model.uri} is STALE and file exists, but network is not available; ignoring revalidation.`)
      }

      if (state.networkState === 'UNAVAILABLE') {
        this.log(`File from origin ${model.uri} is ${state.fileState} and file exists, try revalidation.`)
        revalidate = true;
      }
    }
    revalidate = revalidate && (state.fileState === 'UNAVAILABLE' || state.fileState === 'STALE')
    if (true) {
      const preloadProposal: URIPatch = { fetching: true, error: null }
      if (headers) {
        preloadProposal.headers = headers
      }
      propose(preloadProposal)
      const report = model.versionTag && exists ?
        await this.iodriver.revalidate(model, model.versionTag) :
        await this.iodriver.save(model)
      propose(reportToProposal(report))
      this.logReport(report, model.uri)
    }
  }

  private async onDelete(event: URIEvent, propose: ProposeFunction) {
    await this.iodriver.delete(event.nextModel)
    propose(null)
  }

  private logReport(report: RequestReport, uri: string) {
    if (report.error) {
      this.log(`File download from origin ${uri} failed.\n${report.error.message}`)
    } else {
      this.log(`File download from origin ${uri} succeeded.`)
    }
  }

  private log(info: string) {
    if (this.config.debug) {
      console.log(`AsyncStore ${this.name}: ${info}`)
    }
  }

  private async dispatchCommandToURI<P>(uri: string, name: URICommandType, payload?: any) {
    return this.state.dispatchCommand(uri, name, payload)
  }

  private async dispatchCommandToAll<P>(name: URICommandType, onProgress?: ProgressCallback) {
    return this.state.dispatchCommandToAll(name, null, onProgress)
  }

  private async dispatchCommandWhen<P>(name: URICommandType, when: (state: URICacheState) => boolean, onProgress?: ProgressCallback) {
    return this.state.dispatchCommandWhen(name, when, null, onProgress)
  }

  private assertMountInvariant() {
    invariant(this.mounted, `${this.constructor.name} actions must be invoked after mounting occurs, but Store \`${this.name}' is unmounted.`)
  }

  protected getLocalURIFromLocalFileName(localFileName: string): string {
    return this.state.getLocalURIFromLocalFilename(localFileName)
  }

  protected getLocalURIForRemoteURI(remoteURI: string): string {
    return this.state.getLocalURIForRemoteURI(remoteURI)
  }

  protected isRegistered(remoteURI: string): boolean {
    return this.state.isRegistry(remoteURI)
  }

  /**
   * **Asynchronously** mount the Store, restoring cache metadata from storage.
   * 
   * **Suggestion**: Mount this Store during your application initialization, ideally in the root component, where you can display a splashscreen or an activity indicator while
   * it happens. Good hook candidates are `componentWillMount` and `componentDidMount`, **which you can declare `async`**.
   */
  public async mount(): Promise<void> {
    const registry = await this.storage.load()
    await this.state.mount(registry)
    this.state.addRegistryUpdateListener(this.storage.save.bind(this.storage))
    if (this.config.autoRemoveStales) {
      await this.deleteAllStaleItems()
    }
    this.mounted = true
  }

  /**
   * **Asynchronously** release the Store from memory and persists its state.
   * 
   * **Suggestion**: Unmount the Store in your root component, in `componentWillUnmount` method, **which you can declare `async`**.
   * 
   * **Info**: Carefully consuming lifecycle methods is mandatory to prevent memory leaks. Note that **cache metadata is persisted on change**.
   */
  public async unmount(): Promise<void> {
    if (this.mounted) {
      this.mounted = false
      await this.state.unmount()
    }
  }

    /**
     * Inform if Store is mounted
     */
  public isMounted(): boolean {
    return this.mounted
  }

    /**
     * Add a listener which gets called every time the cache model associated with the given
     * uri resource change.
     * 
     * @param uri 
     * @param listener 
     * @return The most-recent `URIEvent` associated with the given URI.
     * If this URI has not been registered yet, the return event will be of type `URI_INIT`.
     */
  public addCacheUpdateListener(uri: string, listener: URIEventListener): URIEvent {
    this.assertMountInvariant()
    return this.state.addListener(uri, listener)
  }

    /**
     * Remove a previously registered listener.
     * 
     * @param uri
     * @param listener 
     */
  public removeCacheUpdateListener(uri: string, listener: URIEventListener) {
    this.state.removeListener(uri, listener)
  }

    /**
     * **Asynchronously**  preload the provided resource to Store.
     * 
     * **Info** This function will revalidate an resource which has already been preloaded, and download unconditionnaly otherwise.
     * 
     * @param target string URI or React `URISource` prop
     * @return A Promise resolving to the next `URIEvent`
     */
  public async preloadItem(target: Target): Promise<URIEvent> {
    this.assertMountInvariant()
    const source = getSourceFromUri(target)
    await this.iodriver.createBaseDirIfMissing()
    return this.dispatchCommandToURI(source.uri, 'PRELOAD', source.headers)
  }

    /**
     * **Asynchronously** and in parallel: preload the list of resources to Store.
     * 
     * **Info** This function will revalidate resources which are already preloaded, and download the others.
     * 
     * @param targets an array of string URI or React `URISource` prop
     * @param onProgress a callback to be invoked after each preloading
     * @return A Promise resolving to an array of `URIEvent`
     */
  public async preloadItems(targets: Target[], onProgress?: ProgressCallback): Promise<URIEvent[]> {
    this.assertMountInvariant()
    const events: URIEvent[] = []
    let i = 0
    await this.iodriver.createBaseDirIfMissing()
    const tasks = targets.map(target => async () => {
      const event = await this.preloadItem(target)
      event && events.push(event)
      onProgress && onProgress(event, i, targets.length)
      i += 1
    })
    const bundlesOfTasks = splitEvery(this.config.maxParallelDownloads, tasks)
    for (const bundle of bundlesOfTasks) {
      await Promise.all(bundle.map(f => f()))
    }
    return events
  }

    /**
     * **Asynchronously** delete an existing resource from the Store.
     * Does nothing if the provided URI have no matching entry in Store.
     * 
     * @param target 
     */
  public async deleteItem(target: Target): Promise<URIEvent> {
    this.assertMountInvariant()
    const source = getSourceFromUri(target)
    return this.dispatchCommandToURI(source.uri, 'DELETE')
  }

    /**
     * **Asynchronously** delete all resources from the Store.
     * 
     * @param onProgress a callback to be invoked after each deletion
     */
  public async deleteAllItems(onProgress?: ProgressCallback): Promise<URIEvent[]> {
    this.assertMountInvariant()
    return this.dispatchCommandToAll('DELETE', onProgress)
  }

    /**
     * **Asynchronously** delete all resource which are stale from the Store.
     * 
     * @param onProgress a callback to be invoked after each deletion
     */
  public async deleteAllStaleItems(onProgress?: ProgressCallback): Promise<URIEvent[]> {
    this.assertMountInvariant()
    return this.dispatchCommandWhen('DELETE', (s => s.fileState === 'STALE'), onProgress)
  }

    /**
     * **Asynchronously** revalidate a stored resource *if it was previously registered*.
     * 
     * **Info**: Revalidation is done with:
     * 
     * - file existence checking;
     * - conditionnal HTTP requests, with `If-None-Match` or `If-Modified-Since` headers.
     * 
     * **Warning** This method does nothing on a resource which has not been registered,
     * i.e. to which `preload` has not been called at least once.
     * 
     * @param target string URI or React `URISource` prop
     * @return A Promise resolving to the next `URIEvent`
     */
  public async revalidateItem(target: Target): Promise<URIEvent> {
    this.assertMountInvariant()
    await this.iodriver.createBaseDirIfMissing()
    const source = getSourceFromUri(target)
    return this.dispatchCommandToURI(source.uri, 'REVALIDATE', source.headers)
  }

    /**
     * **Asynchronously** revalidate all resources *which were previously registered*.
     * 
     * **Info**: Revalidation is done with:
     * 
     * - file existence checking;
     * - conditionnal HTTP requests, with `If-None-Match` or `If-Modified-Since` headers.
     * 
     * **Warning** This method does nothing on a resource which has not been registered,
     * i.e. to which `preload` has not been called at least once.
     * 
     * @param onProgress a callback to be invoked after each revalidation
     * @return A Promise resolving to a list of `URIEvent` related to each revalidation.
     */
  public async revalidateAllItems(onProgress?: ProgressCallback): Promise<URIEvent[]> {
    this.assertMountInvariant()
    await this.iodriver.createBaseDirIfMissing()
    return this.dispatchCommandToAll('REVALIDATE', onProgress)
  }

    /**
     * **Asynchronously** revalidate all stale resources in the store.
     *
     * **Info**: Revalidation is done with:
     * 
     * - file existence checking;
     * - conditionnal HTTP requests, with `If-None-Match` or `If-Modified-Since` headers.
     * 
     * @param onProgress a callback to be invoked after each revalidation
     * @return A Promise resolving to a list of `URIEvent` related to each revalidation.
     */
  public async revalidateAllStaleItems(onProgress?: ProgressCallback): Promise<URIEvent[]> {
    this.assertMountInvariant()
    await this.iodriver.createBaseDirIfMissing()
    return this.dispatchCommandWhen('REVALIDATE', (s => s.fileState === 'STALE'), onProgress)
  }

  /**
   * **Asynchronously** clear and **unmount** the store. This method:
   * 
   * - unmount the store
   * - clear metadata from storage
   * - delete store root folder from filesystem
   * 
   * **Warning**: This method will wipe out all resources registered with this library.
   * @throws If the cache root could not be deleted
   * 
   */
  public async clear(): Promise<void> {
    if (this.mounted) {
      await this.unmount()
    }
    await this.storage.clear()
    await this.iodriver.deleteBaseDirIfExists()
    this.initialize()
  }

  /**
   * Get metainfo for given target.
   * 
   * **Prerequisites**: You must have provided a {@link BaseAsyncStoreConfig.metaInfoFetcher}.
   * 
   * @param target 
   */
  public getMetaInfo(target: Target): T|null {
    return this.state.getMetaInfo(typeof target === 'string' ? target : target.uri)
  }
}

/**
 * Get store by name, if exists.
 * 
 * @param name 
 */
export function getStoreByName(name: string): AsyncStore|null {
  return storesMap.get(name) || null
}

/**
 * Create a store from a unique name, which will be used as directory.
 * 
 * **Warning**: Can be called once only. Use `getStoreByName` instead if you're looking for an instance.
 * 
 * @param name The unique name.
 * @param userConfig See config structure in the type definition of `UserStoreConfig`
 * @see AsyncStoreConfig
 * @see getStoreByName
 */
export function createStore<T extends object = {}>(name: string, userConfig: UserStoreConfig<T>) {
  return new AsyncStore(name, userConfig)
}
