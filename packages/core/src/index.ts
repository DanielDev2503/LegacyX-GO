export const CORE_TICK_RATE = 60;
export const CORE_DT = 1 / 60;

export function pingCore(): string {
  return "LegacyX Core Engine ready (60 Hz tick-rate)";
}
