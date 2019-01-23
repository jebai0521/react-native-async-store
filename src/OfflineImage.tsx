import React, { ComponentType, PureComponent, Component } from 'react'
import { ImageProps, Image, ImageRequireSource, ActivityIndicator, ImageSourcePropType } from 'react-native'
import invariant from 'invariant'
import { AsyncImageStore, getStoreByName, URIEvent, ImageSource, URICacheFileState, URICacheSyncState } from './AsyncImageStore'

export interface MinimalImageComponentProps {
  source: ImageSourcePropType
}

export type OfflineImageProps<C extends MinimalImageComponentProps = ImageProps> = {
    /**
     * Remote source to be cached locally.
     * Headers are passed for request creation.
     */
  source: ImageSource
    /**
     * The name of the Store this component will be bound to.
     * 
     * **Warning**: This value will be read at construction-time and cannot be modified dynamically.
     * An invariant violation will be thrown on such attempt.
     */
  storeName: string
    /**
     * React Component (class or SFC) to render image.
     * Remaining props will be passed to this component instance.
     * 
     * **Default**: `Image`.
     */
  ImageComponent?: ComponentType<C>
    /**
     * React Component (class or SFC) displayed while image is being fetched on network.
     * By default, `fallbackStaticSource` will be displayed during network requests, if provided.
     * 
     * **Note**: Image props will be passed to this component instance.
     * 
     * **Default**: `ActivityIndicator` or `ImageComponent` with `fallbackStaticSource` if present
     */
  LoadingIndicatorComponent?: ComponentType<C>
    /**
     * The fallback image location.
     * Must be a local require to be accessed offline.
     */
  fallbackStaticSource?: ImageRequireSource
} & C

interface State {
  localURI: string
  version: string
  fileState: URICacheFileState
  syncState: URICacheSyncState
  networkAvailable: boolean
}

export class OfflineImage<C extends MinimalImageComponentProps = ImageProps> extends PureComponent<OfflineImageProps<C>, State> {

  private store: AsyncImageStore
  private ref?: Component<C>

  constructor(props: OfflineImageProps<C>) {
    super(props)
    const store = getStoreByName(props.storeName)
    invariant(store !== null, `OfflineImage: no store named ${props.storeName} could be found.`)
    invariant(props.source && props.source.uri !== null, 'OfflineImage: the source prop must contain a `uri` field.')
    this.store = store as AsyncImageStore
    this.state = {
      fileState: 'UNAVAILABLE',
      syncState: 'IDLE_SUCCESS',
      networkAvailable: false,
      version: '',
      localURI: ''
    }
  }

  private onRef = (ref: Component<C>) => {
    this.ref = ref
  }

  private onCacheEvent = async ({ nextState, nextModel }: URIEvent) => {
    this.setState({
      fileState: nextState.fileState,
      syncState: nextState.syncState,
      networkAvailable: nextState.networkState === 'AVAILABLE',
      version: nextModel.versionTag && nextModel.versionTag.value || this.state.version,
      localURI: nextModel.localURI
    })
    if (nextState.fileState === 'UNAVAILABLE' && nextState.networkState === 'AVAILABLE' && nextState.syncState !== 'IDLE_ERROR') {
      await this.store.preloadImage(this.props.source)
    }
    if (nextState.fileState === 'STALE' && nextState.networkState === 'AVAILABLE' && nextState.syncState !== 'IDLE_ERROR') {
      await this.store.revalidateImage(this.props.source)
    }
    if (nextState.fileState === 'FRESH') {
            // Unsubscribe to release memory
      this.store.removeCacheUpdateListener(this.props.source.uri, this.onCacheEvent)
    }
  }

  private async registerListener(props: OfflineImageProps<C>): Promise<void> {
    const event = this.store.addCacheUpdateListener(props.source.uri, this.onCacheEvent)
    await this.onCacheEvent(event)
  }

  private unregisterListener(props: OfflineImageProps<C>) {
    this.store.removeCacheUpdateListener(props.source.uri, this.onCacheEvent)
  }

  async componentWillMount(): Promise<void> {
    await this.registerListener(this.props)
  }

  componentWillUnmount() {
    this.unregisterListener(this.props)
  }

  async componentWillReceiveProps(nextProps: OfflineImageProps<C>, nextState: State): Promise<void> {
    invariant(this.props.storeName === nextProps.storeName, 'OfflineImage: storeName prop cannot be set dynamically.')
    invariant(nextProps.source && nextProps.source.uri !== null, 'OfflineImage: the source prop must contain a `uri` field.')
    if (this.props.source.uri !== nextProps.source.uri) {
      this.unregisterListener(this.props)
      await this.registerListener(nextProps)
    }
    if (nextState.version !== this.state.version && nextState.syncState === 'IDLE_SUCCESS') {
      // Force update since local version has changed
      this.ref && this.ref.forceUpdate()
    }
  }

  render() {
    const { source, ImageComponent: Img = Image, LoadingIndicatorComponent = ActivityIndicator, fallbackStaticSource: fallbackSource, storeName, ...imageProps } = this.props
    const { fileState, syncState, localURI } = this.state
    const LoadingComponent = LoadingIndicatorComponent as ComponentType
    const ImageComponent = Img as ComponentType<C>
    const loading = syncState === 'FETCHING' || syncState === 'REFRESHING'
    const displayFallback = fileState === 'UNAVAILABLE' || loading && !LoadingComponent
    if (displayFallback && fallbackSource) {
      return <ImageComponent source={fallbackSource} {...imageProps as C} />
    }
    if (loading || displayFallback) {
      return <LoadingComponent {...imageProps} />
    }
    return <ImageComponent source={{ uri: localURI }} ref={this.onRef} {...imageProps as C} />
  }
}
