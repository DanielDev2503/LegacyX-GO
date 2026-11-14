/**
 * Muxer EBML/WebM puro en TypeScript (cero dependencias externas) para VideoEncoder (WebCodecs).
 *
 * Permite escribir chunks de VP8 / VP9 con timestamps deterministas exactos en milisegundos,
 * duración real backpatched en `Info` y clusters indexados por `Cues` sin sufrir deriva ni
 * congelamientos del reloj real propios de `MediaRecorder(captureStream)`.
 */

export type WebmVideoCodec = 'V_VP9' | 'V_VP8';

export interface WebmMuxerOptions {
  width: number;
  height: number;
  fps: number;
  codec: WebmVideoCodec;
}

interface CuePointRecord {
  timeMs: number;
  clusterPos: number;
}

const ID_EBML = [0x1a, 0x45, 0xdf, 0xa3];
const ID_EBML_VERSION = [0x42, 0x86];
const ID_EBML_READ_VERSION = [0x42, 0xf7];
const ID_EBML_MAX_ID_LEN = [0x42, 0xf2];
const ID_EBML_MAX_SIZE_LEN = [0x42, 0xf3];
const ID_DOC_TYPE = [0x42, 0x82];
const ID_DOC_TYPE_VERSION = [0x42, 0x87];
const ID_DOC_TYPE_READ_VERSION = [0x42, 0x85];

const ID_SEGMENT = [0x18, 0x53, 0x80, 0x67];
const ID_INFO = [0x15, 0x49, 0xa9, 0x66];
const ID_TIMECODE_SCALE = [0x2a, 0xd7, 0xb1];
const ID_MUXING_APP = [0x4d, 0x80];
const ID_WRITING_APP = [0x57, 0x41];
const ID_DURATION = [0x44, 0x89];

const ID_TRACKS = [0x16, 0x54, 0xae, 0x6b];
const ID_TRACK_ENTRY = [0xae];
const ID_TRACK_NUMBER = [0xd7];
const ID_TRACK_UID = [0x73, 0xc5];
const ID_TRACK_TYPE = [0x83];
const ID_CODEC_ID = [0x86];
const ID_DEFAULT_DURATION = [0x23, 0xe3, 0x83];
const ID_VIDEO = [0xe0];
const ID_PIXEL_WIDTH = [0xb0];
const ID_PIXEL_HEIGHT = [0xba];
const ID_FLAG_INTERLACED = [0x9a];

const ID_CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
const ID_CLUSTER_TIMECODE = [0xe7];
const ID_SIMPLE_BLOCK = [0xa3];

const ID_CUES = [0x1c, 0x53, 0xbb, 0x6b];
const ID_CUE_POINT = [0xbb];
const ID_CUE_TIME = [0xb3];
const ID_CUE_TRACK_POSITIONS = [0xb7];
const ID_CUE_TRACK = [0xf7];
const ID_CUE_CLUSTER_POSITION = [0xf1];

const MAX_CLUSTER_DURATION_MS = 30_000;
const TARGET_KEYFRAME_CLUSTER_GAP_MS = 2_000;
const TIMECODE_SCALE_NS = 1_000_000; // 1 tick = 1 ms

const utf8Encoder = new TextEncoder();

function encodeVintLength(size: number): Uint8Array {
  const safe = Math.max(0, Math.floor(size));
  for (let width = 1; width <= 8; width++) {
    const limit = width <= 7 ? 2 ** (7 * width) - 1 : Number.MAX_SAFE_INTEGER;
    if (safe < limit) {
      const out = new Uint8Array(width);
      let remaining = BigInt(safe);
      for (let i = width - 1; i >= 0; i--) {
        out[i] = Number(remaining & 0xffn);
        remaining >>= 8n;
      }
      out[0] |= 1 << (8 - width);
      return out;
    }
  }
  return writeFixed8ByteVint(safe);
}

