import { URICacheModel, URIEvent, URICommandType, URICacheFileState, URICacheSyncState, URICacheState, URIEventListener, URIPatch } from './types';
export declare type ProposeFunction = (patch: Partial<URICacheModel>) => void;
export declare type Reactor = (event: URIEvent, propose: ProposeFunction, payload?: any) => Promise<void>;
export interface URICacheRegistry {
    [uri: string]: URICacheModel;
}
export interface CacheStore {
    networkAvailable: boolean;
    uriStates: URICacheRegistry;
}
export declare function deriveFileStateFromModel(model: URICacheModel): URICacheFileState;
export declare function deriveSyncStateFromModel(model: URICacheModel): URICacheSyncState;
export declare function getURIStateFromModel(model: URICacheModel, networkAvailable: boolean): URICacheState;
export declare function getInitialURICacheModel(uri: string): URICacheModel;
export declare class State {
    private reactors;
    private listeners;
    private lastEvents;
    private cacheStore;
    constructor();
    private getListenersForURI;
    private notifyURIListeners;
    private getURILens;
    /**
     *
     * @param uri Initialize the URI model if unregistered.
     */
    initURIModel(uri: string): void;
    /**
     * Asynchronously update the given URI model.
     *
     * @param uri
     * @param patch
     * @param type
     */
    updateURIModel(uri: string, patch: URIPatch): Promise<void>;
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
     * @param payload?
     */
    dispatchCommandToAll(commandType: URICommandType, payload?: any): Promise<URIEvent[]>;
    /**
     * Dispatch a command to all URIs models satisfying the given predicate.
     * @param commandType
     * @param predicate
     */
    dispatchCommandWhen(commandType: URICommandType, predicate: (state: URICacheState) => boolean, payload?: any): Promise<URIEvent[]>;
    mount(): Promise<void>;
    unmount(): Promise<void>;
}
