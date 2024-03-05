// TODO: interlacing
const GIF_MIME_TYPE = 'image/gif';
const MISSING_COLOR_RGB = [0, 0, 0];

const EXTENSION_INTRODUCER = parseInt('21', 16);
const GRAPHIC_CONTROL_LABEL = parseInt('F9', 16);
const TEXT_LABEL = parseInt('01', 16);
const APPLICATION_LABEL = parseInt('FF', 16);
const COMMENT_LABEL = parseInt('FE', 16);
const IMAGE_SEPARATOR = parseInt('2C', 16);
const EOF = parseInt('3B', 16);

const SIGNATURE_BYTES = 3;
const VERSION_BYTES = 3;
const COLOR_BYTES = 3;

function padZero(str, len = 2) {
    return str.padStart(len, '0');
}

function decToHex(v, padStart = 2) {
    return padZero(new Number(v).toString(16).toUpperCase(), padStart);
}

function decToBin(v, len = 8) {
    return padZero(new Number(v).toString(2), len);
}

function binToDec(v) {
    return parseInt(`${v}`, 2);
}

function assertBlob(blob) {
    if (!blob || !(blob instanceof Blob) || blob.type !== GIF_MIME_TYPE) {
        throw new TypeError('Invalid Blob');
    }
}

function assertImage(image) {
    if (!image || (!(image instanceof HTMLImageElement) || !(image instanceof Image))) {
        throw new TypeError('Invalid Image')
    }
}

function assertFile(file) {
    if (!file || !(file instanceof File) || file.type !== GIF_MIME_TYPE) {
        throw new TypeError('Invalid File');
    }
}

function assertArrayBuffer(buffer) {
    if (!buffer || !(buffer instanceof ArrayBuffer) || !buffer.byteLength) {
        throw new TypeError('Invalid ArrayBuffer');
    }
}

function isDecoded(decoded, value) {
    if (!decoded || !value) {
        throw new Error('GifNotDecoded')
    }
}

function decodeTextExtension(dv, byteOffset) {
    let offset = byteOffset;
    const output = {
        introduction: null,
        label: null,
        text: [],
        hex: [],
    };
    const offsets = {
        _start: offset,
    };

    const introduction = decToHex(dv.getUint8(offset));
    output.introduction = introduction;
    offset++;
    output.label = decToHex(dv.getUint8(offset));
    offset++;
    let byteSize = dv.getUint8(offset);
    offset++;
    while (byteSize) {
        for (let i = 0; i < byteSize; i++) {
            const byte = dv.getUint8(offset);
            offset++;
            output.hex.push(decToHex(byte));
            output.text.push(String.fromCharCode(byte));
        }
        byteSize = dv.getUint8(offset);
        offset++;
    }
    output.terminator = decToHex(byteSize);
    output.hex = output.hex.join('');
    output.text = output.text.join('');
    offsets._end = offset;
    return {
        offset,
        output,
        offsets,
    };
}

function decodeApplicationExtension(dv, byteOffset) {
    let offset = byteOffset;
    const output = {
        introduction: null,
        label: null,
        application: [],
        hex: [],
        loopCount: null,
        terminator: null,
    };
    const offsets = {
        _start: offset,
    };

    const introduction = decToHex(dv.getUint8(offset));
    output.introduction = introduction;
    offset++;
    output.label = decToHex(dv.getUint8(offset));
    offset++;
    const byteSize = dv.getUint8(offset);
    offset++;
    for (let i = 0; i < byteSize; i++) {
        const byte = dv.getUint8(offset);
        offset++;
        output.hex.push(decToHex(byte));
        output.application.push(String.fromCharCode(byte));
    }
    output.subblock = dv.getUint8(offset);
    offset++;
    output.skip = dv.getUint8(offset);
    offset++;
    output.loopCount = dv.getUint16(offset, true);
    offset += 2;
    output.terminator = decToHex(dv.getUint8(offset));
    offset++;
    output.hex = output.hex.join('');
    output.application = output.application.join('');
    offsets._end = offset;
    return {
        offset,
        output,
        offsets,
    };
}

