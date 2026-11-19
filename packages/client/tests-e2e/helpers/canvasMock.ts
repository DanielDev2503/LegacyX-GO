export interface CanvasOp {
  op: string;
  args: unknown[];
}

type Matrix2D = [number, number, number, number, number, number];

interface CanvasStateSnapshot {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  miterLimit: number;
  lineDashOffset: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  globalCompositeOperation: string;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  imageSmoothingEnabled: boolean;
  lineDash: number[];
  matrix: Matrix2D;
}

function multiplyMatrix(m: Matrix2D, n: Matrix2D): Matrix2D {
  const [a, b, c, d, e, f] = m;
  const [na, nb, nc, nd, ne, nf] = n;
  return [
    a * na + c * nb,
    b * na + d * nb,
    a * nc + c * nd,
    b * nc + d * nd,
    a * ne + c * nf + e,
    b * ne + d * nf + f
  ];
}

export function createMockCanvas(width: number, height: number) {
  const ops: CanvasOp[] = [];
  const listeners = new Map<string, Array<(ev: any) => void>>();
  let lineDash: number[] = [];
  let matrix: Matrix2D = [1, 0, 0, 1, 0, 0];
  const stateStack: CanvasStateSnapshot[] = [];

  const record = (op: string, ...args: unknown[]) => {
    ops.push({ op, args });
  };

  const canvas: Record<string, any> = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {} as Record<string, string>,
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        right: canvas.clientWidth,
        bottom: canvas.clientHeight,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        }
      };
    },
    addEventListener(type: string, cb: (ev: any) => void) {
      const list = listeners.get(type) ?? [];
      list.push(cb);
      listeners.set(type, list);
    },
    removeEventListener(type: string, cb: (ev: any) => void) {
      const list = listeners.get(type);
      if (!list) return;
      listeners.set(
        type,
        list.filter((fn) => fn !== cb)
      );
    },
    dispatchEvent(ev: any) {
      const list = listeners.get(ev?.type);
      if (!list) return true;
      for (const cb of [...list]) cb(ev);
      return !ev?.defaultPrevented;
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    getContext(contextId: string) {
      return contextId === '2d' ? ctx : null;
    }
  };

  const createGradient = () => ({
    addColorStop(_offset: number, _color: string) {}
  });

  const ctx: Record<string, any> = {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    lineDashOffset: 0,
    font: '12px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,

    save() {
      stateStack.push({
        fillStyle: ctx.fillStyle,
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
        lineCap: ctx.lineCap,
        lineJoin: ctx.lineJoin,
        miterLimit: ctx.miterLimit,
        lineDashOffset: ctx.lineDashOffset,
        font: ctx.font,
        textAlign: ctx.textAlign,
        textBaseline: ctx.textBaseline,
        globalAlpha: ctx.globalAlpha,
        globalCompositeOperation: ctx.globalCompositeOperation,
        shadowBlur: ctx.shadowBlur,
        shadowColor: ctx.shadowColor,
        shadowOffsetX: ctx.shadowOffsetX,
        shadowOffsetY: ctx.shadowOffsetY,
        imageSmoothingEnabled: ctx.imageSmoothingEnabled,
        lineDash: [...lineDash],
        matrix: [...matrix] as Matrix2D
      });
      record('save');
    },
    restore() {
      record('restore');
      const prev = stateStack.pop();
      if (!prev) return;
      ctx.fillStyle = prev.fillStyle;
      ctx.strokeStyle = prev.strokeStyle;
      ctx.lineWidth = prev.lineWidth;
      ctx.lineCap = prev.lineCap;
      ctx.lineJoin = prev.lineJoin;
      ctx.miterLimit = prev.miterLimit;
      ctx.lineDashOffset = prev.lineDashOffset;
      ctx.font = prev.font;
      ctx.textAlign = prev.textAlign;
      ctx.textBaseline = prev.textBaseline;
      ctx.globalAlpha = prev.globalAlpha;
      ctx.globalCompositeOperation = prev.globalCompositeOperation;
      ctx.shadowBlur = prev.shadowBlur;
      ctx.shadowColor = prev.shadowColor;
      ctx.shadowOffsetX = prev.shadowOffsetX;
      ctx.shadowOffsetY = prev.shadowOffsetY;
      ctx.imageSmoothingEnabled = prev.imageSmoothingEnabled;
      lineDash = [...prev.lineDash];
      matrix = [...prev.matrix] as Matrix2D;
    },
    translate(x: number, y: number) {
      matrix = multiplyMatrix(matrix, [1, 0, 0, 1, x, y]);
      record('translate', x, y);
    },
    scale(x: number, y: number) {
      matrix = multiplyMatrix(matrix, [x, 0, 0, y, 0, 0]);
      record('scale', x, y);
    },
    rotate(angle: number) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      matrix = multiplyMatrix(matrix, [cos, sin, -sin, cos, 0, 0]);
      record('rotate', angle);
    },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      matrix = multiplyMatrix(matrix, [a, b, c, d, e, f]);
      record('transform', a, b, c, d, e, f);
    },
    setTransform(...args: unknown[]) {
      if (args.length === 1 && args[0] && typeof args[0] === 'object') {
        const m = args[0] as Record<string, number | undefined>;
        matrix = [
          m.a ?? m.m11 ?? 1,
          m.b ?? m.m12 ?? 0,
          m.c ?? m.m21 ?? 0,
          m.d ?? m.m22 ?? 1,
          m.e ?? m.m41 ?? 0,
          m.f ?? m.m42 ?? 0
        ];
      } else if (args.length >= 6) {
        matrix = [
          Number(args[0]),
          Number(args[1]),
          Number(args[2]),
          Number(args[3]),
          Number(args[4]),
          Number(args[5])
        ];
      }
      record('setTransform', ...args);
    },
    resetTransform() {
      matrix = [1, 0, 0, 1, 0, 0];
      record('resetTransform');
    },
    getTransform() {
      const [a, b, c, d, e, f] = matrix;
      return {
        a,
        b,
        c,
        d,
        e,
        f,
        m11: a,
        m12: b,
        m21: c,
        m22: d,
        m41: e,
        m42: f
      };
    },
    beginPath() {
      record('beginPath');
    },
    closePath() {
      record('closePath');
    },
    moveTo(x: number, y: number) {
      record('moveTo', x, y);
    },
    lineTo(x: number, y: number) {
      record('lineTo', x, y);
    },
    arc(
      x: number,
      y: number,
      radius: number,
      startAngle: number,
      endAngle: number,
      counterclockwise?: boolean
    ) {
      record('arc', x, y, radius, startAngle, endAngle, counterclockwise ?? false);
    },
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number) {
      record('arcTo', x1, y1, x2, y2, radius);
    },
    ellipse(
      x: number,
      y: number,
      rx: number,
      ry: number,
      rot: number,
      startAngle: number,
      endAngle: number,
      ccw?: boolean
    ) {
      record('ellipse', x, y, rx, ry, rot, startAngle, endAngle, ccw ?? false);
    },
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
      record('quadraticCurveTo', cpx, cpy, x, y);
    },
    bezierCurveTo(
      cp1x: number,
      cp1y: number,
      cp2x: number,
      cp2y: number,
      x: number,
      y: number
    ) {
      record('bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y);
    },
    rect(x: number, y: number, w: number, h: number) {
      record('rect', x, y, w, h);
    },
    roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]) {
      record('roundRect', x, y, w, h, radii ?? 0);
    },
    fill(...args: unknown[]) {
      record('fill', ...args);
    },
    stroke(...args: unknown[]) {
      record('stroke', ...args);
    },
    clip(...args: unknown[]) {
      record('clip', ...args);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      record('fillRect', x, y, w, h);
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      record('strokeRect', x, y, w, h);
    },
    clearRect(x: number, y: number, w: number, h: number) {
      record('clearRect', x, y, w, h);
    },
    fillText(text: string, x: number, y: number, maxWidth?: number) {
      record('fillText', text, x, y, maxWidth);
    },
    strokeText(text: string, x: number, y: number, maxWidth?: number) {
      record('strokeText', text, x, y, maxWidth);
    },
    drawImage(...args: unknown[]) {
      record('drawImage', ...args);
    },
    setLineDash(segments: number[]) {
      const copy = [...segments];
      lineDash = copy;
      record('setLineDash', [...copy]);
    },
    getLineDash() {
      return [...lineDash];
    },
    measureText(text: string) {
      const str = String(text);
      return {
        width: str.length * 7,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 3
      };
    },
    createLinearGradient: createGradient,
    createRadialGradient: createGradient,
    createConicGradient: createGradient,
    createPattern() {
      return {};
    }
  };

  return { canvas, ctx, ops };
}
