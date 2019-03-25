"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rn_fetch_blob_1 = __importDefault(require("rn-fetch-blob"));
const ramda_1 = require("ramda");
const AbstractIODriver_1 = require("./AbstractIODriver");
const ImageDownloadFailure_1 = require("../errors/ImageDownloadFailure");
class IODriver extends AbstractIODriver_1.AbstractIODriver {
    constructor(name, config, fileLocator) {
        super(name, config, fileLocator);
    }
    prepareFetch(uri) {
        return rn_fetch_blob_1.default.config({
            path: this.fileLocator.getTempFilenameFromURI(uri)
        });
    }
    saveImage({ uri, headers: userHeaders }) {
        return __awaiter(this, void 0, void 0, function* () {
            // Override default cache-control
            const headers = ramda_1.mergeDeepRight(userHeaders, { 'Cache-Control': 'max-age=31536000' });
            try {
                const response = yield this.prepareFetch(uri).fetch('GET', uri, headers);
                // Content-Type = image/jpeg
                const downloadPath = this.fileLocator.getTempFilenameFromURI(uri);
                let path = downloadPath;
                const error = response.respInfo.status >= 400 ? new ImageDownloadFailure_1.ImageDownloadFailure(uri, response.respInfo.status) : null;
                if (!error) {
                    path += '.' + this.getImageFileExtensionFromHeaders(uri, response.respInfo.headers);
                    yield rn_fetch_blob_1.default.fs.mv(downloadPath, path);
                    console.info(`Moved file from ${downloadPath} to ${path}`);
                }
                return {
                    uri,
                    error,
                    path,
                    expires: this.config.overrideMaxAge ? this.expiryFromMaxAge(this.config.overrideMaxAge) : this.getExpirationFromHeaders(response.respInfo.headers),
                    versionTag: this.getVersionTagFromHeaders(response.respInfo.headers)
                };
            }
            catch (error) {
                return {
                    uri,
                    error: new ImageDownloadFailure_1.ImageDownloadFailure(uri, error.status),
                    expires: 0,
                    path: this.fileLocator.getTempFilenameFromURI(uri),
                    versionTag: null
                };
            }
        });
    }
    revalidateImage({ uri, headers }, versionTag) {
        return __awaiter(this, void 0, void 0, function* () {
            const newHeaders = Object.assign({}, headers, this.getHeadersFromVersionTag(versionTag));
            return this.saveImage({ uri, headers: newHeaders });
        });
    }
    imageExists({ uri }) {
        return __awaiter(this, void 0, void 0, function* () {
            return rn_fetch_blob_1.default.fs.exists(this.fileLocator.getLocalPathFromURI(uri));
        });
    }
    deleteImage(src) {
        return __awaiter(this, void 0, void 0, function* () {
            const { uri } = src;
            const file = this.fileLocator.getLocalPathFromURI(uri);
            if (yield this.imageExists(src)) {
                yield rn_fetch_blob_1.default.fs.unlink(this.fileLocator.getLocalPathFromURI(uri));
                this.log(`Local file '${file}' from origin ${uri} successfully deleted`);
            }
            else {
                this.log(`Local file '${file}' from origin ${uri} was targeted for delete but it does not exist`);
            }
        });
    }
    deleteCacheRoot() {
        return __awaiter(this, void 0, void 0, function* () {
            return rn_fetch_blob_1.default.fs.unlink(this.fileLocator.getBaseDir());
        });
    }
}
exports.IODriver = IODriver;