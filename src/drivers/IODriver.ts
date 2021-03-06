import {
    AsyncStoreConfig,
    HTTPHeaders,
    Source,
    IODriverInterface,
    RequestReport,
    URIVersionTag,
    FileLocatorInterface,
    FileSystemDriverInterface,
    DownloadManagerInterface
} from '@src/interfaces'
import { DownloadFailure } from '@src/errors/DownloadFailure'
import { mergeDeepRight } from 'ramda'

export class IODriver implements IODriverInterface {
  protected fileSystem: FileSystemDriverInterface
  protected downloadManager: DownloadManagerInterface
  protected metaInfoFetcher?: (headers: Headers) => any

  constructor(protected readonly name: string, protected readonly config: AsyncStoreConfig<any>, protected readonly fileLocator: FileLocatorInterface) {
    this.fileSystem = new config.FileSystemDriver(name)
    this.downloadManager = new config.DownloadManager()
    this.metaInfoFetcher = config.metaInfoFetcher
  }

  protected getHeadersFromVersionTag(versionTag: URIVersionTag) {
    const headers: HTTPHeaders = {}
    if (versionTag.type === 'ETag') {
      headers['If-None-Match'] = versionTag.value
    } else if (versionTag.type === 'LastModified') {
      headers['If-Modified-Since'] = versionTag.value
    }
    return headers
  }

  protected expiryFromMaxAge(maxAge_s: number): number {
    return maxAge_s * 1000 + new Date().getTime()
  }

  protected getVersionTagFromHeaders(headers: Headers): URIVersionTag|null {
    if (headers.get('Etag')) {
      return {
        type: 'ETag',
        value: (headers.get('Etag') as string).trim()
      }
    }
    if (headers.get('Last-Modified')) {
      return {
        type: 'LastModified',
        value: (headers.get('Last-Modified') as string).trim()
      }
    }
    return null
  }

  protected getExpirationFromHeaders(headers: Headers): number {
    if (headers.has('Cache-Control')) {
      const contentType = headers.get('Cache-Control') as string
      const directives = contentType.split(',')
      for (const dir of directives) {
        const match = /^max-age=(.*)/.exec(dir)
        if (match) {
          const [ _, group] = match
          const maxAge_s = Number(group)
          if (!isNaN(maxAge_s)) {
            return this.expiryFromMaxAge(maxAge_s)
          }
        }
      }
    }
    if (headers.has('Expires')) {
      const expiresAt = headers.get('Expires') as string
      return Date.parse(expiresAt)
    }
    return this.expiryFromMaxAge(this.config.defaultMaxAge)
  }

  protected log(info: string) {
    if (this.config.debug) {
      console.log(`AsyncStore ${this.name}: ${info}`)
    }
  }

  async createBaseDirIfMissing(): Promise<void> {
    if (!await this.fileSystem.nodeExists(this.fileLocator.getBaseDirURI())) {
      return this.fileSystem.makeDirectory(this.fileLocator.getBaseDirURI())
    }
  }

  async deleteBaseDirIfExists(): Promise<void> {
    if (await this.fileSystem.nodeExists(this.fileLocator.getBaseDirURI())) {
      return this.fileSystem.delete(this.fileLocator.getBaseDirURI())
    }
  }

  async delete(src: Source): Promise<void> {
    const { uri } = src
    const file = this.fileLocator.getLocalURIForRemoteURI(uri)
    if (await this.exists(src)) {
      await this.fileSystem.delete(this.fileLocator.getLocalURIForRemoteURI(uri))
      this.log(`Local file '${file}' from origin ${uri} successfully deleted`)
    } else {
      this.log(`Local file '${file}' from origin ${uri} was targeted for delete but it does not exist`)
    }
  }

  async exists({ uri }: Source): Promise<boolean> {
    const localFileUri = this.fileLocator.getLocalURIForRemoteURI(uri)
    return this.fileSystem.nodeExists(localFileUri)
  }

  async revalidate({ uri, headers }: Source, versionTag: URIVersionTag): Promise<RequestReport> {
    const newHeaders = {
      ...headers,
      ...this.getHeadersFromVersionTag(versionTag)
    }
    return this.save({ uri, headers: newHeaders })
  }

  async save({ uri, headers: userHeaders }: Source): Promise<RequestReport> {
    // Override default cache-control
    const headers = mergeDeepRight(userHeaders, { 'Cache-Control': 'max-age=31536000' })
    const basename = this.fileLocator.getLocalFileNamePrefixForRemoteURI(uri)
    const temporaryLocalUri = this.fileLocator.getLocalURIFromLocalFilename(basename + '.tmp')
    try {
      const report = await this.downloadManager.download(uri, temporaryLocalUri, headers)
      let localFileName = ''
      const error = !report.isOK ? new DownloadFailure(uri, report.status) : null
      localFileName = `${basename}`
      if (report.isOK && report.status != 304) {
        await this.fileSystem.move(temporaryLocalUri, this.fileLocator.getLocalURIFromLocalFilename(localFileName))
      }
      return {
        uri,
        error,
        localFileName,
        expires: this.config.overrideMaxAge ? this.expiryFromMaxAge(this.config.overrideMaxAge) : this.getExpirationFromHeaders(report.headers),
        versionTag: this.getVersionTagFromHeaders(report.headers),
        metaInfo: this.metaInfoFetcher ? this.metaInfoFetcher(report.headers) : null
      }
    } catch (error) {
      return {
        uri,
        error: new DownloadFailure(uri, error.status, error.message),
        expires: 0,
        localFileName: '',
        versionTag: null,
        metaInfo: null
      }
    }
  }
}
