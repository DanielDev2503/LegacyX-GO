export type PointerEventType =
  | 'pointerdown'
  | 'pointermove'
  | 'pointerup'
  | 'pointercancel';

export type PointerDeviceType = 'touch' | 'mouse' | 'pen';

export interface MakePointerEventOptions {
  pointerId: number;
  clientX: number;
  clientY: number;
  pointerType?: PointerDeviceType;
  target?: unknown;
  buttons?: number;
  isPrimary?: boolean;
}

export interface SyntheticPointerEvent {
  type: PointerEventType;
  pointerId: number;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  offsetX: number;
  offsetY: number;
  pointerType: PointerDeviceType;
  target: unknown;
  currentTarget: unknown;
  buttons: number;
  button: number;
  isPrimary: boolean;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  immediatePropagationStopped: boolean;
  timeStamp: number;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}

export interface PointerDispatchTarget {
  dispatchEvent: (event: any) => boolean;
}

export function makePointerEvent(
  type: PointerEventType,
  opts: MakePointerEventOptions
): SyntheticPointerEvent {
  const defaultButtons = type === 'pointerup' || type === 'pointercancel' ? 0 : 1;
  const ev: SyntheticPointerEvent = {
    type,
    pointerId: opts.pointerId,
    clientX: opts.clientX,
    clientY: opts.clientY,
    pageX: opts.clientX,
    pageY: opts.clientY,
    offsetX: opts.clientX,
    offsetY: opts.clientY,
    pointerType: opts.pointerType ?? 'touch',
    target: opts.target ?? null,
    currentTarget: opts.target ?? null,
    buttons: opts.buttons ?? defaultButtons,
    button: 0,
    isPrimary: opts.isPrimary ?? opts.pointerId === 1,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    timeStamp: Date.now(),
    preventDefault() {
      ev.defaultPrevented = true;
    },
    stopPropagation() {
      ev.propagationStopped = true;
    },
    stopImmediatePropagation() {
      ev.immediatePropagationStopped = true;
    }
  };
  return ev;
}

export function dispatchPointerSequence(
  target: PointerDispatchTarget,
  events: SyntheticPointerEvent[]
): SyntheticPointerEvent[] {
  for (const ev of events) {
    if (ev.target == null) {
      ev.target = target;
    }
    ev.currentTarget = target;
    target.dispatchEvent(ev);
  }
  return events;
}

export function gestureTap(
  target: PointerDispatchTarget,
  opts: {
    pointerId?: number;
    x: number;
    y: number;
    pointerType?: PointerDeviceType;
  }
): SyntheticPointerEvent[] {
  const pointerId = opts.pointerId ?? 1;
  const pointerType = opts.pointerType ?? 'touch';
  const events = [
    makePointerEvent('pointerdown', {
      pointerId,
      clientX: opts.x,
      clientY: opts.y,
      pointerType,
      target
    }),
    makePointerEvent('pointerup', {
      pointerId,
      clientX: opts.x,
      clientY: opts.y,
      pointerType,
      target
    })
  ];
  return dispatchPointerSequence(target, events);
}

export function gestureHold(
  target: PointerDispatchTarget,
  opts: {
    pointerId?: number;
    x: number;
    y: number;
    pointerType?: PointerDeviceType;
  }
) {
  const pointerId = opts.pointerId ?? 1;
  const pointerType = opts.pointerType ?? 'touch';
  let curX = opts.x;
  let curY = opts.y;

  const downEvent = makePointerEvent('pointerdown', {
    pointerId,
    clientX: curX,
    clientY: curY,
    pointerType,
    target
  });
  dispatchPointerSequence(target, [downEvent]);

  return {
    pointerId,
    downEvent,
    moveTo(x: number, y: number) {
      curX = x;
      curY = y;
      const ev = makePointerEvent('pointermove', {
        pointerId,
        clientX: x,
        clientY: y,
        pointerType,
        target
      });
      dispatchPointerSequence(target, [ev]);
      return ev;
    },
    release(x: number = curX, y: number = curY) {
      const ev = makePointerEvent('pointerup', {
        pointerId,
        clientX: x,
        clientY: y,
        pointerType,
        target
      });
      dispatchPointerSequence(target, [ev]);
      return ev;
    },
    cancel(x: number = curX, y: number = curY) {
      const ev = makePointerEvent('pointercancel', {
        pointerId,
        clientX: x,
        clientY: y,
        pointerType,
        target
      });
      dispatchPointerSequence(target, [ev]);
      return ev;
    }
  };
}

export function gestureSwipe(
  target: PointerDispatchTarget,
  opts: {
    pointerId?: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    steps?: number;
    release?: boolean;
    pointerType?: PointerDeviceType;
  }
): SyntheticPointerEvent[] {
  const pointerId = opts.pointerId ?? 1;
  const pointerType = opts.pointerType ?? 'touch';
  const steps = Math.max(1, opts.steps ?? 5);
  const events: SyntheticPointerEvent[] = [
    makePointerEvent('pointerdown', {
      pointerId,
      clientX: opts.fromX,
      clientY: opts.fromY,
      pointerType,
      target
    })
  ];

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = opts.fromX + (opts.toX - opts.fromX) * t;
    const y = opts.fromY + (opts.toY - opts.fromY) * t;
    events.push(
      makePointerEvent('pointermove', {
        pointerId,
        clientX: x,
        clientY: y,
        pointerType,
        target
      })
    );
  }

  if (opts.release !== false) {
    events.push(
      makePointerEvent('pointerup', {
        pointerId,
        clientX: opts.toX,
        clientY: opts.toY,
        pointerType,
        target
      })
    );
  }

  return dispatchPointerSequence(target, events);
}
