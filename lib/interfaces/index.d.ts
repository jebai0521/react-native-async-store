import { Reactor, RegistryUpdateListener } from "../State";
export interface BaseAsyncImageStoreConfig {
    /**
     * Log events to the console
     *
     * **Default**: `__DEV__`
     */
    debug: boolean;
    /**
     *
     * This value will be used when no `Cache-control: max-age` directive or `Expires` header have been given in the image response.
     * `Infinity` can be used to denote an **immutable**, never-expire image default policy.
     *
     * **Info** `max-age` is a cache control directive specifying the duration, in seconds, during which images are considered fresh.
     *
     * **Default**: `84000` seconds (1 day)
     */
    defaultMaxAge: number;
    /**
     * This value will override any `Cache-control: max-age` directive or `Expires` header in the image response.
     * `Infinity` can be used to denote an **immutable**, never-expire policy.
     *
     * **Info** `max-age` is a cache control directive specifying the duration, in seconds, during which images are considered fresh.
     *
     * **Default**: `undefined` (don't override)
     */
    overrideMaxAge?: number;
    /**
     * When this option is set to `true`, the store will automatically remove stale (expired)
     * images on mount.
     *
     * **Default**: `false`
     */
    autoRemoveStaleImages: boolean;
    /**
     * The maximum number of parallel downloads at a time.
     * This is a balance between operation speed and I/O bottlenecks.
     *
     * **Default**: `10`
     */
    maxParallelDownloads: number;
    /**
     * A `class` which produces `StorageDriverInterface` instances.
     * This driver is used to persist meta-information about updates.
     *
     * **Default**: The default implementation uses `AsyncStorage`
     *
     * @see StorageDriverInterface
     * @see StorageDriverClass
     * @see URICacheRegistry
     *
     */
    StorageDriver: StorageDriverClass<any>;
    /**
     * A `class` which produces `IODriverInterface` instances.
     * This driver is used to fetch, store, delete and check images existence.
     *
     * **Default**: The default implementation uses `RNFetchBlob`
     *
     * @see IODriverInterface
     * @see IODriverClass
     * @see AbstractIODriver
     *
     */
    IODriver: IODriverClass;
}
export interface MandatoryUserAsyncImageStoreConfig {
    /**
     * A `class` which produces `DownloadManagerInterface` instances.
     * This manager is used to download images file.
     */
    DownloadManager: DownloadManagerClass;
    /**
     * A `class` which produces `FileSystemDriverInterface` instances.
     * This driver is used to move images file through URIs.
     */
    FileSystemDriver: FileSystemDriverClass;
}
export declare type UserImageStoreConfig = Partial<AsyncImageStoreConfig> & MandatoryUserAsyncImageStoreConfig;
export interface AsyncImageStoreConfig extends BaseAsyncImageStoreConfig, MandatoryUserAsyncImageStoreConfig {
}
export interface DownloadReport {
    isOK: boolean;
    status: number;
    headers: Headers;
}
export interface DownloadManagerInterface {
    /**
     * Download remote image to local URI.
     *
     * @throws Any exception thrown by this function WILL be cought by the `IODriver`.
     * @param remoteURI The remote image resource locator.
     * @param localURI The target local URI. The URI scheme WILL be `file://`.
     * @param headers A map of headers that MUST be provided with the download request.
     */
    downloadImage(remoteURI: string, localURI: string, headers: Record<string, string>): Promise<DownloadReport>;
}
export declare type DownloadManagerClass = new () => DownloadManagerInterface;
export interface IODriverInterface {
    saveImage({ uri, headers: userHeaders }: ImageSource): Promise<RequestReport>;
    revalidateImage({ uri, headers }: ImageSource, versionTag: URIVersionTag): Promise<RequestReport>;
    imageExists({ uri }: ImageSource): Promise<boolean>;
    deleteImage(src: ImageSource): Promise<void>;
    createBaseDirIfMissing(): Promise<void>;
    deleteBaseDirIfExists(): Promise<void>;
}
export interface StorageDriverInterface {
    load(): Promise<URICacheRegistry | null>;
    save(registry: URICacheRegistry): Promise<void>;
    clear(): Promise<void>;
}
export interface FileSystemDriverInterface {
    nodeExists: (nodeURI: string) => Promise<boolean>;
    delete: (nodeURI: string) => Promise<void>;
    copy: (sourceURI: string, destinationURI: string) => Promise<void>;
    move: (sourceURI: string, destinationURI: string) => Promise<void>;
    makeDirectory: (nodeURI: string) => Promise<void>;
    getBaseDirURI: () => string;
}
export declare type FileSystemDriverClass = new (storeName: string) => FileSystemDriverInterface;
export declare type IODriverClass = new (name: string, config: AsyncImageStoreConfig, fileLocator: FileLocatorInterface) => IODriverInterface;
export declare type StorageDriverClass<C extends StorageDriverInterface = StorageDriverInterface> = new (name: string) => C;
export declare type ProgressCallback = (event: URIEvent, currentIndex: number, total: number) => void;
export interface HTTPHeaders {
    [n: string]: string;
}
export interface ImageSource {
    uri: string;
    headers?: HTTPHeaders;
}
export interface RequestReport {
    uri: string;
    expires: number;
    error: Error | null;
    versionTag: URIVersionTag | null;
    localURI: string;
}
export interface URIVersionTag {
    type: 'ETag' | 'LastModified';
    value: string;
}
export declare type URICommandType = 'PRELOAD' | 'REVALIDATE' | 'DELETE';
export declare type URICacheFileState = 'UNAVAILABLE' | 'FRESH' | 'STALE';
export declare type URICacheSyncState = 'IDLE_SUCCESS' | 'IDLE_ERROR' | 'FETCHING' | 'REFRESHING' | 'DELETED';
export declare type CacheNetworkState = 'AVAILABLE' | 'UNAVAILABLE';
export interface URICacheModel {
    uri: string;
    headers?: {
        [key: string]: string;
    };
    registered: boolean;
    fileExists: boolean;
    expired: boolean;
    fetching: boolean;
    localURI: string;
    versionTag: URIVersionTag | null;
    error: Error | null;
}
export declare type URIEventType = 'NETWORK_UPDATE' | 'URI_UPDATE' | 'URI_INIT';
export declare type URIPatch = Partial<URICacheModel>;
export interface URIEvent {
    type: URIEventType;
    nextModel: URICacheModel;
    nextState: URICacheState;
}
export declare type URIEventListener = (event: URIEvent) => Promise<void> | void;
export interface URICacheState {
    fileState: URICacheFileState;
    syncState: URICacheSyncState;
    networkState: CacheNetworkState;
}
export interface URICacheRegistry {
    [uri: string]: URICacheModel;
}
export interface FileLocatorInterface {
    /**
     * Get root directory from which images will be stored.
     */
    getBaseDirURI(): string;
    /**
     * Get the local URI associated with remote URI.
     * @param uri
     */
    getLocalURIForRemoteURI(remoteURI: string): string;
    /**
     * Get prefix of permanent file URI
     * @param uri
     */
    getFilePrefixURIForRemoteURI(remoteURI: string): string;
    /**
     * Get file name prefix (without extension)
     */
    getFileNamePrefixForURI(remoteURI: string): string;
}
export interface StateInterface extends FileLocatorInterface {
    /**
     *
     * @param uri Initialize the URI model if unregistered.
     */
    initURIModel(uri: string): void;
    /**
     * Add a hook on registry updates.
     *
     * **Info**: updates are debounced every 400ms, and limitted to one running promise per listener.
     *
     * @param listener
     */
    addRegistryUpdateListener(listener: RegistryUpdateListener): void;
    /**
     * Asynchronously update the given URI model.
     *
     * @param uri
     * @param patch
     * @param type
     */
    updateURIModel(uri: string, patch: URIPatch | null): Promise<void>;
    updateNetworkModel(networkAvailable: boolean): Promise<void>;
    /**
     * Register a function which will be called when an event is dispatched to a specific URI.
     *
     * @param commandName
     * @param reactor
     */
    registerCommandReactor<C extends string, P>(commandName: C, reactor: Reactor): void;
    getURIModel(uri: string): URICacheModel;
    /**
     * Asynchronously add a listener and return a promise resolving to the last event associated with the given URI.
     * If no URI has been registered yet, the returned event is of type `URI_INIT`.
     *
     * @param uri
     * @param listener
     * @return A `URIEvent` containing the last state and model associated with this URI.
     */
    addListener(uri: string, listener: URIEventListener): URIEvent;
    /**
     * Remove a listener.
     *
     * @param uri
     * @param listener
     */
    removeListener(uri: string, listener: URIEventListener): void;
    getLastURIEvent(uri: string): URIEvent;
    /**
     * Dispatch a command to be applied to given URI.
     * The returned promise resolves when the command has been applied.
     *
     * @param uri
     * @param commandType
     * @param payload
     */
    dispatchCommand(uri: string, commandType: URICommandType, payload?: any): Promise<URIEvent>;
    /**
     * Dispatch a command to all registered URIs.
     *
     * @param commandType
     * @param payload
     * @param onProgress
     */
    dispatchCommandToAll(commandType: URICommandType, payload?: any, onProgress?: ProgressCallback): Promise<URIEvent[]>;
    /**
     * Dispatch a command to all URIs models satisfying the given predicate.
     * @param commandType
     * @param predicate
     * @param payload
     * @param onProgress
     */
    dispatchCommandWhen(commandType: URICommandType, predicate: (state: URICacheState) => boolean, payload?: any, onProgress?: ProgressCallback): Promise<URIEvent[]>;
    mount(initialRegistry: URICacheRegistry | null): Promise<void>;
    unmount(): Promise<void>;
}