function writeFixed8ByteVint(value: number, target?: Uint8Array): Uint8Array {
  const out = target ?? new Uint8Array(8);
  let remaining = BigInt(Math.max(0, Math.floor(value)));
  for (let i = 7; i >= 1; i--) {
    out[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  out[0] = 0x01 | Number(remaining & 0x00n);
  return out;
}

function encodeUint(value: number): Uint8Array {
  const safe = Math.max(0, Math.floor(value));
  if (safe === 0) return new Uint8Array([0]);
  const bytes: number[] = [];
  let rem = BigInt(safe);
  while (rem > 0n) {
    bytes.unshift(Number(rem & 0xffn));
    rem >>= 8n;
  }
  return new Uint8Array(bytes);
}

function encodeAscii(str: string): Uint8Array {
  return utf8Encoder.encode(str);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

function makeElement(id: number[], ...children: Uint8Array[]): Uint8Array {
  const body = children.length === 1 ? children[0]! : concatBytes(...children);
  const sizeVint = encodeVintLength(body.byteLength);
  const out = new Uint8Array(id.length + sizeVint.byteLength + body.byteLength);
  out.set(id, 0);
  out.set(sizeVint, id.length);
  out.set(body, id.length + sizeVint.byteLength);
  return out;
}

/**
 * Escritor streaming en memoria para contenedores WebM (VP8 / VP9) sin dependencias.
 */
export class WebmMuxer {
  private readonly chunks: Uint8Array[] = [];
  private readonly durationBytes: Uint8Array;
  private readonly segmentSizeBytes = new Uint8Array(8);
  private readonly fps: number;
  private readonly mimeType: string;

  private segmentBodyBytes = 0;
  private currentClusterSizeBytes: Uint8Array | null = null;
  private currentClusterBodyBytes = 0;
  private currentClusterStartMs = 0;
  private lastTimestampMs = 0;
  private frameCount = 0;
  private finalized = false;
  private readonly cues: CuePointRecord[] = [];

  constructor(options: WebmMuxerOptions) {
    this.fps = Math.max(1, options.fps);
    this.mimeType = options.codec === 'V_VP9' ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8';

    const ebmlHeader = makeElement(
      ID_EBML,
      makeElement(ID_EBML_VERSION, encodeUint(1)),
      makeElement(ID_EBML_READ_VERSION, encodeUint(1)),
      makeElement(ID_EBML_MAX_ID_LEN, encodeUint(4)),
      makeElement(ID_EBML_MAX_SIZE_LEN, encodeUint(8)),
      makeElement(ID_DOC_TYPE, encodeAscii('webm')),
      makeElement(ID_DOC_TYPE_VERSION, encodeUint(2)),
      makeElement(ID_DOC_TYPE_READ_VERSION, encodeUint(2))
    );
    this.chunks.push(ebmlHeader);

    // Segment header con tamaño 8-byte VINT reservado para backpatch al finalizar
    this.chunks.push(new Uint8Array(ID_SEGMENT));
    this.chunks.push(this.segmentSizeBytes);

    const durationHeader = new Uint8Array([...ID_DURATION, 0x88]);
    const infoElement = makeElement(
      ID_INFO,
      makeElement(ID_TIMECODE_SCALE, encodeUint(TIMECODE_SCALE_NS)),
      makeElement(ID_MUXING_APP, encodeAscii('LegacyX-GO')),
      makeElement(ID_WRITING_APP, encodeAscii('LegacyX-WebmMuxer')),
      durationHeader,
      new Uint8Array(8)
    );
    // Apuntar al slice real dentro de infoElement para que el backpatch escriba dentro del chunk emitido
    this.durationBytes = infoElement.subarray(infoElement.byteLength - 8);
    this.pushSegmentBodyChunk(infoElement);

    const defaultDurationNs = Math.round(1_000_000_000 / this.fps);
    const tracksElement = makeElement(
      ID_TRACKS,
      makeElement(
        ID_TRACK_ENTRY,
        makeElement(ID_TRACK_NUMBER, encodeUint(1)),
        makeElement(ID_TRACK_UID, encodeUint(1)),
        makeElement(ID_TRACK_TYPE, encodeUint(1)),
        makeElement(ID_CODEC_ID, encodeAscii(options.codec)),
        makeElement(ID_DEFAULT_DURATION, encodeUint(defaultDurationNs)),
        makeElement(
          ID_VIDEO,
          makeElement(ID_PIXEL_WIDTH, encodeUint(Math.max(2, Math.round(options.width)))),
          makeElement(ID_PIXEL_HEIGHT, encodeUint(Math.max(2, Math.round(options.height)))),
          makeElement(ID_FLAG_INTERLACED, encodeUint(2))
        )
      )
    );
    this.pushSegmentBodyChunk(tracksElement);
  }

  private pushSegmentBodyChunk(bytes: Uint8Array, insideCluster: boolean = false): void {
    this.chunks.push(bytes);
    this.segmentBodyBytes += bytes.byteLength;
    if (insideCluster) {
      this.currentClusterBodyBytes += bytes.byteLength;
    }
  }

  private closeCurrentCluster(): void {
    if (!this.currentClusterSizeBytes) return;
    writeFixed8ByteVint(this.currentClusterBodyBytes, this.currentClusterSizeBytes);
    this.currentClusterSizeBytes = null;
    this.currentClusterBodyBytes = 0;
  }

  private openCluster(startMs: number, recordCue: boolean): void {
    this.closeCurrentCluster();
    const clusterPos = this.segmentBodyBytes;
    if (recordCue) {
      this.cues.push({ timeMs: startMs, clusterPos });
    }
    this.pushSegmentBodyChunk(new Uint8Array(ID_CLUSTER), false);
    this.currentClusterSizeBytes = new Uint8Array(8);
    this.pushSegmentBodyChunk(this.currentClusterSizeBytes, false);
    this.currentClusterBodyBytes = 0;
    this.currentClusterStartMs = startMs;

    const timecodeEl = makeElement(ID_CLUSTER_TIMECODE, encodeUint(startMs));
    this.pushSegmentBodyChunk(timecodeEl, true);
  }

  /**
   * Añade un frame codificado (`EncodedVideoChunk` o buffer plano) con timestamp determinista en microsegundos.
   */
  public addVideoFrame(data: Uint8Array, isKeyFrame: boolean, timestampUs: number): void {
    if (this.finalized || data.byteLength === 0) return;

    const rawMs = Math.max(0, Math.round(timestampUs / 1000));
    const tsMs = this.frameCount === 0 ? rawMs : Math.max(this.lastTimestampMs, rawMs);
    this.lastTimestampMs = tsMs;

    const relToCluster = tsMs - this.currentClusterStartMs;
    const shouldStartNewCluster =
      this.currentClusterSizeBytes == null ||
      relToCluster >= MAX_CLUSTER_DURATION_MS ||
      (isKeyFrame && relToCluster >= TARGET_KEYFRAME_CLUSTER_GAP_MS);

    if (shouldStartNewCluster) {
      this.openCluster(tsMs, isKeyFrame || this.frameCount === 0);
    }

    const relMs = tsMs - this.currentClusterStartMs;
    const blockBodySize = 4 + data.byteLength;
    const sizeVint = encodeVintLength(blockBodySize);
    const blockHeader = new Uint8Array(ID_SIMPLE_BLOCK.length + sizeVint.byteLength + 4);
    blockHeader.set(ID_SIMPLE_BLOCK, 0);
    blockHeader.set(sizeVint, ID_SIMPLE_BLOCK.length);
    const hdrOffset = ID_SIMPLE_BLOCK.length + sizeVint.byteLength;
    blockHeader[hdrOffset] = 0x81; // Track #1 VINT
    blockHeader[hdrOffset + 1] = (relMs >> 8) & 0xff;
    blockHeader[hdrOffset + 2] = relMs & 0xff;
    blockHeader[hdrOffset + 3] = isKeyFrame ? 0x80 : 0x00;

    this.pushSegmentBodyChunk(blockHeader, true);
    this.pushSegmentBodyChunk(data, true);
    this.frameCount++;
  }

  /**
   * Cierra el último cluster, emite índice `Cues`, backpatchea `Duration` y tamaño del `Segment`,
   * y devuelve un `Blob` WebM listo para descargar o reproducir.
   */
  public finalize(explicitDurationMs?: number): Blob {
    if (!this.finalized) {
      this.closeCurrentCluster();

      if (this.cues.length > 0) {
        const cuePoints = this.cues.map((cue) =>
          makeElement(
            ID_CUE_POINT,
            makeElement(ID_CUE_TIME, encodeUint(cue.timeMs)),
            makeElement(
              ID_CUE_TRACK_POSITIONS,
              makeElement(ID_CUE_TRACK, encodeUint(1)),
              makeElement(ID_CUE_CLUSTER_POSITION, encodeUint(cue.clusterPos))
            )
          )
        );
        this.pushSegmentBodyChunk(makeElement(ID_CUES, ...cuePoints), false);
      }

      const nominalFrameMs = 1000 / this.fps;
      const computedDurationMs =
        explicitDurationMs != null && Number.isFinite(explicitDurationMs) && explicitDurationMs > 0
          ? explicitDurationMs
          : this.frameCount > 0
            ? this.lastTimestampMs + nominalFrameMs
            : 0;
      const durView = new DataView(
        this.durationBytes.buffer,
        this.durationBytes.byteOffset,
        this.durationBytes.byteLength
      );
      durView.setFloat64(0, Math.max(0, computedDurationMs), false);

      writeFixed8ByteVint(this.segmentBodyBytes, this.segmentSizeBytes);
      this.finalized = true;
    }

    return new Blob(this.chunks as unknown as BlobPart[], { type: this.mimeType });
  }
}
