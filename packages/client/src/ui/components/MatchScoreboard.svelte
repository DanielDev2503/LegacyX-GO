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
  const redPrimaryColor = $derived(redKit?.primaryColor || '#e74c3c');
  const bluePrimaryColor = $derived(blueKit?.primaryColor || '#00e5ff');
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
        <KitPatternBadge kit={redKit} showLabel={false} shape="pill" {compact} fallbackColor="#e74c3c" />
        <span class="sb-team-tag wc2006-tag">{redLabel}</span>
        <div class="wc2006-score-block">
          <span class="sb-score wc2006-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
          <span class="wc2006-sep" aria-hidden="true"></span>
          <span class="sb-score wc2006-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
        </div>
        <span class="sb-team-tag wc2006-tag">{blueLabel}</span>
        <KitPatternBadge kit={blueKit} showLabel={false} shape="pill" {compact} fallbackColor="#00e5ff" />
      </div>
      <div class="wc2006-clock-tab">
        <span class="sb-clock wc2006-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
    </div>
  {:else if activeDesign === 'wc2010'}
    <div class="sb-stack">
      <div class="wc2010-clock-arch">
        <span class="sb-clock wc2010-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
      <div class="sb-bar wc2010-bar" class:warning-active={isWarning30s}>
        <KitPatternBadge kit={redKit} showLabel={false} shape="angled" {compact} fallbackColor="#e74c3c" />
        <span class="sb-team-tag wc2010-tag">{redLabel}</span>
        <div class="wc2010-score-block">
          <span class="sb-score wc2010-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
          <span class="sb-score wc2010-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
        </div>
        <span class="sb-team-tag wc2010-tag">{blueLabel}</span>
        <KitPatternBadge kit={blueKit} showLabel={false} shape="angled" {compact} fallbackColor="#00e5ff" />
      </div>
    </div>
  {:else if activeDesign === 'wc2014'}
    <div class="sb-stack">
      <div class="sb-bar wc2014-bar" class:warning-active={isWarning30s}>
        <KitPatternBadge kit={redKit} showLabel={false} shape="rect" {compact} fallbackColor="#e74c3c" />
        <span class="sb-team-tag wc2014-tag">{redLabel}</span>
        <div class="wc2014-score-block">
          <span class="sb-score wc2014-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
          <span class="wc2014-sep" aria-hidden="true">-</span>
          <span class="sb-score wc2014-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
        </div>
        <span class="sb-team-tag wc2014-tag">{blueLabel}</span>
        <KitPatternBadge kit={blueKit} showLabel={false} shape="rect" {compact} fallbackColor="#00e5ff" />
      </div>
      <div class="wc2014-clock-pill">
        <span class="sb-clock wc2014-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
    </div>
  {:else if activeDesign === 'wc2018'}
    <div class="sb-bar wc2018-bar" class:warning-active={isWarning30s}>
      <div class="wc2018-wing wc2018-wing-left">
        <KitPatternBadge kit={redKit} showLabel={false} shape="hex" {compact} fallbackColor="#e74c3c" />
        <span class="sb-team-tag wc2018-tag">{redLabel}</span>
      </div>
      <div class="wc2018-score-block">
        <span class="sb-score wc2018-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
        <span class="wc2018-diamond" aria-hidden="true"></span>
        <span class="sb-score wc2018-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
      </div>
      <div class="wc2018-wing wc2018-wing-right">
        <span class="sb-team-tag wc2018-tag">{blueLabel}</span>
        <KitPatternBadge kit={blueKit} showLabel={false} shape="hex" {compact} fallbackColor="#00e5ff" />
      </div>
      <div class="wc2018-clock-block">
        <span class="sb-clock wc2018-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
    </div>
  {:else if activeDesign === 'wc2022'}
    <div class="sb-bar wc2022-bar" class:warning-active={isWarning30s}>
      <div class="wc2022-clock-block">
        <span class="sb-clock wc2022-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
      <svg class="wc2022-zigzag" viewBox="0 0 8 36" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points="1,0 7,2 1,4 7,6 1,8 7,10 1,12 7,14 1,16 7,18 1,20 7,22 1,24 7,26 1,28 7,30 1,32 7,34 1,36"
          fill="none"
          stroke="#ffffff"
          stroke-width="1.6"
          stroke-linejoin="miter"
        />
      </svg>
      <div class="wc2022-match-body">
        <KitPatternBadge kit={redKit} showLabel={false} shape="rect" {compact} fallbackColor="#e74c3c" />
        <span class="sb-team-tag wc2022-tag">{redLabel}</span>
        <span class="sb-score wc2022-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
        <span class="wc2022-ornate-sep" aria-hidden="true">
          <span class="wc2022-lattice-diamond"></span>
        </span>
        <span class="sb-score wc2022-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
        <span class="sb-team-tag wc2022-tag">{blueLabel}</span>
        <KitPatternBadge kit={blueKit} showLabel={false} shape="rect" {compact} fallbackColor="#00e5ff" />
      </div>
    </div>
  {:else if activeDesign === 'wc2026'}
    <div class="sb-bar wc2026-pill" class:warning-active={isWarning30s}>
      <div class="wc2026-clock-block">
        <span class="sb-clock wc2026-clock" id={compact ? undefined : 'hud-timer'}>{clockText}</span>
      </div>
      <div class="wc2026-wing">
        <KitPatternBadge kit={redKit} showLabel={false} shape="rect" {compact} fallbackColor="#e74c3c" />
        <span
          class="wc2026-team-dot"
          aria-hidden="true"
          style:background={redPrimaryColor}
          style:box-shadow="0 0 6px {redPrimaryColor}"
        ></span>
        <span class="sb-team-tag wc2026-tag">{redLabel}</span>
        <span class="wc2026-score-pill">
          <span class="sb-score wc2026-score" id={compact ? undefined : 'hud-score-red'}>{redScore}</span>
        </span>
      </div>
      <span class="wc2026-emblem" aria-hidden="true">26</span>
      <div class="wc2026-wing">
        <span class="wc2026-score-pill">
          <span class="sb-score wc2026-score" id={compact ? undefined : 'hud-score-blue'}>{blueScore}</span>
        </span>
        <span class="sb-team-tag wc2026-tag">{blueLabel}</span>
        <span
          class="wc2026-team-dot"
          aria-hidden="true"
          style:background={bluePrimaryColor}
          style:box-shadow="0 0 6px {bluePrimaryColor}"
        ></span>
        <KitPatternBadge kit={blueKit} showLabel={false} shape="rect" {compact} fallbackColor="#00e5ff" />
      </div>
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

  .sb-team-tag {
    font-size: 0.92rem;
    line-height: 1;
    text-transform: uppercase;
    user-select: none;
    white-space: nowrap;
  }

  .is-compact .sb-team-tag {
    font-size: 0.64rem;
  }

  /* 2) Alemania 2006 (Teamgeist) */
  .wc2006-pill {
    height: 40px;
    padding: 0 0.45rem;
    gap: 0.45rem;
    background: linear-gradient(180deg, #f3f5f8 0%, #c8ced6 52%, #dce1e8 100%);
    border: 1.5px solid #8c96a5;
    border-radius: 999px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.95),
      inset 0 -1px 0 rgba(71, 85, 105, 0.4),
      0 4px 16px rgba(0, 0, 0, 0.55);
  }

  .is-compact .wc2006-pill {
    height: 27px;
    padding: 0 0.28rem;
    gap: 0.26rem;
  }

  .wc2006-tag {
    font-family: 'Arial Narrow', 'Inter', sans-serif;
    font-weight: 800;
    color: #111111;
    letter-spacing: 0.04em;
  }

  .wc2006-score-block {
    display: inline-flex;
    align-items: center;
    gap: 0.36rem;
    padding: 0.22rem 0.66rem;
    border-radius: 5px;
    background: linear-gradient(180deg, #272b33 0%, #090b0f 55%, #161920 100%);
    border: 1px solid #8e97a4;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
    color: #ffffff;
  }

  .is-compact .wc2006-score-block {
    padding: 0.12rem 0.38rem;
    gap: 0.22rem;
  }

  .wc2006-score {
    color: #ffffff;
  }

  .wc2006-sep {
    width: 1.5px;
    height: 18px;
    background: linear-gradient(180deg, rgba(226, 232, 240, 0.3), #e2e8f0 50%, rgba(226, 232, 240, 0.3));
    flex-shrink: 0;
  }

  .is-compact .wc2006-sep {
    height: 12px;
  }

  .wc2006-clock-tab {
    margin-top: -1px;
    padding: 0.14rem 0.78rem 0.2rem;
    background: linear-gradient(180deg, #20242c 0%, #07090d 100%);
    border: 1px solid #7b8492;
    border-top: none;
    border-radius: 0 0 8px 8px;
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45);
  }

  .is-compact .wc2006-clock-tab {
    padding: 0.08rem 0.46rem 0.12rem;
  }

  .wc2006-clock {
    color: #ffffff;
  }

  /* 3) Sudáfrica 2010 (Jabulani) */
  .wc2010-clock-arch {
    margin-bottom: -2px;
    padding: 0.16rem 0.92rem 0.14rem;
    background: linear-gradient(180deg, #ff7b1c 0%, #c74100 55%, #8f2a00 100%);
    border: 1px solid #fb923c;
    border-bottom: none;
    border-radius: 14px 14px 0 0;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    box-shadow: 0 -2px 8px rgba(234, 88, 12, 0.45);
    z-index: 1;
  }

  .is-compact .wc2010-clock-arch {
    padding: 0.08rem 0.52rem 0.06rem;
    border-radius: 9px 9px 0 0;
  }

  .wc2010-clock {
    color: #ffffff;
  }

  .wc2010-bar {
    height: 38px;
    padding: 0 0.45rem;
    gap: 0.48rem;
    background: linear-gradient(180deg, #f7e6d6 0%, #d8bda9 55%, #b89882 100%);
    border: 1.5px solid #9d7f6a;
    border-radius: 6px 6px 18px 18px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.75),
      0 4px 16px rgba(0, 0, 0, 0.5);
  }

  .is-compact .wc2010-bar {
    height: 26px;
    padding: 0 0.28rem;
    gap: 0.28rem;
    border-radius: 4px 4px 12px 12px;
  }

  .wc2010-tag {
    font-family: 'Space Grotesk', 'Inter', sans-serif;
    font-weight: 900;
    color: #14110f;
    letter-spacing: 0.05em;
  }

  .wc2010-score-block {
    height: 100%;
    display: inline-flex;
    align-items: center;
    gap: 0.68rem;
    padding: 0 0.98rem;
    background: linear-gradient(180deg, #ff8524 0%, #d94a00 58%, #9e2d00 100%);
    clip-path: polygon(0% 0%, 100% 0%, 88% 100%, 12% 100%);
    color: #ffffff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.65);
  }

  .is-compact .wc2010-score-block {
    padding: 0 0.58rem;
    gap: 0.4rem;
  }

  .wc2010-score {
    color: #ffffff;
  }

  /* 4) Brasil 2014 (Brazuca) */
  .wc2014-bar {
    height: 40px;
    padding: 0 0.45rem;
    gap: 0.5rem;
    background: linear-gradient(180deg, #ffffff 0%, #e1e6ed 60%, #c4ccd6 100%);
    border: 1.5px solid #9aa5b4;
    border-radius: 11px;
    box-shadow:
      inset 0 1px 0 #ffffff,
      0 4px 16px rgba(0, 0, 0, 0.5);
  }

  .is-compact .wc2014-bar {
    height: 27px;
    padding: 0 0.28rem;
    gap: 0.28rem;
    border-radius: 8px;
  }

  .wc2014-bar :global(.kit-pattern-badge.is-flag) {
    width: 32px;
    min-width: 32px;
    height: 26px;
    border-radius: 7px;
    border: 1.5px solid #cbd5e1;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.65),
      0 2px 5px rgba(14, 36, 77, 0.35);
  }

  .is-compact .wc2014-bar :global(.kit-pattern-badge.is-flag) {
    width: 22px;
    min-width: 22px;
    height: 17px;
    border-radius: 5px;
  }

  .wc2014-tag {
    font-family: 'Space Grotesk', 'Inter', sans-serif;
    font-weight: 900;
    color: #0e244d;
    letter-spacing: 0.04em;
  }

  .wc2014-score-block {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    padding: 0.24rem 0.72rem;
    border-radius: 7px;
    background: linear-gradient(180deg, #1b8ce8 0%, #0952a5 100%);
    border: 1px solid #60a5fa;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.45),
      0 1px 4px rgba(9, 82, 165, 0.5);
    color: #ffffff;
  }

  .is-compact .wc2014-score-block {
    padding: 0.12rem 0.42rem;
    gap: 0.18rem;
    border-radius: 5px;
  }

  .wc2014-score {
    color: #ffffff;
  }

  .wc2014-sep {
    color: #dbeafe;
    font-weight: 900;
    line-height: 1;
  }

  .wc2014-clock-pill {
    margin-top: -1px;
    padding: 0.14rem 0.85rem 0.18rem;
    background: linear-gradient(180deg, #1fc74e 0%, #0e7a2b 100%);
    border: 1px solid #86efac;
    border-top: none;
    border-radius: 0 0 10px 10px;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
  }

  .is-compact .wc2014-clock-pill {
    padding: 0.08rem 0.48rem 0.1rem;
  }

  .wc2014-clock {
    color: #ffffff;
  }

  /* 5) Rusia 2018 (Telstar 18) */
  .wc2018-bar {
    height: 40px;
    padding: 0;
    gap: 0;
    background: #980917;
    border: 1.5px solid #e2e8f0;
    border-radius: 3px;
    overflow: hidden;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.35),
      0 4px 18px rgba(0, 0, 0, 0.65);
  }

  .is-compact .wc2018-bar {
    height: 27px;
    padding: 0;
    gap: 0;
  }

  .wc2018-wing {
    height: 100%;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0 0.6rem;
    background: linear-gradient(180deg, #dc182b 0%, #980917 100%);
  }

  .is-compact .wc2018-wing {
    gap: 0.28rem;
    padding: 0 0.36rem;
  }

  .wc2018-tag {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.06em;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  }

  .wc2018-score-block {
    height: 100%;
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    padding: 0 0.62rem;
    background: linear-gradient(180deg, #0e4da4 0%, #072963 100%);
    border-left: 1px solid rgba(186, 230, 253, 0.65);
    border-right: 1px solid rgba(186, 230, 253, 0.65);
  }

  .is-compact .wc2018-score-block {
    gap: 0.24rem;
    padding: 0 0.36rem;
  }

  .wc2018-score {
    color: #ffffff;
    font-family: 'Georgia', 'Times New Roman', serif;
  }

  .wc2018-diamond {
    width: 9px;
    height: 9px;
    background: linear-gradient(135deg, #fde047 0%, #f4c430 55%, #ca8a04 100%);
    transform: rotate(45deg);
    border: 1px solid #713f12;
    flex-shrink: 0;
  }

  .is-compact .wc2018-diamond {
    width: 6px;
    height: 6px;
  }

  .wc2018-clock-block {
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: 0 0.72rem;
    background: linear-gradient(180deg, #1976d2 0%, #0b479c 100%);
    border-left: 1px solid rgba(186, 230, 253, 0.65);
    color: #ffffff;
  }

  .is-compact .wc2018-clock-block {
    padding: 0 0.42rem;
  }

  .wc2018-clock {
    color: #ffffff;
  }

  /* 6) Qatar 2022 (Al Rihla) */
  .wc2022-bar {
    height: 42px;
    padding: 0;
    gap: 0;
    background: linear-gradient(180deg, #8e083f 0%, #5c0027 100%);
    border: 1.5px solid #e5c158;
    border-radius: 6px;
    overflow: hidden;
    box-shadow:
      inset 0 1px 0 rgba(255, 192, 214, 0.35),
      0 4px 18px rgba(0, 0, 0, 0.65);
  }

  .is-compact .wc2022-bar {
    height: 28px;
    padding: 0;
    gap: 0;
  }

  .wc2022-clock-block {
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: 0 0.56rem 0 0.72rem;
    color: #ffffff;
  }

  .is-compact .wc2022-clock-block {
    padding: 0 0.32rem 0 0.44rem;
  }

  .wc2022-clock {
    color: #ffffff;
  }

  .wc2022-zigzag {
    width: 9px;
    height: 100%;
    flex-shrink: 0;
    display: block;
  }

  .is-compact .wc2022-zigzag {
    width: 6px;
  }

  .wc2022-match-body {
    height: 100%;
    display: inline-flex;
    align-items: center;
    gap: 0.46rem;
    padding: 0 0.65rem 0 0.46rem;
  }

  .is-compact .wc2022-match-body {
    gap: 0.28rem;
    padding: 0 0.38rem 0 0.28rem;
  }

  .wc2022-tag {
    font-family: 'Space Grotesk', 'Inter', sans-serif;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.05em;
  }

  .wc2022-score {
    color: #ffffff;
  }

  .wc2022-ornate-sep {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 19px;
    height: 19px;
    border-radius: 3px;
    background: #f8f1e5;
    border: 1.5px solid #d4b078;
    transform: rotate(45deg);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
    flex-shrink: 0;
  }

  .wc2022-lattice-diamond {
    width: 8px;
    height: 8px;
    background: #6d0731;
    border: 1px solid #b45309;
  }

  .is-compact .wc2022-ornate-sep {
    width: 13px;
    height: 13px;
  }

  .is-compact .wc2022-lattice-diamond {
    width: 5px;
    height: 5px;
  }

  /* 7) Copa 2026 (Trionda) */
  .wc2026-pill {
    height: 42px;
    padding: 0 0.55rem 0 0;
    gap: 0.45rem;
    background: #11151d;
    border: 1.5px solid #334155;
    border-radius: 999px;
    overflow: hidden;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 4px 18px rgba(0, 0, 0, 0.65);
  }

  .is-compact .wc2026-pill {
    height: 28px;
    padding-right: 0.34rem;
    gap: 0.28rem;
  }

  .wc2026-clock-block {
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: 0 0.82rem;
    background: #ffffff;
    color: #0b0e14;
    border-right: 3px solid #8b5cf6;
  }

  .is-compact .wc2026-clock-block {
    padding: 0 0.46rem;
    border-right-width: 2px;
  }

  .wc2026-clock {
    color: #0b0e14;
    font-weight: 900;
  }

  .wc2026-wing {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .is-compact .wc2026-wing {
    gap: 0.24rem;
  }

  .wc2026-team-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.6);
    flex-shrink: 0;
  }

  .is-compact .wc2026-team-dot {
    width: 6px;
    height: 6px;
  }

  .wc2026-tag {
    font-family: 'Arial Narrow', 'Impact', 'Outfit', sans-serif;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: 0.04em;
  }

  .wc2026-score-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 26px;
    height: 28px;
    padding: 0 0.34rem;
    border-radius: 7px;
    background: linear-gradient(180deg, #27c28a 0%, #14855d 100%);
    border: 1px solid rgba(167, 243, 208, 0.45);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }

  .is-compact .wc2026-score-pill {
    min-width: 18px;
    height: 19px;
    padding: 0 0.2rem;
    border-radius: 5px;
  }

  .wc2026-score {
    color: #ffffff;
    min-width: 14px;
  }

  .wc2026-emblem {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 30px;
    border-radius: 6px;
    background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
    border: 1.5px solid #cbd5e1;
    border-top: 3px solid #ef4444;
    border-bottom: 3px solid #2563eb;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.74rem;
    font-weight: 900;
    color: #0b0e14;
    letter-spacing: -0.04em;
    flex-shrink: 0;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  }

  .is-compact .wc2026-emblem {
    width: 16px;
    height: 20px;
    font-size: 0.55rem;
    border-top-width: 2px;
    border-bottom-width: 2px;
  }
</style>
