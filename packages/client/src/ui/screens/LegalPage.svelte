<script lang="ts">
  import {
    LEGAL_DOCUMENTS,
    LEGAL_OPERATOR,
    getLegalHref,
    type LegalSectionItem
  } from '../../legal/legalContent.js';
  import { type LegalDocId } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let {
    initialDoc = 'privacy'
  }: {
    initialDoc?: LegalDocId;
  } = $props();

  let activeDocId = $state<LegalDocId>('privacy');
  let cookieAnalytics = $state(false);
  let cookieFunctional = $state(true);
  let savedToast = $state(false);

  $effect(() => {
    activeDocId = initialDoc;
  });

  let activeDoc = $derived(
    LEGAL_DOCUMENTS.find((d) => d.id === activeDocId) ?? LEGAL_DOCUMENTS[0]
  );

  function selectDoc(id: LegalDocId) {
    soundFX.playUIClick();
    activeDocId = id;
    if (typeof window !== 'undefined' && typeof window.history?.pushState === 'function') {
      try {
        window.history.pushState({}, '', getLegalHref(id));
      } catch {
        // Ignore security restrictions in non-HTTP test environments
      }
    }
  }

  function handleSaveCookiePrefs() {
    soundFX.playUIClick();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          'legacyx_cookie_prefs_v1',
          JSON.stringify({
            essential: true,
            functional: cookieFunctional,
            analytics: cookieAnalytics,
            savedAt: Date.now()
          })
        );
      } catch {
        // Ignore storage error
      }
    }
    savedToast = true;
    setTimeout(() => {
      savedToast = false;
    }, 2400);
  }
</script>

