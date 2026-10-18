<script lang="ts">
  import { tooltipState } from '../state/tooltipState.svelte.js';
  import { calculateTooltipPosition } from '../actions/tooltip.js';

  let tooltipEl = $state<HTMLDivElement | null>(null);
  let isMeasured = $state(false);
  let lastMeasuredText = $state('');

  let coords = $state({
    x: 0,
    y: 0,
    placement: 'top' as 'top' | 'bottom',
    arrowX: 140
  });

  $effect(() => {
    if (!tooltipState.visible || !tooltipState.text) {
      isMeasured = false;
      lastMeasuredText = '';
      return;
    }

    if (tooltipState.text !== lastMeasuredText) {
      isMeasured = false;
    }

    if (tooltipEl && tooltipState.anchorRect) {
      const tooltipWidth = tooltipEl.offsetWidth || 280;
      const tooltipHeight = tooltipEl.offsetHeight || 60;

      const viewportSize = {
        width: typeof window !== 'undefined' ? window.innerWidth : 1280,
        height: typeof window !== 'undefined' ? window.innerHeight : 800
      };

      coords = calculateTooltipPosition(
        tooltipState.anchorRect,
        { width: tooltipWidth, height: tooltipHeight },
        viewportSize,
        16
      );
      lastMeasuredText = tooltipState.text;
      isMeasured = true;
    } else if (tooltipState.visible && !tooltipState.anchorRect) {
      // Fallback for direct coordinates
      coords = {
        x: tooltipState.x,
        y: tooltipState.y,
        placement: tooltipState.position,
        arrowX: 140
      };
      isMeasured = true;
    }
  });
</script>

{#if tooltipState.visible && tooltipState.text}
  <div
    bind:this={tooltipEl}
    class="global-tooltip-portal"
    class:is-measuring={!isMeasured}
    class:pos-top={coords.placement === 'top'}
    class:pos-bottom={coords.placement === 'bottom'}
    style="left: {coords.x}px; top: {coords.y}px;"
    role="tooltip"
  >
    <span class="tooltip-content">{tooltipState.text}</span>
    <div
      class="tooltip-arrow"
      class:arrow-down={coords.placement === 'top'}
      class:arrow-up={coords.placement === 'bottom'}
      class:arrow-top={coords.placement === 'top'}
      class:arrow-bottom={coords.placement === 'bottom'}
      style="left: {coords.arrowX}px;"
    ></div>
  </div>
{/if}

<style>
  .global-tooltip-portal {
    position: fixed;
    z-index: 99999;
    pointer-events: none;
    background: rgba(8, 14, 24, 0.98);
    border: 1px solid rgba(0, 229, 255, 0.4);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.7),
      0 0 8px rgba(0, 229, 255, 0.2);
    border-radius: 0.375rem;
    padding: 0.45rem 0.65rem;
    width: max-content;
    max-width: 320px;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    color: #ffffff;
    text-wrap: balance;
    text-wrap: pretty;
    word-break: break-word;
    white-space: normal;
    animation: tooltipFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .global-tooltip-portal.is-measuring {
    opacity: 0 !important;
    visibility: hidden !important;
    pointer-events: none !important;
    transition: none !important;
    animation: none !important;
  }

  .tooltip-content {
    display: block;
  }

  .tooltip-arrow {
    position: absolute;
    width: 0;
    height: 0;
    transform: translateX(-50%);
  }

  /* When placement === 'top', tooltip is ABOVE anchor, arrow is on BOTTOM pointing DOWN */
  .tooltip-arrow.arrow-down,
  .tooltip-arrow.arrow-top {
    top: 100%;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid rgba(0, 229, 255, 0.4);
    border-bottom: none;
  }

  /* When placement === 'bottom', tooltip is BELOW anchor, arrow is on TOP pointing UP */
  .tooltip-arrow.arrow-up,
  .tooltip-arrow.arrow-bottom {
    bottom: 100%;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 5px solid rgba(0, 229, 255, 0.4);
    border-top: none;
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