function decodeCommentExtension(dv, byteOffset) {
    let offset = byteOffset;
    const output = {
        introduction: null,
        label: null,
        comment: [],
        hex: [],
    };
    const offsets = {
        _start: offset,
    };

    const introduction = decToHex(dv.getUint8(offset));
    output.introduction = introduction;
    offset++;
    output.label = decToHex(dv.getUint8(offset));
    offset++;
    const byteSize = dv.getUint8(offset);
    offset++;
    for (let i = 0; i < byteSize; i++) {
        const byte = dv.getUint8(offset);
        offset++;
        output.hex.push(decToHex(byte));
        output.comment.push(String.fromCharCode(byte));
    }
    output.terminator = decToHex(dv.getUint8(offset));
    offset++;
    output.hex = output.hex.join('');
    output.comment = output.comment.join('');
    offsets._end = offset;
    return {
        offset,
        output,
        offsets,
    };
}

function lzwDecode(minCodeSize, data, pixelCount) {
    const MAX_STACK_SIZE = 4096;
    const nullCode = -1;
    let dataSize = minCodeSize;
    let clear = 1 << dataSize;
    let eof = clear + 1;
    let available = clear + 2;
    let oldCode = nullCode;
    let codeSize = dataSize + 1;
    let codeMask = (1 << codeSize) - 1;
    const dstPixels = new Array(pixelCount);
    const prefix = new Array(MAX_STACK_SIZE);
    const suffix = new Array(MAX_STACK_SIZE);
    const pixelStack = new Array(MAX_STACK_SIZE + 1);
    let code = 0;

    for (code = 0; code < clear; code++) {
        prefix[code] = 0
        suffix[code] = code
    }
    let bits = 0;
    let first = 0;
    let top = 0;
    let pi = 0;
    let bi = 0;
    let i = 0;
    let datum = 0;
    for (i = 0; i < pixelCount;) {
        if (top === 0) {
            if (bits < codeSize) {
                datum += data[bi] << bits

                bits += 8
                bi++
                continue
            }
            // Get the next code.
            code = datum & codeMask
            datum >>= codeSize
            bits -= codeSize
            if (code > available || code == eof) {
                break
            }
            if (code == clear) {
                codeSize = dataSize + 1
                codeMask = (1 << codeSize) - 1
                available = clear + 2
                oldCode = nullCode
                continue
            }
            if (oldCode == nullCode) {
                pixelStack[top++] = suffix[code]
                oldCode = code
                first = code
                continue
            }
            let inCode = code
            if (code == available) {
                pixelStack[top++] = first
                code = oldCode
            }
            while (code > clear) {
                pixelStack[top++] = suffix[code]
                code = prefix[code]
            }
            first = suffix[code] & 0xff
            pixelStack[top++] = first

            if (available < MAX_STACK_SIZE) {
                prefix[available] = oldCode
                suffix[available] = first
                available++
                if ((available & codeMask) === 0 && available < MAX_STACK_SIZE) {
                    codeSize++
                    codeMask += available
                }
            }
            oldCode = inCode
        }
        top--
        dstPixels[pi++] = pixelStack[top]
        i++
    }
    for (i = pi; i < pixelCount; i++) {
        dstPixels[i] = 0
    }
    return dstPixels
}

class GifColor {
    #r;
    #g;
    #b;

    constructor(r, g, b) {
        this.#r = r;
        this.#g = g;
        this.#b = b;
    }

    toRGB() {
        return {
            r: this.#r,
            g: this.#g,
            b: this.#b,
        };
    }

    toArray() {
        return [this.#r, this.#g, this.#b];
    }

    toHex() {
        return `#${decToHex(this.#r)}${decToHex(this.#g)}${decToHex(this.#b)}`;
    }

    get [Symbol.toStringTag]() {
        return 'GifColor';
    }

    toString() {
        return this.toHex();
    }
}

class GifFrame {
    id
    #decoded = false;

    #dv;
    #globalColorTable;

    #offsets = {
        _start: null,
        graphicControlExtension: {
            _start: null,
            introduction: null,
            label: null,
            byteSize: null,
            packed: null,
            delayTime: null,
            transparentColorIndex: null,
            blockTerminator: null,
            _end: null,
        },
        imageDescriptor: {
            _start: null,
            imageSeparator: null,
            imageLeft: null,
            imageTop: null,
            width: null,
            height: null,
            packed: null,
            _end: null,
        },
        localColorTable: {
            _start: null,
            _end: null,
        },
        minCodeSize: null,
        imageData: {
            _start: null,
            _end: null,
        },
        extensions: {
            _start: null,
            _end: null,
            text: {},
            comment: {},
            application: {},
        },
        _end: null,
    }