<div class="legal-page-root" data-testid="standalone-legal-page">
  <header class="legal-topbar">
    <div class="brand-area">
      <a href="/" class="back-game-btn">
        <span aria-hidden="true">←</span>
        <span>Ir a LegacyX-GO</span>
      </a>
      <div class="brand-meta">
        <strong class="brand-title">CENTRO LEGAL · {LEGAL_OPERATOR.domain}</strong>
        <span class="brand-sub">{LEGAL_OPERATOR.legalBaseUrl}</span>
      </div>
    </div>

    <div class="operator-badges">
      <span class="meta-chip">Titular: {LEGAL_OPERATOR.owner}</span>
      <span class="meta-chip">Contacto: {LEGAL_OPERATOR.supportEmail}</span>
      <span class="meta-chip">Actualizado: {LEGAL_OPERATOR.lastUpdated}</span>
    </div>
  </header>

  <main class="legal-main-shell">
    <nav class="legal-doc-tabs" aria-label="Documentos legales">
      {#each LEGAL_DOCUMENTS as doc (doc.id)}
        <button
          type="button"
          class="doc-tab-btn"
          class:is-active={activeDocId === doc.id}
          onclick={() => selectDoc(doc.id)}
        >
          <span class="doc-tab-short">{doc.shortLabel}</span>
          <span class="doc-tab-url">{getLegalHref(doc.id)}</span>
        </button>
      {/each}
    </nav>

    <article class="legal-reader-card">
      <header class="reader-header">
        <h1>{activeDoc.title}</h1>
        <p class="reader-summary">{activeDoc.summary}</p>
      </header>

      <div class="reader-sections">
        {#each activeDoc.sections as section (section.heading)}
          <section class="legal-section">
            <h2>{section.heading}</h2>
            {#each section.paragraphs as paragraph, pIdx (pIdx)}
              <p>{paragraph}</p>
            {/each}
          </section>
        {/each}

        {#if activeDoc.id === 'cookies'}
          <section class="cookie-prefs-box">
            <h3>Preferencias Técnicas y de Almacenamiento Local</h3>
            <label class="pref-row is-locked">
              <span>Estrictamente necesarias (Sesión, WebRTC y Reglas)</span>
              <input type="checkbox" checked disabled />
            </label>
            <label class="pref-row">
              <span>Funcionales (Equipos, audio, cámara, HUD y mando)</span>
              <input type="checkbox" bind:checked={cookieFunctional} />
            </label>
            <label class="pref-row">
              <span>Métricas agregadas de rendimiento sin rastreo entre sitios</span>
              <input type="checkbox" bind:checked={cookieAnalytics} />
            </label>
            <div class="pref-actions">
              <button type="button" class="save-prefs-btn" onclick={handleSaveCookiePrefs}>
                {savedToast ? '✓ Preferencias guardadas' : 'Guardar preferencias'}
              </button>
            </div>
          </section>
        {/if}
      </div>

      <footer class="reader-footer">
        <span>Dominio oficial del servicio: <strong>{LEGAL_OPERATOR.appUrl}</strong></span>
        <a href={LEGAL_OPERATOR.discordInvite} target="_blank" rel="noopener noreferrer" class="discord-pill">
          Soporte Discord
        </a>
      </footer>
    </article>
  </main>
</div>

<style>
  .legal-page-root {
    min-height: 100dvh;
    width: 100%;
    background: #060b14;
    color: #e2e8f0;
    font-family: 'Plus Jakarta Sans', 'Chivo', system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    box-sizing: border-box;
  }

  .legal-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.85rem 1.4rem;
    background: #0b1220;
    border-bottom: 1px solid rgba(0, 229, 255, 0.25);
  }

  .brand-area {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    flex-wrap: wrap;
  }

  .back-game-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    background: rgba(0, 229, 255, 0.14);
    border: 1px solid rgba(0, 229, 255, 0.48);
    color: #67e8f9;
    text-decoration: none;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .back-game-btn:hover {
    background: #00e5ff;
    color: #06101c;
  }

  .brand-meta {
    display: flex;
    flex-direction: column;
  }

  .brand-title {
    font-size: 0.95rem;
    letter-spacing: 0.04em;
    color: #ffffff;
  }

  .brand-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    color: #38bdf8;
  }

  .operator-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .meta-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    padding: 0.22rem 0.55rem;
    border-radius: 6px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.25);
    color: #cbd5e1;
  }

  .legal-main-shell {
    flex: 1;
    width: 100%;
    max-width: 1120px;
    margin: 0 auto;
    padding: 1.25rem 1.25rem 2rem 1.25rem;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 1.1rem;
    align-items: start;
  }

  .legal-doc-tabs {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    position: sticky;
    top: 1rem;
  }

  .doc-tab-btn {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.65rem 0.85rem;
    border-radius: 0.6rem;
    background: rgba(13, 20, 34, 0.92);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .doc-tab-btn:hover {
    border-color: rgba(0, 229, 255, 0.5);
    color: #ffffff;
  }

  .doc-tab-btn.is-active {
    background: rgba(0, 229, 255, 0.14);
    border-color: #00e5ff;
    color: #ffffff;
  }

  .doc-tab-short {
    font-size: 0.85rem;
    font-weight: 800;
  }

  .doc-tab-url {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: #38bdf8;
  }

  .legal-reader-card {
    background: #0c1424;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.85rem;
    padding: 1.4rem 1.6rem;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  }

  .reader-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.9rem;
    margin-bottom: 1.15rem;
  }

  .reader-header h1 {
    margin: 0 0 0.4rem 0;
    font-size: 1.35rem;
    color: #ffffff;
  }

  .reader-summary {
    margin: 0;
    font-size: 0.88rem;
    color: #94a3b8;
    line-height: 1.45;
  }

  .reader-sections {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .legal-section h2 {
    margin: 0 0 0.4rem 0;
    font-size: 1rem;
    color: #38bdf8;
  }

  .legal-section p {
    margin: 0 0 0.5rem 0;
    font-size: 0.86rem;
    line-height: 1.6;
    color: #dbeafe;
    white-space: pre-line;
  }

  .cookie-prefs-box {
    background: rgba(8, 13, 24, 0.92);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 0.65rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .cookie-prefs-box h3 {
    margin: 0;
    font-size: 0.92rem;
    color: #ffffff;
  }

  .pref-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.82rem;
    color: #cbd5e1;
  }

  .pref-row.is-locked {
    opacity: 0.72;
  }

  .save-prefs-btn {
    padding: 0.45rem 0.95rem;
    border-radius: 0.45rem;
    background: #00e5ff;
    color: #06101c;
    border: none;
    font-weight: 800;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .reader-footer {
    margin-top: 1.4rem;
    padding-top: 0.9rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.65rem;
    font-size: 0.78rem;
    color: #94a3b8;
  }

  .discord-pill {
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(88, 101, 242, 0.22);
    border: 1px solid rgba(88, 101, 242, 0.5);
    color: #c7d2fe;
    text-decoration: none;
    font-weight: 700;
  }

  @media (max-width: 780px) {
    .legal-main-shell {
      grid-template-columns: 1fr;
      padding: 0.85rem;
    }

    .legal-doc-tabs {
      position: static;
      flex-direction: row;
      overflow-x: auto;
      padding-bottom: 0.25rem;
    }

    .doc-tab-btn {
      flex-shrink: 0;
      padding: 0.5rem 0.75rem;
    }
  }
</style>
