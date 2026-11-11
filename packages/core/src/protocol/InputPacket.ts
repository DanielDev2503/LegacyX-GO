import { OP_INPUT } from './BinaryProtocol';
import {
  INPUT_TURBO,
  INPUT_DASH,
  INPUT_MAGNUS_LEFT,
  INPUT_MAGNUS_RIGHT,
  INPUT_TYPING,
  INPUT_MOUSE_AIM,
  INPUT_MOUSE_ACTIVE
} from '../game/Player';

export const AIM_ANGLE_NULL_SENTINEL = 0xFF; // Sentinel para indicar aimAngle = null

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
  aimAngle?: number | null | undefined;    // Ángulo continuo en radianes [-PI, PI] o null si teclado/inactivo
  aimThrottle?: number | undefined; // Magnitud proporcional [0..1] (amortiguación fina cerca del cursor)
}

export class InputPacket {
  public static readonly BYTE_LENGTH = 9;
  public static readonly MOUSE_BYTE_LENGTH = 12;

  /**
   * Encodes an input message into a clean 9-byte ArrayBuffer (or 12-byte when INPUT_MOUSE_ACTIVE is active).
   * Byte 0: OP_INPUT (0x01)
   * Bytes 1-4: sequence (uint32)
   * Bytes 5-6: inputMask (uint16: bits 0-10 sin colisiones)
   *   Bit 0..9: teclas y acciones
   *   Bit 10: INPUT_MOUSE_AIM / INPUT_MOUSE_ACTIVE (vector continuo 360°)
   * Bytes 7-8: clientTimestamp (uint16)
   * Optional Bytes 9-10: quantized aimAngle int16 (rad * 10000)
   * Optional Byte 11: quantized aimThrottle uint8 (0..255, 0xFF = centinela null)
   */
  public static encode(data: InputData, buffer?: ArrayBuffer): ArrayBuffer {
    let mask = data.inputMask || 0;
    if (data.isTurbo) mask |= INPUT_TURBO;
    if (data.triggerDash) mask |= INPUT_DASH;
    if (data.curveInput === 1 || data.curveX === -1) mask |= INPUT_MAGNUS_LEFT;
    if (data.curveInput === 2 || data.curveX === 1) mask |= INPUT_MAGNUS_RIGHT;
    if (data.isTyping) mask |= INPUT_TYPING;

    const hasMouseAim =
      Boolean((mask & (INPUT_MOUSE_AIM | INPUT_MOUSE_ACTIVE))) &&
      data.aimAngle !== null &&
      data.aimAngle !== undefined &&
      (data.aimThrottle ?? 0) > 0;

    if (hasMouseAim) {
      mask |= INPUT_MOUSE_ACTIVE;
    } else {
      mask &= ~(INPUT_MOUSE_ACTIVE | INPUT_MOUSE_AIM);
    }

    const neededBytes = hasMouseAim ? InputPacket.MOUSE_BYTE_LENGTH : InputPacket.BYTE_LENGTH;
    const buf =
      buffer && buffer.byteLength === neededBytes
        ? buffer
        : new ArrayBuffer(neededBytes);
    const view = new DataView(buf);

    view.setUint8(0, OP_INPUT);
    view.setUint32(1, data.sequence, false);
    view.setUint16(5, mask, false);
    view.setUint16(7, data.clientTimestamp & 0xffff, false);

    if (hasMouseAim) {
      const qAngle = Math.max(-32767, Math.min(32767, Math.round((data.aimAngle ?? 0) * 10000)));
      const qThrottle = Math.max(0, Math.min(254, Math.round((data.aimThrottle ?? 1) * 255)));
      view.setInt16(9, qAngle, false);
      view.setUint8(11, qThrottle);
    }

    return buf;
  }

  /**
   * Decodes an input message from a DataView or ArrayBuffer with backwards compatibility for 8/9/12-byte packets.
   */
  public static decode(buffer: ArrayBuffer | DataView): InputData | null {
    const view = buffer instanceof DataView ? buffer : new DataView(buffer);

    if (view.byteLength < 8) return null;
    if (view.getUint8(0) !== OP_INPUT) return null;

    const sequence = view.getUint32(1, false);

    let inputMask = 0;
    let clientTimestamp = 0;

    if (view.byteLength >= 9) {
      inputMask = view.getUint16(5, false);
      clientTimestamp = view.getUint16(7, false);
    } else {
      inputMask = view.getUint8(5);
      clientTimestamp = view.getUint16(6, false);
    }

    const isTurbo = (inputMask & INPUT_TURBO) !== 0;
    const triggerDash = (inputMask & INPUT_DASH) !== 0;
    const magnusLeft = (inputMask & INPUT_MAGNUS_LEFT) !== 0;
    const magnusRight = (inputMask & INPUT_MAGNUS_RIGHT) !== 0;
    const isTyping = (inputMask & INPUT_TYPING) !== 0;
    const hasMouseAim = (inputMask & (INPUT_MOUSE_AIM | INPUT_MOUSE_ACTIVE)) !== 0 && view.byteLength >= InputPacket.MOUSE_BYTE_LENGTH;

    const curveInput = magnusLeft ? 1 : (magnusRight ? 2 : 0);
    const curveX = magnusLeft ? -1 : (magnusRight ? 1 : 0);
    const curveY = 0;

    let aimAngle: number | null = null;
    let aimThrottle: number | undefined = undefined;
    if (hasMouseAim) {
      const qAngle = view.getInt16(9, false);
      const qThrottle = view.getUint8(11);
      if (qThrottle === AIM_ANGLE_NULL_SENTINEL || qAngle === 0x7fff || qThrottle === 0) {
        aimAngle = null;
        aimThrottle = 0;
      } else {
        aimAngle = qAngle / 10000;
        aimThrottle = qThrottle / 255;
      }
    }

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
      aimAngle: aimAngle ?? undefined,
      aimThrottle
    };
  }
}
