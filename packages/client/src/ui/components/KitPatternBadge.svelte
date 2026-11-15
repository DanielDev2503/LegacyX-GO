<script module lang="ts">
  export type KitBadgeShape = 'rect' | 'pill' | 'hex' | 'angled';
</script>

<script lang="ts">
  import {
    getKitPatternCss,
    resolveKitStyle,
    type KitPatternInput
  } from '../utils/kitPatterns.js';

  interface Props {
    kit?: KitPatternInput | null;
    label?: string;
    compact?: boolean;
    fallbackColor?: string;
    showLabel?: boolean;
    shape?: KitBadgeShape;
  }

  let {
    kit = null,
    label = '',
    compact = false,
    fallbackColor = '#e74c3c',
    showLabel = true,
    shape = 'rect'
  }: Props = $props();

  const styleMeta = $derived(resolveKitStyle(kit, fallbackColor));
  const patternBg = $derived(getKitPatternCss(kit, fallbackColor));
  const displayLabel = $derived((label || kit?.tag || '').trim());
  const isClippedShape = $derived(shape === 'hex' || shape === 'angled');
  const rimStrokeColor = $derived(styleMeta.hasOutline ? '#000000' : 'rgba(255, 255, 255, 0.45)');
</script>

<span
  class="kit-pattern-badge shape-{shape}"
  class:is-compact={compact}
  class:is-flag={!showLabel}
  class:has-outline={styleMeta.hasOutline}
  data-pattern={styleMeta.pattern}
  data-outline={styleMeta.hasOutline ? 'true' : 'false'}
  data-shape={shape}
  data-show-label={showLabel ? 'true' : 'false'}
  style:background={patternBg}
  style:color={styleMeta.tertiaryColor}
  style:border={isClippedShape
    ? 'none'
    : styleMeta.hasOutline
      ? '1.5px solid #000000'
      : '1px solid rgba(255, 255, 255, 0.22)'}
  style:box-shadow={isClippedShape
    ? 'none'
    : styleMeta.hasOutline
      ? '0 0 0 1px #000000, 0 2px 6px rgba(0, 0, 0, 0.45)'
      : '0 2px 6px rgba(0, 0, 0, 0.45)'}
>
  {#if showLabel}
    <span class="kit-badge-label">{displayLabel}</span>
  {/if}
  {#if shape === 'hex'}
    <svg class="shape-rim-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon
        points="16,1.5 84,1.5 98.5,50 84,98.5 16,98.5 1.5,50"
        fill="none"
        stroke={rimStrokeColor}
        stroke-width={styleMeta.hasOutline ? '3.5' : '2.2'}
        vector-effect="non-scaling-stroke"
      />
    </svg>
  {:else if shape === 'angled'}
    <svg class="shape-rim-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon
        points="13,1.5 98.5,1.5 87,98.5 1.5,98.5"
        fill="none"
        stroke={rimStrokeColor}
        stroke-width={styleMeta.hasOutline ? '3.5' : '2.2'}
        vector-effect="non-scaling-stroke"
      />
    </svg>
  {/if}
</span>

<style>
  .kit-pattern-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    min-width: 62px;
    height: 34px;
    border-radius: 6px;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.92rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    line-height: 1;
    user-select: none;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .kit-pattern-badge.is-compact {
    padding: 0 7px;
    min-width: 38px;
    height: 22px;
    border-radius: 4px;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
  }

  .kit-pattern-badge.is-flag {
    padding: 0;
    min-width: 30px;
    width: 30px;
    height: 21px;
    border-radius: 3px;
  }

  .kit-pattern-badge.is-compact.is-flag {
    padding: 0;
    min-width: 21px;
    width: 21px;
    height: 15px;
    border-radius: 2px;
  }

  .kit-pattern-badge.is-flag::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.28) 0%,
      rgba(255, 255, 255, 0) 48%,
      rgba(0, 0, 0, 0.2) 100%
    );
  }

  .kit-pattern-badge.shape-pill {
    border-radius: 999px;
  }

  .kit-pattern-badge.is-flag.shape-pill {
    width: 27px;
    min-width: 27px;
    height: 25px;
  }

  .kit-pattern-badge.is-compact.is-flag.shape-pill {
    width: 19px;
    min-width: 19px;
    height: 17px;
  }

  .kit-pattern-badge.shape-hex {
    clip-path: polygon(16% 0%, 84% 0%, 100% 50%, 84% 100%, 16% 100%, 0% 50%);
    border-radius: 0;
  }

  .kit-pattern-badge.is-flag.shape-hex {
    width: 34px;
    min-width: 34px;
    height: 23px;
  }

  .kit-pattern-badge.is-compact.is-flag.shape-hex {
    width: 23px;
    min-width: 23px;
    height: 16px;
  }

  .kit-pattern-badge.shape-angled {
    clip-path: polygon(12% 0%, 100% 0%, 88% 100%, 0% 100%);
    border-radius: 0;
  }

  .kit-pattern-badge.is-flag.shape-angled {
    width: 32px;
    min-width: 32px;
    height: 22px;
  }

  .kit-pattern-badge.is-compact.is-flag.shape-angled {
    width: 22px;
    min-width: 22px;
    height: 15px;
  }

  .shape-rim-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  .kit-badge-label {
    paint-order: stroke fill;
  }

  .kit-pattern-badge.has-outline .kit-badge-label {
    -webkit-text-stroke: 3px #000000;
    text-shadow:
      -1px -1px 0 #000000,
      1px -1px 0 #000000,
      -1px 1px 0 #000000,
      1px 1px 0 #000000;
  }

  .kit-pattern-badge.is-compact.has-outline .kit-badge-label {
    -webkit-text-stroke: 2px #000000;
  }
</style>