    // Graphic Control Extension
    #introduction;
    #label;
    #byteSize;
    #transparentColorIndex;
    #blockTerminator;
    #graphicControlExtensionPackedBinary;
    // Graphic Control Extension Packed
    #graphicControlReserved;
    #disposalMethod;
    #userInputFlag;
    #transparentColorFlag;
    #delayTime

    // Image Descriptor
    #imageSeparator;
    #imageLeft;
    #imageTop;
    #width;
    #height;
    #imageDescriptorPackedBinary;
    // Image Descriptor Packed
    #localColorTableFlag;
    #interlaceFlag;
    #sortFlag;
    #imageDescriptorReserved;
    #sizeOfLocalColorTable;

    #localColorTable = [];
    #minCodeSize;
    #imageDataStream = [];
    #encodedData = [];
    #decodedPixels = [];

    #textExtension = {};
    #applicationExtension = {};
    #commentExtension = {};


    constructor(id, dv, colorTable) {
        this.id = id;
        if (!dv || !(dv instanceof DataView)) {
            throw new Error('Missing Dataview');
        }
        this.#dv = dv;
        this.#globalColorTable = colorTable;
    }

    #decodeGraphicControlExtension(byteOffset) {
        let offset = byteOffset;
        this.#offsets._start = offset;
        this.#offsets.graphicControlExtension._start = offset;
        const introduction = this.#dv.getUint8(offset);
        const label = this.#dv.getUint8(offset + 1);
        if (introduction === EXTENSION_INTRODUCER && label === GRAPHIC_CONTROL_LABEL) {
            this.#introduction = decToHex(introduction);
            this.#offsets.graphicControlExtension.introduction = offset;
            offset++;
            this.#label = decToHex(label);
            this.#offsets.graphicControlExtension.label = offset;
            offset++;
            this.#byteSize = this.#dv.getUint8(offset, true);
            this.#offsets.graphicControlExtension.byteSize = offset;
            offset++;
            const packed = this.#dv.getUint8(offset, true);
            const binPacked = `${decToBin(packed, 8)}`;
            this.#offsets.graphicControlExtension.packed = offset;
            offset++;
            this.#graphicControlExtensionPackedBinary = binPacked;
            this.#graphicControlReserved = binToDec(binPacked.substring(0, 3));
            this.#disposalMethod = binToDec(binPacked.substring(3, 6));
            this.#userInputFlag = parseInt(binPacked[6], 10);
            this.#transparentColorFlag = parseInt(binPacked[7], 10);
            this.#delayTime = this.#dv.getUint16(offset, true) * 10;
            this.#offsets.graphicControlExtension.delayTime = offset;
            offset += 2;
            this.#transparentColorIndex = this.#dv.getUint8(offset, true);
            this.#offsets.graphicControlExtension.transparentColorIndex = offset;
            offset++;
            this.#blockTerminator = decToHex(this.#dv.getUint8(offset, true));
            this.#offsets.graphicControlExtension.blockTerminator = offset;
            offset++;
        }
        this.#offsets._end = offset;
        return offset;
    }

    #decodeImageDescriptor(byteOffset) {
        let offset = byteOffset;
        const introduction = this.#dv.getUint8(offset);
        const introductionHex = decToHex(introduction)
        if (introduction === IMAGE_SEPARATOR) {
            this.#offsets.imageDescriptor._start = offset;
            this.#offsets.imageDescriptor.imageSeparator = offset;
            this.#imageSeparator = introductionHex;
            offset++;
            this.#imageLeft = this.#dv.getUint16(offset, true);
            this.#offsets.imageDescriptor.imageLeft = offset;
            offset += 2;
            this.#imageTop = this.#dv.getUint16(offset, true);
            this.#offsets.imageDescriptor.imageTop = offset;
            offset += 2;
            this.#width = this.#dv.getUint16(offset, true);
            this.#offsets.imageDescriptor.width = offset;
            offset += 2;
            this.#height = this.#dv.getUint16(offset, true);
            this.#offsets.imageDescriptor.height = offset;
            offset += 2;
            const packed = this.#dv.getUint8(offset);
            const binPacked = `${decToBin(packed, 8)}`;
            this.#offsets.imageDescriptor.packed = offset;
            this.#imageDescriptorPackedBinary = binPacked;
            offset++;
            const localColorTableFlag = parseInt(binPacked[0], 10);
            const interlaceFlag = parseInt(binPacked[1], 10);
            const sortFlag = parseInt(binPacked[2], 10);
            const reserved = binToDec(binPacked.substring(3, 5));
            const sizeOfLocalColorTable = Math.pow(2, binToDec(binPacked.substring(5, 8)) + 1);
            this.#localColorTableFlag = localColorTableFlag;
            this.#interlaceFlag = interlaceFlag;
            this.#sortFlag = sortFlag;
            this.#imageDescriptorReserved = reserved;
            this.#sizeOfLocalColorTable = sizeOfLocalColorTable;
        }
        this.#offsets.imageDescriptor._end = offset;
        return offset;
    }

    #decodeExtensions(byteOffset) {
        let offset = byteOffset;
        const introduction = this.#dv.getUint8(offset);
        const label = this.#dv.getUint8(offset + 1);
        if (introduction === EXTENSION_INTRODUCER) {
            switch (label) {
                case TEXT_LABEL:
                    offset = this.#decodeTextExtension(offset);
                    break;
                case APPLICATION_LABEL:
                    offset = this.#decodeApplicationExtension(offset);
                    break;
                case COMMENT_LABEL:
                    offset = this.#decodeCommentExtension(offset);
                    break;
                default:
                    console.error('Unknown Extension Label', label);
                    break;
            }
        } else if (introduction === IMAGE_SEPARATOR) {
            offset = this.#decodeImageDescriptor(offset);
        }
        return offset;
    }

    #decodeLocalColorTable(byteOffset) {
        let offset = byteOffset;
        this.#offsets.localColorTable._start = offset;
        const localColorTableFlag = !!this.#localColorTableFlag;
        const sizeOfLocalColorTable = this.#sizeOfLocalColorTable;
        if (localColorTableFlag && sizeOfLocalColorTable) {
            const byteSizeOfLocalColorTable = sizeOfLocalColorTable * COLOR_BYTES;
            for (let i = 0; i < byteSizeOfLocalColorTable; i += COLOR_BYTES) {
                const r = this.#dv.getUint8(offset);
                const g = this.#dv.getUint8(offset + 1);
                const b = this.#dv.getUint8(offset + 2);
                this.#localColorTable.push(new GifColor(r, g, b));
                offset += COLOR_BYTES;
            }
        }
        this.#offsets.localColorTable._end = offset;
        return offset;
    }

    #decodeImageData(byteOffset) {
        let offset = byteOffset;
        this.#offsets.imageData._start = offset;
        this.#minCodeSize = this.#dv.getUint8(offset);
        offset++;
        let byteSize = this.#dv.getUint8(offset);
        offset++;
        this.#imageDataStream.push(byteSize);
        while (byteSize) {
            for (let i = 0; i < byteSize; i++) {
                const byte = this.#dv.getUint8(offset);
                offset++;
                this.#encodedData.push(byte);
                this.#imageDataStream.push(byte);
            }
            byteSize = this.#dv.getUint8(offset);
            this.#imageDataStream.push(byteSize);
            offset++;
        }
        this.#offsets.imageData._end = offset;
        return offset;
    }

    #decodePixels() {
        const decoded = lzwDecode(this.#minCodeSize, this.#encodedData, this.#width * this.#height);
        let colorTable = this.#globalColorTable;
        let transColorIndex = -1;
        if (this.#localColorTableFlag) {
            colorTable = this.#localColorTable;
        }
        if (this.#transparentColorFlag) {
            transColorIndex = this.#transparentColorIndex;
        }
        this.#decodedPixels = decoded.map((colorTableIndex) => {
            if (+colorTableIndex === +transColorIndex) {
                return null;
            } else if (colorTableIndex >= 0 && colorTableIndex < colorTable.length) {
                return colorTable[colorTableIndex];
            } else {
                return new GifColor(...MISSING_COLOR_RGB);
            }
        });
    }

    #decodeTextExtension(byteOffset) {
        const { offset, output, offsets } = decodeTextExtension(this.#dv, byteOffset);
        this.#offsets.extensions.text = offsets;
        this.#textExtension = output;
        return offset;
    }

    #decodeApplicationExtension(byteOffset) {
        const { offset, output, offsets } = decodeApplicationExtension(this.#dv, byteOffset);
        this.#offsets.extensions.application = offsets;
        this.#applicationExtension = output;
        return offset;
    }

    #decodeCommentExtension(byteOffset) {
        const { offset, output, offsets } = decodeCommentExtension(this.#dv, byteOffset);
        this.#offsets.extensions.comment = offsets;
        this.#commentExtension = output;
        return offset;
    }

    decode(byteOffset) {
        if (this.#decoded) {
            return;
        }
        this.#offsets._start = byteOffset;
        const loopQualifiers = [EXTENSION_INTRODUCER, IMAGE_SEPARATOR]
        let offset = this.#decodeGraphicControlExtension(byteOffset);
        let extension = this.#dv.getUint8(offset);
        while (loopQualifiers.includes(extension)) {
            offset = this.#decodeExtensions(offset);
            extension = this.#dv.getUint8(offset);
        }
        offset = this.#decodeLocalColorTable(offset);
        offset = this.#decodeImageData(offset);
        this.#decodePixels();
        this.#offsets._end = offset;
        this.#decoded = true;
        return offset;
    }

    getOffsets() {
        isDecoded(this.#decoded, true);
        return Object.freeze({
            _start: this.#offsets._start,
            graphicControlExtension: Object.freeze({
                ...this.#offsets.graphicControlExtension,
            }),
            imageDescriptor: Object.freeze({
                ...this.#offsets.imageDescriptor,
            }),
            localColorTable: Object.freeze({
                ...this.#offsets.localColorTable,
            }),
            minCodeSize: this.#offsets.minCodeSize,
            imageData: Object.freeze({
                ...this.#offsets.imageData,
            }),
            extensions: Object.freeze({
                text: Object.freeze(this.#offsets.extensions.text),
                comment: Object.freeze(this.#offsets.extensions.comment),
                application: Object.freeze(this.#offsets.extensions.application),
            }),
            _end: this.#offsets._end,
        })
    }

    toObject() {
        isDecoded(this.#decoded, true);
        return Object.freeze({
            graphicControlExtension: Object.freeze({
                introduction: this.#introduction,
                label: this.#label,
                byteSize: this.#byteSize,
                packed: Object.freeze({
                    _binary: this.#graphicControlExtensionPackedBinary,
                    reserved: this.#graphicControlReserved,
                    disposalMethod: this.#disposalMethod,
                    userInputFlag: this.#userInputFlag,
                    transparentColorFlag: this.#transparentColorFlag,
                }),
                delayTime: this.#delayTime,
                transparentColorIndex: this.#transparentColorIndex,
                blockTerminator: this.#blockTerminator,
            }),
            imageDescriptor: Object.freeze({
                imageSeparator: this.#imageSeparator,
                imageLeft: this.#imageLeft,
                imageTop: this.#imageTop,
                width: this.#width,
                height: this.#height,
                packed: Object.freeze({
                    _binary: this.#imageDescriptorPackedBinary,
                    localColorTableFlag: this.#localColorTableFlag,
                    interlaceFlag: this.#interlaceFlag,
                    sortFlag: this.#sortFlag,
                    reserved: this.#imageDescriptorReserved,
                    sizeOfLocalColorTable: this.#sizeOfLocalColorTable,
                }),
            }),
            localColorTable: Object.freeze(this.getLocalColorTable().map((c) => c.toHex())),
            minCodeSize: this.#minCodeSize,
            compressedPixelData: Object.freeze(this.#encodedData),
            imageDataStream: Object.freeze(this.#imageDataStream),
            decodedPixels: Object.freeze(this.#decodedPixels),
            extensions: Object.freeze({
                ...(Object.keys(this.#textExtension).length ? {
                    text: Object.freeze(this.#textExtension),
                } : {}),
                ...(Object.keys(this.#applicationExtension).length ? {
                    application: Object.freeze(this.#applicationExtension),
                } : {}),
                ...(Object.keys(this.#commentExtension).length ? {
                    comment: Object.freeze(this.#commentExtension),
                } : {}),
            }),
        });
    }

    getDimensions() {
        isDecoded(this.#decoded, this.#width && this.#height);
        return {
            left: this.#imageLeft,
            top: this.#imageTop,
            width: this.#width,
            height: this.#height,
        };
    }

    getTransparentColorIndex() {
        isDecoded(this.#decoded, true);
        if (this.#transparentColorFlag) {
            return this.#transparentColorIndex;
        } else {
            return -1;
        }
    }

    getLocalColorTable() {
        isDecoded(this.#decoded, true);
        if (this.#localColorTableFlag) {
            return this.#localColorTable;
        } else {
            return null;
        }
    }

    getMinCodeSize() {
        isDecoded(this.#decoded, true);
        return this.#minCodeSize;
    }

    getCompressedPixelData() {
        isDecoded(this.#decoded, true);
        return this.#encodedData;
    }

    getImageDataStream() {
        isDecoded(this.#decoded, true);
        return this.#imageDataStream;
    }

    getDecodedPixels() {
        isDecoded(this.#decoded, true);
        return this.#decodedPixels;
    }

    getExtensions() {
        isDecoded(this.#decoded, true);
        return {
            ...(this.#textExtension ? { text: this.#textExtension } : {}),
            ...(this.#commentExtension ? { comment: this.#commentExtension } : {}),
            ...(this.#applicationExtension ? { application: this.#applicationExtension } : {}),
        }
    }

    get [Symbol.toStringTag]() {
        return 'GifFrame';
    }
}

export default class GifDecoder {
    #decoded = false;

    #buffer;
    #dv;
    #offsets = {
        _start: 0,
        header: {
            _start: 0,
            signature: null,
            version: null,
            _end: null,
        },
        logicalScreenDescriptor: {
            _start: null,
            width: null,
            height: null,
            packed: null,
            backgroundColorIndex: null,
            pixelAspectRatio: null,
            _end: null,
        },
        globalColorTable: {
            _start: null,
            _end: null,
        },
        extensions: {
            graphicControl: [],
            text: {},
            comment: {},
            application: {},
        },
        _end: null,
    };

    // header
    #signature;
    #version;

    // logical screen descriptor
    #width;
    #height;
    #backgroundColorIndex;
    #pixelAspectRatio;
    #logicalScreenDescriptorPackedBinary;
    // logical screen descriptor packed
    #globalColorTableFlag;
    #colorResolution;
    #sortFlag;
    #sizeOfGlobalColorTable;

    #globalColorTable = [];
    #frames = [];

    #applicationExtension = {};
    #commentExtension = {};
    #textExtension = {};
    #trailer;

    constructor(buffer) {
        assertArrayBuffer(buffer);
        this.#buffer = buffer;
        this.#dv = new DataView(buffer);
    }

    #decodeHeader() {
        let offset = 0;
        const signature = [];
        const version = [];
        this.#offsets.header._start = offset;
        this.#offsets.header.signature = offset;
        for (let i = 0; i < SIGNATURE_BYTES; i++) {
            signature.push(String.fromCharCode(this.#dv.getUint8(offset)));
            offset++;
        }
        this.#offsets.header.version = offset;
        for (let i = 0; i < VERSION_BYTES; i++) {
            version.push(String.fromCharCode(this.#dv.getUint8(offset)));
            offset++;
        }
        this.#signature = signature.join('');
        this.#version = version.join('');
        this.#offsets.header._end = offset;
        return offset;
    }

    #decodeLogicalScreenDescriptor(byteOffset) {
        let offset = byteOffset;
        this.#offsets.logicalScreenDescriptor._start = offset;
        const width = this.#dv.getUint16(offset, true);
        this.#width = width;
        this.#offsets.logicalScreenDescriptor.width = offset;
        offset += 2;
        const height = this.#dv.getUint16(offset, true);
        this.#height = height;
        this.#offsets.logicalScreenDescriptor.height = offset;
        offset += 2;
        const packed = this.#dv.getUint8(offset);
        const binPacked = `${decToBin(packed, 8)}`;
        this.#logicalScreenDescriptorPackedBinary = binPacked;
        this.#globalColorTableFlag = parseInt(binPacked[0], 10);
        this.#colorResolution = binToDec(binPacked.substring(1, 4));
        this.#sortFlag = parseInt(binPacked[4], 10);
        this.#sizeOfGlobalColorTable = Math.pow(2, binToDec(binPacked.substring(5, 8)) + 1);
        this.#offsets.logicalScreenDescriptor.packed = offset;
        offset++;
        const backgroundColorIndex = this.#dv.getUint8(offset);
        this.#backgroundColorIndex = backgroundColorIndex;
        this.#offsets.logicalScreenDescriptor.backgroundColorIndex = offset;
        offset++;
        const pixelAspectRatio = this.#dv.getUint8(offset);
        this.#pixelAspectRatio = pixelAspectRatio ? (pixelAspectRatio + 15) / 64 : 0;
        this.#offsets.logicalScreenDescriptor.pixelAspectRatio = offset;
        offset++;
        this.#offsets.logicalScreenDescriptor._end = offset;
        return offset;
    }

    #decodeGlobalColorTable(byteOffset) {
        let offset = byteOffset;
        this.#offsets.globalColorTable._start = offset;
        const globalColorTableFlag = !!this.#globalColorTableFlag;
        const sizeOfGlobalColorTable = this.#sizeOfGlobalColorTable;
        if (globalColorTableFlag && sizeOfGlobalColorTable) {
            const byteSizeOfGlobalColorTable = sizeOfGlobalColorTable * COLOR_BYTES;
            for (let i = 0; i < byteSizeOfGlobalColorTable; i += COLOR_BYTES) {
                const r = this.#dv.getUint8(offset);
                const g = this.#dv.getUint8(offset + 1);
                const b = this.#dv.getUint8(offset + 2);
                this.#globalColorTable.push(new GifColor(r, g, b));
                offset += COLOR_BYTES;
            }
        }
        this.#offsets.globalColorTable._end = offset;
        return offset;
    }

    #decodeExtensions(byteOffset) {
        let offset = byteOffset;
        const introduction = this.#dv.getUint8(offset);
        const label = this.#dv.getUint8(offset + 1);
        if (introduction === EXTENSION_INTRODUCER) {
            switch (label) {
                case GRAPHIC_CONTROL_LABEL:
                    offset = this.#decodeGraphicControlExtension(offset);
                    break;
                case TEXT_LABEL:
                    offset = this.#decodeTextExtension(offset);
                    break;
                case APPLICATION_LABEL:
                    offset = this.#decodeApplicationExtension(offset);
                    break;
                case COMMENT_LABEL:
                    offset = this.#decodeCommentExtension(offset);
                    break;
                default:
                    console.error('Unknown Extension Label', label);
                    break;
            }
        }
        return offset;
    }

    #decodeGraphicControlExtension(byteOffset) {
        let offset = byteOffset;
        const colorTable = this.#globalColorTableFlag ? this.#globalColorTable : null;
        const frame = new GifFrame(this.#frames.length, this.#dv, colorTable);
        offset = frame.decode(offset);
        this.#frames.push(frame);
        this.#offsets.extensions.graphicControl.push({
            _start: byteOffset,
            _end: offset,
        });
        return offset;
    }

    #decodeTextExtension(byteOffset) {
        const { offset, output, offsets } = decodeTextExtension(this.#dv, byteOffset);
        this.#offsets.extensions.text = offsets;
        this.#textExtension = output;
        return offset;
    }

    #decodeApplicationExtension(byteOffset) {
        const { offset, output, offsets } = decodeApplicationExtension(this.#dv, byteOffset);
        this.#offsets.extensions.application = offsets;
        this.#applicationExtension = output;
        return offset;
    }

    #decodeCommentExtension(byteOffset) {
        const { offset, output, offsets } = decodeCommentExtension(this.#dv, byteOffset);
        this.#offsets.extensions.comment = offsets;
        this.#commentExtension = output;
        return offset;
    }

    decode() {
        if (this.#decoded) {
            return;
        }
        this.#offsets._start = 0;
        let offset = this.#decodeHeader();
        offset = this.#decodeLogicalScreenDescriptor(offset);
        offset = this.#decodeGlobalColorTable(offset);
        let extension = this.#dv.getUint8(offset);
        while (extension === EXTENSION_INTRODUCER) {
            offset = this.#decodeExtensions(offset);
            extension = this.#dv.getUint8(offset);
        }
        if (extension === EOF) {
            this.#trailer = decToHex(EOF);
        }
        this.#offsets._end = offset;
        this.#decoded = true;
        return this;
    }

    getOffsets() {
        return Object.freeze({
            _start: this.#offsets._start,
            header: Object.freeze({
                ...this.#offsets.header,
            }),
            logicalScreenDescriptor: Object.freeze({
                ...this.#offsets.logicalScreenDescriptor,
            }),
            globalColorTable: Object.freeze({
                ...this.#offsets.globalColorTable,
            }),
            extensions: Object.freeze({
                graphicControl: Object.freeze(this.#offsets.extensions.graphicControl.map((v) => Object.freeze(v))),
                text: Object.freeze(this.#offsets.extensions.text),
                comment: Object.freeze(this.#offsets.extensions.comment),
                application: Object.freeze(this.#offsets.extensions.application),
            }),
            _end: this.#offsets._end,
        });
    }

    toObject() {
        isDecoded(this.#decoded, true);
        return Object.freeze({
            _byteSize: this.#dv.byteLength,
            header: Object.freeze({
                signature: this.#signature,
                version: this.#version,
            }),
            logicalScreenDescriptor: Object.freeze({
                width: this.#width,
                height: this.#height,
                packed: Object.freeze({
                    _binary: this.#logicalScreenDescriptorPackedBinary,
                    globalColorTableFlag: this.#globalColorTableFlag,
                    colorResolution: this.#colorResolution,
                    sortFlag: this.#sortFlag,
                    sizeOfGlobalColorTable: this.#sizeOfGlobalColorTable,
                }),
                backgroundColorIndex: this.#backgroundColorIndex,
                pixelAspectRatio: this.#pixelAspectRatio,
            }),
            globalColorTable: Object.freeze(this.getGlobalColorTable().map((c) => c.toHex())),
            frames: Object.freeze(this.getFrames().map((v) => v.toObject())),
            extensions: Object.freeze({
                ...(Object.keys(this.#textExtension).length ? {
                    text: Object.freeze(this.#textExtension),
                } : {}),
                ...(Object.keys(this.#applicationExtension).length ? {
                    application: Object.freeze(this.#applicationExtension),
                } : {}),
                ...(Object.keys(this.#commentExtension).length ? {
                    comment: Object.freeze(this.#commentExtension),
                } : {}),
            }),
            tailer: this.#trailer,
        });
    }

    getDimensions() {
        isDecoded(this.#decoded, this.#width && this.#height);
        return {
            width: this.#width,
            height: this.#height,
        };
    }

    getGlobalColorTable() {
        isDecoded(this.#decoded, true);
        if (this.#globalColorTableFlag) {
            return this.#globalColorTable;
        } else {
            return null;
        }
    }

    getFrames() {
        isDecoded(this.#decoded, true);
        return this.#frames;
    }

    getExtensions() {
        isDecoded(this.#decoded, true);
        return {
            ...(this.#textExtension ? { text: this.#textExtension } : {}),
            ...(this.#commentExtension ? { comment: this.#commentExtension } : {}),
            ...(this.#applicationExtension ? { application: this.#applicationExtension } : {}),
        }
    }

    // Static Methods
    static fromBlobAsync(blob) {
        assertBlob(blob);
        return blob.arrayBuffer().then((buffer) => {
            return new GifDecoder(buffer);
        });
    }

    static async fromImageAsync(image) {
        assertImage(image);
        return fetch(image.src).then((response) => {
            return response.blob();
        }).then((blob) => {
            assertBlob(blob);
            return blob.arrayBuffer();
        }).then((buffer) => {
            return new GifDecoder(buffer);
        });
    }

    static fromFileAsync(file) {
        assertFile(file);
        return file.arrayBuffer().then((buffer) => {
            return new GifDecoder(buffer);
        });
    }

    static getDisposalMethodLabels() {
        return [
            'Unspecified',
            'Do Not Dispose',
            'Restore to Background',
            'Restore to Previous',
        ];
    }
}