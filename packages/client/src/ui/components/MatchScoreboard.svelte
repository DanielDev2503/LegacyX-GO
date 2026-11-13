<script module lang="ts">
  export const WORLD_CUP_SCOREBOARD_DESIGNS = [
    'wc2006',
    'wc2010',
    'wc2014',
    'wc2018',
    'wc2022',
    'wc2026'
  ] as const;

  export const SCOREBOARD_DESIGNS = [
    'original',
    ...WORLD_CUP_SCOREBOARD_DESIGNS
  ] as const;

  export type ScoreboardDesign = (typeof SCOREBOARD_DESIGNS)[number];
</script>

<script lang="ts">
  import KitPatternBadge from './KitPatternBadge.svelte';
  import type { KitPatternInput } from '../utils/kitPatterns.js';

  interface Props {
    design?: ScoreboardDesign;
    redScore?: number;
    blueScore?: number;
    clockText?: string;
    redKit?: KitPatternInput | null;
    blueKit?: KitPatternInput | null;
    isWarning30s?: boolean;
    isGoldenGoal?: boolean;
    compact?: boolean;
  }

  let {
    design = 'original',
    redScore = 0,
    blueScore = 0,
    clockText = '00:00',
    redKit = null,
    blueKit = null,
    isWarning30s = false,
    isGoldenGoal = false,
    compact = false
  }: Props = $props();

  const redLabel = $derived((redKit?.tag || 'RED').slice(0, 6));
  const blueLabel = $derived((blueKit?.tag || 'BLUE').slice(0, 6));
  const activeDesign = $derived<ScoreboardDesign>(
    (SCOREBOARD_DESIGNS as readonly string[]).includes(design) ? design : 'original'
  );
  const goldGradId = $derived(compact ? 'sb-gold-ball-compact' : 'sb-gold-ball-grad');
  const goldClipId = $derived(compact ? 'sb-gold-clip-compact' : 'sb-gold-clip');
</script>

<div
  class="scoreboard-shell design-{activeDesign}"
  class:is-warning-30s={isWarning30s}
  class:is-compact={compact}
  data-design={activeDesign}
