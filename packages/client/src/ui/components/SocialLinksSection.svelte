<script lang="ts">
  import { SOCIAL_LINKS, type SocialLinkEntry } from '../config/socialLinks.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let {
    compact = false,
    showUpcoming = true,
    title = 'COMUNIDAD Y REDES OFICIALES',
    subtitle = 'Conecta con jugadores, torneos y novedades de LegacyX-GO'
  }: {
    compact?: boolean;
    showUpcoming?: boolean;
    title?: string;
    subtitle?: string;
  } = $props();

  let visibleLinks = $derived<readonly SocialLinkEntry[]>(
    showUpcoming ? SOCIAL_LINKS : SOCIAL_LINKS.filter((item) => item.url !== null)
  );
</script>

<section class="social-section" class:is-compact={compact} aria-label={title}>
  <div class="social-head">
    <div class="social-title-group">
      <span class="social-dot" aria-hidden="true"></span>
      <h3 class="social-title">{title}</h3>
    </div>
    {#if !compact && subtitle}
      <p class="social-subtitle">{subtitle}</p>
    {/if}
  </div>

  <div class="social-grid">
    {#each visibleLinks as item (item.id)}
      {#if item.url}
        <a
          class="social-card is-active"
          style:--social-accent={item.accentColor}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onclick={() => soundFX.playUIClick()}
        >
          <div class="social-icon-wrap" aria-hidden="true">
            {#if item.iconKind === 'discord'}
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            {:else if item.iconKind === 'instagram'}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="20" rx="5"></rect>
                <circle cx="12" cy="12" r="4"></circle>
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor"></circle>
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
              </svg>
            {/if}
          </div>

          <div class="social-body">
            <div class="social-label-row">
              <strong class="social-name">{item.label}</strong>
              <span class="social-badge is-live">{item.badge}</span>
            </div>
            {#if !compact}
              <p class="social-desc">{item.description}</p>
            {/if}
          </div>

          <span class="social-cta">
            {item.cta}
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="M7 17L17 7M7 7h10v10" />
            </svg>
          </span>
        </a>
      {:else}
        <div
          class="social-card is-upcoming"
          style:--social-accent={item.accentColor}
          aria-disabled="true"
        >
          <div class="social-icon-wrap" aria-hidden="true">
            {#if item.iconKind === 'instagram'}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="20" rx="5"></rect>
                <circle cx="12" cy="12" r="4"></circle>
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor"></circle>
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
              </svg>
            {/if}
          </div>

          <div class="social-body">
            <div class="social-label-row">
              <strong class="social-name">{item.label}</strong>
              <span class="social-badge is-soon">{item.badge}</span>
            </div>
            {#if !compact}
              <p class="social-desc">{item.description}</p>
            {/if}
          </div>

          <span class="social-cta is-disabled">{item.cta}</span>
        </div>
      {/if}
    {/each}
  </div>
</section>

<style>
  .social-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.95rem 1rem;
    border-radius: 12px;
    background: linear-gradient(155deg, rgba(13, 21, 38, 0.92), rgba(7, 12, 24, 0.96));
    border: 1px solid rgba(88, 101, 242, 0.35);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }

  .social-section.is-compact {
    padding: 0.65rem 0.8rem;
    gap: 0.5rem;
  }

  .social-head {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .social-title-group {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .social-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #5865f2;
    box-shadow: 0 0 8px rgba(88, 101, 242, 0.9);
  }

  .social-title {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #e2e8f0;
  }

  .social-subtitle {
    margin: 0;
    font-size: 0.74rem;
    color: #94a3b8;
  }

  .social-grid {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .social-section.is-compact .social-grid {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .social-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 0.85rem;
    border-radius: 10px;
    text-decoration: none;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.16);
    color: #f8fafc;
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  }

  .social-section.is-compact .social-card {
    flex: 1 1 auto;
    padding: 0.5rem 0.7rem;
    gap: 0.55rem;
    min-width: 145px;
  }

  .social-card.is-active {
    border-color: color-mix(in srgb, var(--social-accent, #5865f2) 60%, transparent);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--social-accent, #5865f2) 18%, rgba(15, 23, 42, 0.94)),
      rgba(15, 23, 42, 0.92)
    );
    cursor: pointer;
  }

  .social-card.is-active:hover {
    transform: translateY(-1px);
    border-color: var(--social-accent, #5865f2);
    box-shadow: 0 0 18px color-mix(in srgb, var(--social-accent, #5865f2) 35%, transparent);
  }

  .social-card.is-upcoming {
    opacity: 0.62;
    cursor: default;
  }

  .social-icon-wrap {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--social-accent, #5865f2);
    background: color-mix(in srgb, var(--social-accent, #5865f2) 16%, rgba(15, 23, 42, 0.9));
    border: 1px solid color-mix(in srgb, var(--social-accent, #5865f2) 35%, transparent);
  }

  .social-section.is-compact .social-icon-wrap {
    width: 28px;
    height: 28px;
  }

  .social-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
  }

  .social-label-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .social-name {
    font-size: 0.84rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .social-section.is-compact .social-name {
    font-size: 0.76rem;
  }

  .social-badge {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 0.12rem 0.42rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .social-badge.is-live {
    background: rgba(34, 197, 94, 0.18);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.35);
  }

  .social-badge.is-soon {
    background: rgba(148, 163, 184, 0.12);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.22);
  }

  .social-desc {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.35;
    color: #94a3b8;
  }

  .social-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.38rem 0.65rem;
    border-radius: 7px;
    font-size: 0.72rem;
    font-weight: 700;
    color: #ffffff;
    background: var(--social-accent, #5865f2);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .social-section.is-compact .social-cta {
    padding: 0.28rem 0.52rem;
    font-size: 0.68rem;
  }

  .social-cta.is-disabled {
    background: rgba(51, 65, 85, 0.7);
    color: #94a3b8;
  }
</style>
