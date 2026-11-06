import { OP_INPUT } from './BinaryProtocol';
import {
  INPUT_TURBO,
  INPUT_DASH,
  INPUT_MAGNUS_LEFT,
  INPUT_MAGNUS_RIGHT,
  INPUT_TYPING,
  INPUT_MOUSE_DIR,
  INPUT_FOCUS_BALL
} from '../game/Player';

export interface InputData {
  sequence: number;
  inputMask: number;
  clientTimestamp: number;
  curveInput?: number | undefined; // 00 (ninguno), 01 (Z - Izquierda), 10 (C - Derecha)
  curveX?: number | undefined;
  curveY?: number | undefined;
  isTurbo?: boolean | undefined;
  triggerDash?: boolean | undefined;
  isTyping?: boolean | undefined;
  useMouseDir?: boolean | undefined;
  dirX?: number | undefined;
  dirY?: number | undefined;
  isFocusingBall?: boolean | undefined;
}

export class InputPacket {
  public static readonly BYTE_LENGTH = 9;

  /**
   * Encodes an input message into a clean 9-byte ArrayBuffer without bit overlap.
   * Byte 0: OP_INPUT (0x01)
   * Bytes 1-4: sequence (uint32)
   * Bytes 5-6: inputMask (uint16: bits 0-11 sin colisiones)
   *   Bit 0: ArrowUp
   *   Bit 1: ArrowDown
   *   Bit 2: ArrowLeft
   *   Bit 3: ArrowRight
   *   Bit 4: Kick (X)
   *   Bit 5: Turbo (Shift)
   *   Bit 6: DashTrigger (Space) — Flanco ascendente exclusivo
   *   Bit 7: MagnusLeft (Z)
   *   Bit 8: MagnusRight (C)
   *   Bit 9: Chat Typing Indicator
   *   Bit 10: Continuous 360° Mouse Movement (when set, bytes 7-8 hold int8 dirX, dirY)
   *   Bit 11: Focus Ball (Hold)
   * Bytes 7-8: clientTimestamp (uint16) OR (int8 dirX, int8 dirY) if Bit 10 is set
   */
  public static encode(data: InputData, buffer?: ArrayBuffer): ArrayBuffer {
    const buf = buffer ?? new ArrayBuffer(InputPacket.BYTE_LENGTH);
    const view = new DataView(buf);

    view.setUint8(0, OP_INPUT);
    view.setUint32(1, data.sequence, false); // Big-endian

    let mask = data.inputMask || 0;
    if (data.isTurbo) mask |= INPUT_TURBO;
    if (data.triggerDash) mask |= INPUT_DASH;
    if (data.curveInput === 1 || data.curveX === -1) mask |= INPUT_MAGNUS_LEFT;
    if (data.curveInput === 2 || data.curveX === 1) mask |= INPUT_MAGNUS_RIGHT;
    if (data.isTyping) mask |= INPUT_TYPING;
    if (data.isFocusingBall) mask |= INPUT_FOCUS_BALL;
    if (data.useMouseDir) mask |= INPUT_MOUSE_DIR;

    view.setUint16(5, mask, false);
    if ((mask & INPUT_MOUSE_DIR) !== 0) {
      const qx = Math.max(-127, Math.min(127, Math.round((data.dirX ?? 0) * 127)));
      const qy = Math.max(-127, Math.min(127, Math.round((data.dirY ?? 0) * 127)));
      view.setInt8(7, qx);
      view.setInt8(8, qy);
    } else {
      view.setUint16(7, data.clientTimestamp, false);
    }

    return buf;
  }

  /**
   * Decodes an input message from a DataView or ArrayBuffer with backwards compatibility for 8-byte packets.
   */
  public static decode(buffer: ArrayBuffer | DataView): InputData | null {
    const view = buffer instanceof DataView ? buffer : new DataView(buffer);

    if (view.byteLength < 8) return null;
    if (view.getUint8(0) !== OP_INPUT) return null;

    const sequence = view.getUint32(1, false);

    let inputMask = 0;
    let clientTimestamp = 0;
    let useMouseDir = false;
    let dirX: number | undefined = undefined;
    let dirY: number | undefined = undefined;

    if (view.byteLength >= 9) {
      inputMask = view.getUint16(5, false);
      if ((inputMask & INPUT_MOUSE_DIR) !== 0) {
        useMouseDir = true;
        dirX = view.getInt8(7) / 127;
        dirY = view.getInt8(8) / 127;
      } else {
        clientTimestamp = view.getUint16(7, false);
      }
    } else {
      // Legacy 8-byte fallback
      inputMask = view.getUint8(5);
      clientTimestamp = view.getUint16(6, false);
    }

    const isTurbo = (inputMask & INPUT_TURBO) !== 0;
    const triggerDash = (inputMask & INPUT_DASH) !== 0;
    const magnusLeft = (inputMask & INPUT_MAGNUS_LEFT) !== 0;
    const magnusRight = (inputMask & INPUT_MAGNUS_RIGHT) !== 0;
    const isTyping = (inputMask & INPUT_TYPING) !== 0;
    const isFocusingBall = (inputMask & INPUT_FOCUS_BALL) !== 0;

    const curveInput = magnusLeft ? 1 : (magnusRight ? 2 : 0);
    const curveX = magnusLeft ? -1 : (magnusRight ? 1 : 0);
    const curveY = 0;

    return {
      sequence,
      inputMask,
      clientTimestamp,
      curveInput,
      curveX,
      curveY,
      isTurbo,
      triggerDash,
      isTyping,
      useMouseDir,
      dirX,
      dirY,
      isFocusingBall
    };
  }
}
