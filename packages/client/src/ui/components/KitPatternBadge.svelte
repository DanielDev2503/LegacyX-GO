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
  }

  let {
    kit = null,
    label = '',
    compact = false,
    fallbackColor = '#e74c3c'
  }: Props = $props();

  const styleMeta = $derived(resolveKitStyle(kit, fallbackColor));
  const patternBg = $derived(getKitPatternCss(kit, fallbackColor));
  const displayLabel = $derived((label || kit?.tag || '').trim());
</script>

<span
  class="kit-pattern-badge"
  class:is-compact={compact}
  class:has-outline={styleMeta.hasOutline}
  data-pattern={styleMeta.pattern}
  data-outline={styleMeta.hasOutline ? 'true' : 'false'}
  style:background={patternBg}
  style:color={styleMeta.tertiaryColor}
  style:border={styleMeta.hasOutline ? '1.5px solid #000000' : '1px solid rgba(255, 255, 255, 0.22)'}
  style:box-shadow={styleMeta.hasOutline ? '0 0 0 1px #000000, 0 2px 6px rgba(0, 0, 0, 0.45)' : '0 2px 6px rgba(0, 0, 0, 0.45)'}
>
  <span class="kit-badge-label">{displayLabel}</span>
</span>

<style>
  .kit-pattern-badge {
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
  }

  .kit-pattern-badge.is-compact {
    padding: 0 7px;
    min-width: 38px;
    height: 22px;
    border-radius: 4px;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
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
