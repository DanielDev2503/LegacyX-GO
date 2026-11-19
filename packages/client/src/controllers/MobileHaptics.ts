import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { gameUI } from '../ui/state/gameUI.svelte.js';

export type HapticStrength = 'light' | 'medium' | 'heavy' | 'selection';

const WEB_VIBRATE_MS: Record<HapticStrength, number> = {
  light: 12,
  medium: 24,
  heavy: 45,
  selection: 8
};

function safeIsNativePlatform(): boolean {
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export class MobileHapticsService {
  public isEnabled(): boolean {
    return gameUI?.settings?.mobileHapticsEnabled !== false;
  }

  public async impactLight(): Promise<void> {
    await this.trigger('light', ImpactStyle.Light);
  }

  public async impactMedium(): Promise<void> {
    await this.trigger('medium', ImpactStyle.Medium);
  }

  public async impactHeavy(): Promise<void> {
    await this.trigger('heavy', ImpactStyle.Heavy);
  }

  public async selection(): Promise<void> {
    if (!this.isEnabled()) return;
    if (safeIsNativePlatform()) {
      try {
        await Haptics.selectionStart();
        await Haptics.selectionChanged();
        await Haptics.selectionEnd();
        return;
      } catch {
        try {
          await Haptics.impact({ style: ImpactStyle.Light });
        } catch {
          // Non-blocking fallback
        }
        return;
      }
    }
    this.vibrateWeb(WEB_VIBRATE_MS.selection);
  }

  private async trigger(kind: Exclude<HapticStrength, 'selection'>, style: ImpactStyle): Promise<void> {
    if (!this.isEnabled()) return;
    if (safeIsNativePlatform()) {
      try {
        await Haptics.impact({ style });
      } catch {
        // Non-blocking on unsupported devices / simulators
      }
      return;
    }
    this.vibrateWeb(WEB_VIBRATE_MS[kind]);
  }

  private vibrateWeb(durationMs: number): void {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(durationMs);
      }
    } catch {
      // Ignore user-gesture / permission errors in browsers
    }
  }
}

export const mobileHaptics = new MobileHapticsService();
export const MobileHaptics = mobileHaptics;

export function impactLight(): Promise<void> {
  return mobileHaptics.impactLight();
}

export function impactMedium(): Promise<void> {
  return mobileHaptics.impactMedium();
}

export function impactHeavy(): Promise<void> {
  return mobileHaptics.impactHeavy();
}

export function selection(): Promise<void> {
  return mobileHaptics.selection();
}