>
  {#if activeDesign === 'wc2006'}
    <div class="sb-stack">
      <div class="sb-bar wc2006-pill" class:warning-active={isWarning30s}>
        <KitPatternBadge kit={redKit} label={redLabel} {compact} fallbackColor="#e74c3c" />
        <div class="wc2006-score-block">
          <span class="sb-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
          <span class="wc2006-sep">-</span>
          <span class="sb-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
        </div>
        <KitPatternBadge kit={blueKit} label={blueLabel} {compact} fallbackColor="#00e5ff" />
      </div>
      <div class="wc2006-clock-tab">
        <span class="sb-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
    </div>
  {:else if activeDesign === 'wc2010'}
    <div class="sb-stack">
      <div class="wc2010-clock-arch">
        <span class="sb-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
      <div class="sb-bar wc2010-bar" class:warning-active={isWarning30s}>
        <KitPatternBadge kit={redKit} label={redLabel} {compact} fallbackColor="#e74c3c" />
        <div class="wc2010-score-block">
          <span class="sb-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
          <span class="wc2010-sep">-</span>
          <span class="sb-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
        </div>
        <KitPatternBadge kit={blueKit} label={blueLabel} {compact} fallbackColor="#00e5ff" />
      </div>
    </div>
  {:else if activeDesign === 'wc2014'}
    <div class="sb-stack">
      <div class="sb-bar wc2014-bar" class:warning-active={isWarning30s}>
        <KitPatternBadge kit={redKit} label={redLabel} {compact} fallbackColor="#e74c3c" />
        <div class="wc2014-score-block">
          <span class="sb-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
          <span class="wc2014-sep">-</span>
          <span class="sb-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
        </div>
        <KitPatternBadge kit={blueKit} label={blueLabel} {compact} fallbackColor="#00e5ff" />
      </div>
      <div class="wc2014-clock-pill">
        <span class="sb-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
    </div>
  {:else if activeDesign === 'wc2018'}
    <div class="sb-bar wc2018-bar" class:warning-active={isWarning30s}>
      <KitPatternBadge kit={redKit} label={redLabel} {compact} fallbackColor="#e74c3c" />
      <span class="sb-score wc2018-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
      <span class="wc2018-diamond" aria-hidden="true"></span>
      <span class="sb-score wc2018-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
      <KitPatternBadge kit={blueKit} label={blueLabel} {compact} fallbackColor="#00e5ff" />
      <div class="wc2018-clock-block">
        <span class="sb-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
    </div>
  {:else if activeDesign === 'wc2022'}
    <div class="sb-bar wc2022-bar" class:warning-active={isWarning30s}>
      <div class="wc2022-clock-block">
        <span class="sb-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
      <div class="wc2022-divider" aria-hidden="true"></div>
      <KitPatternBadge kit={redKit} label={redLabel} {compact} fallbackColor="#e74c3c" />
      <span class="sb-score wc2022-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
      <span class="wc2022-ornate-sep" aria-hidden="true">
        <span class="ornate-gem"></span>
      </span>
      <span class="sb-score wc2022-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
      <KitPatternBadge kit={blueKit} label={blueLabel} {compact} fallbackColor="#00e5ff" />
    </div>
  {:else if activeDesign === 'wc2026'}
    <div class="sb-bar wc2026-pill" class:warning-active={isWarning30s}>
      <div class="wc2026-clock-block">
        <span class="sb-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
      <KitPatternBadge kit={redKit} label={redLabel} {compact} fallbackColor="#e74c3c" />
      <span class="sb-score wc2026-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
      <span class="wc2026-emblem" aria-hidden="true">26</span>
      <span class="sb-score wc2026-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
      <KitPatternBadge kit={blueKit} label={blueLabel} {compact} fallbackColor="#00e5ff" />
    </div>
  {:else}
    <!-- 'original' Cyber-Pitch Scoreboard -->
    <div class="sb-bar original-card" class:warning-active={isWarning30s}>
      <KitPatternBadge kit={redKit} label={redLabel} {compact} fallbackColor="#e74c3c" />
      <span class="sb-score original-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
      <div class="original-timer-block">
        <svg class="timer-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <circle cx="12" cy="13" r="8"></circle>
          <polyline points="12 9 12 13 14.5 14.5"></polyline>
          <line x1="9" y1="2" x2="15" y2="2"></line>
        </svg>
        <span class="sb-clock original-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
      <span class="sb-score original-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
      <KitPatternBadge kit={blueKit} label={blueLabel} {compact} fallbackColor="#00e5ff" />
    </div>
  {/if}

  {#if isGoldenGoal}
    <svg class="glowing-ball-svg" viewBox="0 0 28 28" role="img" aria-label="Balón dorado">
      <defs>
        <radialGradient id={goldGradId} cx="35%" cy="32%" r="72%" fx="33%" fy="30%">
          <stop offset="0%" stop-color="#FEF9C3"></stop>
          <stop offset="30%" stop-color="#FACC15"></stop>
          <stop offset="65%" stop-color="#CA8A04"></stop>
          <stop offset="100%" stop-color="#713F12"></stop>
        </radialGradient>
        <clipPath id={goldClipId}>
          <circle cx="14" cy="14" r="11.5"></circle>
        </clipPath>
      </defs>
      <circle cx="14" cy="14" r="12" fill="url(#{goldGradId})" stroke="#854D0E" stroke-width="1"></circle>
      <g clip-path="url(#{goldClipId})">
        <path
          d="M14 9.8 L14 4.2 M18 12.7 L23.2 10.9 M16.5 17.4 L19.6 22 M11.5 17.4 L8.4 22 M10 12.7 L4.8 10.9"
          stroke="#854D0E"
          stroke-width="0.95"
          stroke-linecap="round"
          fill="none"
        ></path>
        <polygon points="14,9.8 18,12.7 16.5,17.4 11.5,17.4 10,12.7" fill="#451A03"></polygon>
        <polygon points="11.4,2.2 16.6,2.2 14,5.2" fill="#451A03"></polygon>
        <polygon points="24.5,8.4 25.5,13.6 22,11.1" fill="#451A03"></polygon>
        <polygon points="22.1,20.8 18.6,24.8 19.2,20.8" fill="#451A03"></polygon>
        <polygon points="5.9,20.8 9.4,24.8 8.8,20.8" fill="#451A03"></polygon>
        <polygon points="3.5,8.4 2.5,13.6 6,11.1" fill="#451A03"></polygon>
      </g>
      <circle cx="10.4" cy="8.8" r="1.7" fill="#FEF9C3" opacity="0.45"></circle>
    </svg>
  {/if}
</div>

<style>
  .scoreboard-shell {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    pointer-events: auto;
  }

  .sb-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .sb-bar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    box-sizing: border-box;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .is-compact .sb-bar {
    gap: 0.32rem;
  }

  .sb-score {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.32rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    min-width: 22px;
    text-align: center;
    line-height: 1;
  }

  .is-compact .sb-score {
    font-size: 0.92rem;
    min-width: 14px;
  }

  .sb-clock {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.84rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.06em;
    line-height: 1;
  }

  .is-compact .sb-clock {
    font-size: 0.64rem;
    letter-spacing: 0.03em;
  }

  /* 30s Warning Pulse (all 7 designs) */
  .scoreboard-shell.is-warning-30s .sb-bar {
    border-color: #ef4444 !important;
    animation: warningPulse30s 1s ease-in-out infinite alternate;
  }

  @keyframes warningPulse30s {
    0% {
      box-shadow: 0 0 14px rgba(239, 68, 68, 0.5), 0 4px 16px rgba(0, 0, 0, 0.55);
    }
    100% {
      box-shadow: 0 0 26px rgba(245, 158, 11, 0.85), 0 4px 22px rgba(239, 68, 68, 0.6);
    }
  }

  /* Metallic Gold Soccer Ball (Golden Goal) */
  .glowing-ball-svg {
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    overflow: visible;
    filter: drop-shadow(0 0 8px rgba(250, 204, 21, 0.85)) drop-shadow(0 0 16px rgba(202, 138, 4, 0.5));
    animation: goldenGoalGlow 1.5s ease-in-out infinite alternate;
  }

  .is-compact .glowing-ball-svg {
    left: calc(100% + 5px);
    width: 18px;
    height: 18px;
  }

  @keyframes goldenGoalGlow {
    0% {
      filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.6)) drop-shadow(0 0 12px rgba(202, 138, 4, 0.35));
    }
    100% {
      filter: drop-shadow(0 0 12px rgba(254, 249, 195, 0.95)) drop-shadow(0 0 22px rgba(250, 204, 21, 0.8));
    }
  }

  /* 1) Original Cyber-Pitch */
  .original-card {
    height: 44px;
    padding: 0 1rem;
    min-width: 290px;
    background: #0a101a;
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-top: none;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.18), 0 4px 20px rgba(0, 0, 0, 0.6);
  }

  .is-compact .original-card {
    height: 30px;
    padding: 0 0.5rem;
    min-width: 180px;
    border-top: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 6px;
  }

  .original-score {
    color: #ffffff;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
  }

  .original-timer-block {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: #080e18;
    border: 1px solid rgba(59, 73, 76, 0.6);
    padding: 0.25rem 0.65rem;
    border-radius: 0.375rem;
  }

  .is-compact .original-timer-block {
    padding: 0.15rem 0.35rem;
    gap: 0.2rem;
  }

  .timer-svg {
    width: 0.9rem;
    height: 0.9rem;
    color: #ffb703;
    flex-shrink: 0;
  }

  .is-compact .timer-svg {
    width: 0.65rem;
    height: 0.65rem;
  }

  .original-clock {
    color: #ffb703;
  }

  /* 2) Alemania 2006 (Teamgeist) */
  .wc2006-pill {
    height: 40px;
    padding: 0 0.55rem;
    background: linear-gradient(180deg, #f8fafc 0%, #cbd5e1 55%, #94a3b8 100%);
    border: 1.5px solid #475569;
    border-radius: 999px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.55);
  }

  .is-compact .wc2006-pill {
    height: 28px;
    padding: 0 0.35rem;
  }

  .wc2006-score-block {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.22rem 0.7rem;
    border-radius: 6px;
    background: linear-gradient(180deg, #1e293b 0%, #090d16 100%);
    border: 1px solid #64748b;
    color: #ffffff;
  }

  .is-compact .wc2006-score-block {
    padding: 0.12rem 0.4rem;
    gap: 0.2rem;
  }

  .wc2006-sep {
    color: #94a3b8;
    font-weight: 800;
  }

  .wc2006-clock-tab {
    margin-top: -2px;
    padding: 0.15rem 0.75rem 0.22rem;
    background: linear-gradient(180deg, #0f172a 0%, #020617 100%);
    border: 1px solid #64748b;
    border-top: none;
    border-radius: 0 0 8px 8px;
    color: #f8fafc;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45);
  }

  .is-compact .wc2006-clock-tab {
    padding: 0.08rem 0.45rem 0.12rem;
  }

  /* 3) Sudáfrica 2010 (Jabulani) */
  .wc2010-clock-arch {
    margin-bottom: -2px;
    padding: 0.16rem 0.85rem 0.12rem;
    background: linear-gradient(180deg, #fcd34d 0%, #f59e0b 55%, #b45309 100%);
    border: 1px solid #92400e;
    border-bottom: none;
    border-radius: 10px 10px 0 0;
    color: #1c1917;
    box-shadow: 0 -2px 8px rgba(245, 158, 11, 0.35);
    z-index: 1;
  }

  .is-compact .wc2010-clock-arch {
    padding: 0.08rem 0.5rem 0.06rem;
  }

  .wc2010-bar {
    height: 38px;
    padding: 0 0.55rem;
    background: linear-gradient(180deg, #fefce8 0%, #f5f0dc 100%);
    border: 1.5px solid #d97706;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }

  .is-compact .wc2010-bar {
    height: 26px;
    padding: 0 0.32rem;
  }

  .wc2010-score-block {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    padding: 0.22rem 0.65rem;
    border-radius: 5px;
    background: linear-gradient(180deg, #f97316 0%, #c2410c 100%);
    border: 1px solid #9a3412;
    color: #ffffff;
  }

  .is-compact .wc2010-score-block {
    padding: 0.12rem 0.38rem;
    gap: 0.18rem;
  }

  .wc2010-sep {
    color: #fed7aa;
    font-weight: 800;
  }

  /* 4) Brasil 2014 (Brazuca) */
  .wc2014-bar {
    height: 40px;
    padding: 0 0.6rem;
    background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 65%, #cbd5e1 100%);
    border: 1.5px solid #94a3b8;
    border-radius: 18px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }

  .is-compact .wc2014-bar {
    height: 27px;
    padding: 0 0.34rem;
    border-radius: 12px;
  }

  .wc2014-score-block {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.24rem 0.72rem;
    border-radius: 10px;
    background: linear-gradient(180deg, #2563eb 0%, #1e3a8a 100%);
    border: 1px solid #1e40af;
    color: #ffffff;
  }

  .is-compact .wc2014-score-block {
    padding: 0.12rem 0.42rem;
    gap: 0.18rem;
  }

  .wc2014-sep {
    color: #93c5fd;
    font-weight: 800;
  }

  .wc2014-clock-pill {
    margin-top: -2px;
    padding: 0.14rem 0.8rem 0.18rem;
    background: linear-gradient(180deg, #16a34a 0%, #15803d 100%);
    border: 1px solid #facc15;
    border-top: none;
    border-radius: 0 0 10px 10px;
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
  }

  .is-compact .wc2014-clock-pill {
    padding: 0.08rem 0.45rem 0.1rem;
  }

  /* 5) Rusia 2018 (Telstar 18) */
  .wc2018-bar {
    height: 42px;
    padding: 0 0 0 0.55rem;
    background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
    border: 1.5px solid #d4af37;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.65);
  }

  .is-compact .wc2018-bar {
    height: 28px;
    padding-left: 0.32rem;
  }

  .wc2018-score {
    color: #f8fafc;
  }

  .wc2018-diamond {
    width: 10px;
    height: 10px;
    background: linear-gradient(135deg, #fde047 0%, #ca8a04 100%);
    transform: rotate(45deg);
    border: 1px solid #713f12;
    flex-shrink: 0;
  }

  .is-compact .wc2018-diamond {
    width: 7px;
    height: 7px;
  }

  .wc2018-clock-block {
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: 0 0.7rem;
    margin-left: 0.15rem;
    background: linear-gradient(180deg, #1d4ed8 0%, #1e3a8a 100%);
    border-left: 2px solid #d4af37;
    color: #ffffff;
  }

  .is-compact .wc2018-clock-block {
    padding: 0 0.4rem;
  }

  /* 6) Qatar 2022 (Al Rihla) */
  .wc2022-bar {
    height: 42px;
    padding: 0 0.65rem;
    background: linear-gradient(180deg, #881337 0%, #581026 100%);
    border: 1.5px solid #e5c158;
    border-radius: 8px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.65);
  }

  .is-compact .wc2022-bar {
    height: 28px;
    padding: 0 0.38rem;
  }

  .wc2022-clock-block {
    color: #fef3c7;
    padding-right: 0.15rem;
  }

  .wc2022-divider {
    width: 1.5px;
    height: 24px;
    background: rgba(254, 243, 199, 0.45);
    flex-shrink: 0;
  }

  .is-compact .wc2022-divider {
    height: 16px;
  }

  .wc2022-score {
    color: #ffffff;
  }

  .wc2022-ornate-sep {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1.5px solid #ffffff;
    transform: rotate(45deg);
    background: rgba(255, 255, 255, 0.14);
    flex-shrink: 0;
  }

  .ornate-gem {
    width: 6px;
    height: 6px;
    background: #ffffff;
  }

  .is-compact .wc2022-ornate-sep {
    width: 11px;
    height: 11px;
  }

  .is-compact .ornate-gem {
    width: 4px;
    height: 4px;
  }

  /* 7) Copa 2026 (Trionda) */
  .wc2026-pill {
    height: 42px;
    padding: 0 0.55rem 0 0;
    background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
    border: 1.5px solid #475569;
    border-radius: 999px;
    overflow: hidden;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.65);
  }

  .is-compact .wc2026-pill {
    height: 28px;
    padding-right: 0.34rem;
  }

  .wc2026-clock-block {
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: 0 0.78rem;
    background: #f8fafc;
    color: #0f172a;
    border-right: 2px solid #cbd5e1;
  }

  .is-compact .wc2026-clock-block {
    padding: 0 0.45rem;
  }

  .wc2026-score {
    color: #f8fafc;
  }

  .wc2026-emblem {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 30px;
    border-radius: 4px;
    background: linear-gradient(180deg, #ef4444 0%, #10b981 50%, #2563eb 100%);
    border: 1px solid #f8fafc;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 900;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    letter-spacing: -0.02em;
    flex-shrink: 0;
  }

  .is-compact .wc2026-emblem {
    width: 16px;
    height: 20px;
    font-size: 0.55rem;
  }
</style>
