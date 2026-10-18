<script lang="ts">
  import { tooltipState } from '../state/tooltipState.svelte.js';

  let tooltipEl = $state<HTMLDivElement | null>(null);
  let adjustedX = $state(0);

  $effect(() => {
    if (tooltipState.visible && tooltipEl) {
      const rect = tooltipEl.getBoundingClientRect();
      const padding = 12;
      const halfWidth = rect.width / 2;
      let x = tooltipState.x;

      if (typeof window !== 'undefined') {
        if (x - halfWidth < padding) {
          x = padding + halfWidth;
        } else if (x + halfWidth > window.innerWidth - padding) {
          x = window.innerWidth - padding - halfWidth;
        }
      }
      adjustedX = x;
    } else {
      adjustedX = tooltipState.x;
    }
  });
</script>

{#if tooltipState.visible && tooltipState.text}
  <div
    bind:this={tooltipEl}
    class="global-tooltip-portal"
    class:pos-top={tooltipState.position === 'top'}
    class:pos-bottom={tooltipState.position === 'bottom'}
    style="left: {adjustedX}px; top: {tooltipState.y}px;"
    role="tooltip"
  >
    <span class="tooltip-content">{tooltipState.text}</span>
    <div
      class="tooltip-arrow"
      class:arrow-top={tooltipState.position === 'top'}
      class:arrow-bottom={tooltipState.position === 'bottom'}
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
    max-width: 280px;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    color: #ffffff;
    text-wrap: balance;
    word-break: break-word;
    white-space: normal;
    transform: translate(-50%, var(--translate-y, -100%));
    animation: tooltipFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .global-tooltip-portal.pos-top {
    --translate-y: -100%;
  }

  .global-tooltip-portal.pos-bottom {
    --translate-y: 0%;
  }

  .tooltip-content {
    display: block;
  }

  .tooltip-arrow {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
  }

  .tooltip-arrow.arrow-top {
    top: 100%;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid rgba(0, 229, 255, 0.4);
  }

  .tooltip-arrow.arrow-bottom {
    bottom: 100%;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 5px solid rgba(0, 229, 255, 0.4);
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, var(--translate-y, -100%)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, var(--translate-y, -100%)) scale(1);
    }
  }
</style>
