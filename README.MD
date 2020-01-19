# The async store for react native

**Canonical Use Case, the Wiki app**: The canonical use case is an app with lots of dynamic content which must be displayed offline, including resources. You would have a launch sync step where you fetch relevant contents for the user. Of course, you could base64-encode those resources, but that would cost a 30% data-space and eventually bandwidth growth.

**Motivations**: There is already a lot of great libraries for caching resources in React Native. But I couldn't find one which allowed me to fully **control** my resource assets and their persistence, guaranteeing an offline access when required.

**Pros**:

- you can now consider your resources as dynamic assets which presence is deterministic;
- however, if you just need a cache, you can configure this library to behave as such;
- you have full control on the cache strategy, and can manually add, remove and revalidate resources;
- cache validation is fully compatible with `Cache-Control`, `Expires`, `Last-Modified`, and `ETag` HTTP headers for an optimal bandwidth consumption, [see this section for a deep dive](#cache-policy).
- the library is fully modular: you must inject your `FileSystem` and `DownloadManager` dependencies to fit with your choice of I/O libraries.

**Cons**:

- If you don't need this level of control over the cache, but are only concerned about performance gains, I would recommend [react-native-fast-image](https://github.com/DylanVann/react-native-fast-image) instead.

## Installation

## Use case 1: lazy preload resources as they are mounted

> *The maximum duration these resources stay in cache depends on store parameters, and cache headers in resource responses. [See this section for a deep dive](#cache-policy).*

### First step, create the store and give it a name

``` javascript
// store.js
import { createStore } from 'react-native-async-store'

// store configuration
const config = {
    // Automatically remove stale, expired resources during lifecycle methods.
    // Cleansing is done on mount and unmount.
    autoRemoveStales: true,
    // By default, this library will follow "Cache-Control: max-age" HTTP header
    // directives to evaluate the freshness of resources. You can force a value in
    // seconds, and use Infinity to denote an immutable store (resources are always
    // fresh).
    overrideMaxAge: Infinity,
    // A sensible default for debug logging is to use react native __DEV__ global.
    debug: __DEV__
}

// You can create as many stores as you wish, identified by name
// Parameter object is optional
export const AsyncStore = createStore('myStore', config)
```

> Check all parameters fields  [in typescript definitions](lib/AsyncStore/types.d.ts).

### Secondly, mount the store along with your root component

```javascript
// Root.js
import { ActivityIndicator } from 'react-native'
import { App } from './App'
import { AsyncStore } from './store'

export class Root extends React.PureComponent {
    // ...
    constructor(props) {
        super(props)
        this.state = {
            loading: true
        }
    }

    async componentDidMount() {
        // Store mounting is asynchronous because it involves
        // restoring cache info
        await AsyncStore.mount()
        this.setState({
            loading: false
        })
    }

    async componentWillUnmount() {
        await AsyncStore.unmount()
    }

    render() {
        return this.state.loading ? <ActivityIndicator /> : <App />
    }
}

```

## Use case 2: Gain control on resource preloading for offline usage

> *Typically usefull in a wiki/news application with offline mode*

Similar to scenario 1, but you can programatically preload resources in a deterministic way with `AsyncStore.preloadItems` method. That way, we can guarantee the end-user will have access to these resources when he goes offline.

For exemple, your Root component will be extended as such:

``` javascript

class Root extends React.PureComponent {
 async componentDidMount() {
        // Store mounting is asynchronous because it involves
        // restoring cache info
        await AsyncStore.mount()
        const imagesToPreload = await DataSource.getImages()
        // preloadItems will also revalidate any stale image
        await AsyncStore.preloadItems(imagesToPreload)
        this.setState({
            loading: false
        })
    }
}

```

## Constructor params

### `defaultMaxAge` and `overrideMaxAge` parameters

`max-age` is a `Cache-Control` directive defining the default duration for which resources will be fresh (contrary to stale).

- `defaultMaxAge` will be the default freshness duration when no `Cache-control: max-age` directive or `Expires` header has been given in the resource response.
- `overrideMaxAge` will override any freshness duration specified in a `Cache-control: max-age` directive or `Expires` header.
- **You can use `Infinity` to enforce a never-expire policy**

<a name="cache-policy"></a>

## Cache policy derived from HTTP response headers

The Store will try to behave as a HTTP cache, **deriving its caching policy  from both HTTP headers in the resource response and user-provided parameters.**

But contrary to a browser cache:

- when offline, any stored resource will be served to components, even if it's stale and [`must-revalidate` directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#Revalidation_and_reloading) should be enforced. This is equivalent to request cache with [`Cache-Control: stale-if-error` directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#Expiration).
- library user can add, revalidate, redownload or remove an resource programatically
- library user can revalidate all stale resources from the store
- library user can remove all stale resources from the store

### `Cache-Control`

Because `no-store` directive defies the purpose of this library, it will be ignored.

For the same reason, `must-revalidate` directive is interpreted loosly by the Store. When revalidation cannot be operated because the network or origin server is unavailable, the Store will interpret requests for resources as if `only-if-cached` directive was given by the client, i.e. the react component, serving the stale resource in the meanwhile and ignoring `must-revalidate` injunction.

#### Followed directives

- `max-age=<seconds>`: Specifies the maximum amount of time a resource will be considered fresh. Contrary to `Expires`, this directive is relative to the time of the request;

#### Interaction with store parameters

- If `overrideMaxAge` parameter is provided, headers will be ignored and the Store will behave following `max-age=<overrideMaxAge>`;
- If no `Cache-Control` while `Expires` header was provided, the Store will behave equivalently to `Cache-Control: must-revalidate, max-age=<inferredMaxAge>`;
- If no `Cache-Control` and no `Expires` headers were provided in response, the Store will behave following `max-age=<defaultMaxAge>`.

### `Expires`

`Expires` will be used to determine resource freshness when `Cache-Control: max-age=<...>` directive is missing.

### `ETag` and `Last-Modified`

When `Etag` or `Last-Modified` are present in an resource response, there value will be used to revalidate stale resources. By providing `If-None-Match` and `If-Modified-Since` headers when requesting origin server, the Store will receive `304 Unmodified` status when resources haven't changed, **sparing valuable bandwidth to the end users of your product**.

If both headers are present, `ETag` will prevail.

## Inspiration

Got inspiration from both [react-native-fast-image](https://github.com/DylanVann/react-native-fast-image) and [react-native-image-offline](https://github.com/code-and-co/react-native-image-offline).