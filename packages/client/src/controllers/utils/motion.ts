export function animate(
  _target: unknown,
  _keyframes?: unknown,
  _options?: unknown
): { finished: Promise<void>; stop: () => void; cancel: () => void } {
  return {
    finished: Promise.resolve(),
    stop: () => {},
    cancel: () => {}
  };
}
