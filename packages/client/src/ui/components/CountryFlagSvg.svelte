<script lang="ts">
  interface Props {
    code?: string;
    size?: number;
  }

  let { code = 'UN', size = 18 }: Props = $props();

  const iso = $derived((code || 'UN').trim().toUpperCase().slice(0, 2));
  const h = $derived(Math.round(size * 0.72));
</script>

<span class="flag-wrap" title={`Región del Host: ${iso}`} style:width="{size}px" style:height="{h}px">
  {#if iso === 'CO'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="CO">
      <rect width="24" height="8" y="0" fill="#FCD116" />
      <rect width="24" height="4" y="8" fill="#003893" />
      <rect width="24" height="4" y="12" fill="#CE1126" />
    </svg>
  {:else if iso === 'AR'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="AR">
      <rect width="24" height="5.33" y="0" fill="#74ACDF" />
      <rect width="24" height="5.34" y="5.33" fill="#FFFFFF" />
      <rect width="24" height="5.33" y="10.67" fill="#74ACDF" />
      <circle cx="12" cy="8" r="1.9" fill="#F6B40E" />
    </svg>
  {:else if iso === 'BR'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="BR">
      <rect width="24" height="16" fill="#009C3B" />
      <polygon points="12,2 21,8 12,14 3,8" fill="#FFDF00" />
      <circle cx="12" cy="8" r="3.2" fill="#002776" />
    </svg>
  {:else if iso === 'MX'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="MX">
      <rect width="8" height="16" x="0" fill="#006847" />
      <rect width="8" height="16" x="8" fill="#FFFFFF" />
      <rect width="8" height="16" x="16" fill="#CE1126" />
      <circle cx="12" cy="8" r="1.6" fill="#8C6239" />
    </svg>
  {:else if iso === 'CL'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="CL">
      <rect width="24" height="8" y="0" fill="#FFFFFF" />
      <rect width="24" height="8" y="8" fill="#D52B1E" />
      <rect width="8" height="8" x="0" y="0" fill="#0039A6" />
      <circle cx="4" cy="4" r="1.5" fill="#FFFFFF" />
    </svg>
  {:else if iso === 'PE'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="PE">
      <rect width="8" height="16" x="0" fill="#D91023" />
      <rect width="8" height="16" x="8" fill="#FFFFFF" />
      <rect width="8" height="16" x="16" fill="#D91023" />
    </svg>
  {:else if iso === 'UY'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="UY">
      <rect width="24" height="16" fill="#FFFFFF" />
      <rect width="24" height="2" y="2" fill="#0038A8" />
      <rect width="24" height="2" y="6" fill="#0038A8" />
      <rect width="24" height="2" y="10" fill="#0038A8" />
      <rect width="24" height="2" y="14" fill="#0038A8" />
      <rect width="9" height="8" x="0" y="0" fill="#FFFFFF" />
      <circle cx="4.5" cy="4" r="2" fill="#FCD116" />
    </svg>
  {:else if iso === 'VE' || iso === 'EC'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label={iso}>
      <rect width="24" height="5.4" y="0" fill="#FCD116" />
      <rect width="24" height="5.3" y="5.4" fill="#003893" />
      <rect width="24" height="5.3" y="10.7" fill="#CE1126" />
    </svg>
  {:else if iso === 'BO'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="BO">
      <rect width="24" height="5.33" y="0" fill="#D52B1E" />
      <rect width="24" height="5.34" y="5.33" fill="#F9E300" />
      <rect width="24" height="5.33" y="10.67" fill="#007934" />
    </svg>
  {:else if iso === 'PY'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="PY">
      <rect width="24" height="5.33" y="0" fill="#D52B1E" />
      <rect width="24" height="5.34" y="5.33" fill="#FFFFFF" />
      <rect width="24" height="5.33" y="10.67" fill="#0038A8" />
    </svg>
  {:else if iso === 'ES'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="ES">
      <rect width="24" height="4" y="0" fill="#AA151B" />
      <rect width="24" height="8" y="4" fill="#F1BF00" />
      <rect width="24" height="4" y="12" fill="#AA151B" />
    </svg>
  {:else if iso === 'US'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="US">
      <rect width="24" height="16" fill="#B22234" />
      <rect width="24" height="2" y="2.2" fill="#FFFFFF" />
      <rect width="24" height="2" y="6.6" fill="#FFFFFF" />
      <rect width="24" height="2" y="11" fill="#FFFFFF" />
      <rect width="10.5" height="8.8" x="0" y="0" fill="#3C3B6E" />
    </svg>
  {:else if iso === 'CA'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="CA">
      <rect width="6" height="16" x="0" fill="#FF0000" />
      <rect width="12" height="16" x="6" fill="#FFFFFF" />
      <rect width="6" height="16" x="18" fill="#FF0000" />
      <polygon points="12,4 14.5,9 9.5,9" fill="#FF0000" />
    </svg>
  {:else if iso === 'DE'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="DE">
      <rect width="24" height="5.33" y="0" fill="#111111" />
      <rect width="24" height="5.34" y="5.33" fill="#DD0000" />
      <rect width="24" height="5.33" y="10.67" fill="#FFCE00" />
    </svg>
  {:else if iso === 'FR'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="FR">
      <rect width="8" height="16" x="0" fill="#002395" />
      <rect width="8" height="16" x="8" fill="#FFFFFF" />
      <rect width="8" height="16" x="16" fill="#ED2939" />
    </svg>
  {:else if iso === 'IT'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="IT">
      <rect width="8" height="16" x="0" fill="#009246" />
      <rect width="8" height="16" x="8" fill="#FFFFFF" />
      <rect width="8" height="16" x="16" fill="#CE2B37" />
    </svg>
  {:else if iso === 'PT'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="PT">
      <rect width="9.5" height="16" x="0" fill="#006600" />
      <rect width="14.5" height="16" x="9.5" fill="#FF0000" />
      <circle cx="9.5" cy="8" r="2.6" fill="#FFCC00" />
    </svg>
  {:else if iso === 'GB'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="GB">
      <rect width="24" height="16" fill="#012169" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#FFFFFF" stroke-width="3" />
      <path d="M12,0 V16 M0,8 H24" stroke="#FFFFFF" stroke-width="4.5" />
      <path d="M12,0 V16 M0,8 H24" stroke="#C8102E" stroke-width="2.5" />
    </svg>
  {:else if iso === 'JP'}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label="JP">
      <rect width="24" height="16" fill="#FFFFFF" />
      <circle cx="12" cy="8" r="4.2" fill="#BC002D" />
    </svg>
  {:else}
    <svg viewBox="0 0 24 16" class="flag-svg" aria-label={iso}>
      <rect width="24" height="16" fill="#0d1b2a" />
      <circle cx="12" cy="8" r="5.5" fill="none" stroke="#00e5ff" stroke-width="1.3" />
      <ellipse cx="12" cy="8" rx="2.6" ry="5.5" fill="none" stroke="#00e5ff" stroke-width="1" />
      <line x1="6.5" y1="8" x2="17.5" y2="8" stroke="#00e5ff" stroke-width="1" />
    </svg>
  {/if}
</span>

<style>
  .flag-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.22);
    flex-shrink: 0;
    background: #0a111d;
  }

  .flag-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
