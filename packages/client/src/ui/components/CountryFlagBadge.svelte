<script lang="ts">
  let { code = 'CO', showCode = false }: { code?: string; showCode?: boolean } = $props();

  const normalized = $derived((code || 'CO').toUpperCase().slice(0, 2));

  const COUNTRY_NAMES: Record<string, string> = {
    CO: 'Colombia',
    AR: 'Argentina',
    BR: 'Brasil',
    MX: 'México',
    CL: 'Chile',
    PE: 'Perú',
    ES: 'España',
    US: 'Estados Unidos',
    UY: 'Uruguay',
    VE: 'Venezuela',
    EC: 'Ecuador'
  };

  const countryLabel = $derived(COUNTRY_NAMES[normalized] || normalized);
</script>

<span class="flag-badge" title={`Región del Host: ${countryLabel} (${normalized})`}>
  <svg class="flag-svg" viewBox="0 0 24 16" aria-hidden="true">
    {#if normalized === 'CO' || normalized === 'EC' || normalized === 'VE'}
      <rect width="24" height="8" y="0" fill="#FCD116" />
      <rect width="24" height="4" y="8" fill="#003893" />
      <rect width="24" height="4" y="12" fill="#CE1126" />
    {:else if normalized === 'AR' || normalized === 'UY'}
      <rect width="24" height="5.33" y="0" fill="#74ACDF" />
      <rect width="24" height="5.34" y="5.33" fill="#FFFFFF" />
      <rect width="24" height="5.33" y="10.67" fill="#74ACDF" />
      <circle cx="12" cy="8" r="2" fill="#F6B40E" />
    {:else if normalized === 'BR'}
      <rect width="24" height="16" fill="#009B3A" />
      <polygon points="12,2 21,8 12,14 3,8" fill="#FEDF00" />
      <circle cx="12" cy="8" r="3.2" fill="#002776" />
    {:else if normalized === 'MX'}
      <rect width="8" height="16" x="0" fill="#006847" />
      <rect width="8" height="16" x="8" fill="#FFFFFF" />
      <rect width="8" height="16" x="16" fill="#CE1126" />
      <circle cx="12" cy="8" r="1.8" fill="#8C5A2B" />
    {:else if normalized === 'CL'}
      <rect width="24" height="8" y="0" fill="#FFFFFF" />
      <rect width="24" height="8" y="8" fill="#D52B1E" />
      <rect width="8" height="8" x="0" y="0" fill="#0039A6" />
      <circle cx="4" cy="4" r="1.6" fill="#FFFFFF" />
    {:else if normalized === 'PE'}
      <rect width="8" height="16" x="0" fill="#D91023" />
      <rect width="8" height="16" x="8" fill="#FFFFFF" />
      <rect width="8" height="16" x="16" fill="#D91023" />
    {:else if normalized === 'ES'}
      <rect width="24" height="4" y="0" fill="#AA151B" />
      <rect width="24" height="8" y="4" fill="#F1BF00" />
      <rect width="24" height="4" y="12" fill="#AA151B" />
    {:else if normalized === 'US'}
      <rect width="24" height="16" fill="#B22234" />
      <rect width="24" height="2.2" y="2.2" fill="#FFFFFF" />
      <rect width="24" height="2.2" y="6.6" fill="#FFFFFF" />
      <rect width="24" height="2.2" y="11" fill="#FFFFFF" />
      <rect width="10" height="8.8" x="0" y="0" fill="#3C3B6E" />
    {:else}
      <rect width="24" height="16" fill="#132238" />
      <circle cx="12" cy="8" r="5" fill="none" stroke="#00e5ff" stroke-width="1.3" />
      <line x1="7" y1="8" x2="17" y2="8" stroke="#00e5ff" stroke-width="1" />
    {/if}
    <rect width="24" height="16" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1" />
  </svg>
  {#if showCode}
    <span class="flag-code">{normalized}</span>
  {/if}
</span>

<style>
  .flag-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 5px;
    background: #0c1424;
    border: 1px solid #1e2d48;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .flag-svg {
    width: 18px;
    height: 12px;
    display: block;
    border-radius: 2px;
  }

  .flag-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    font-weight: 700;
    color: #9bb0d1;
    letter-spacing: 0.04em;
  }
</style>
