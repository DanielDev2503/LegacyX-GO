<script lang="ts">
  import { gameUI, type LegalDocId } from '../state/gameUI.svelte.js';
  import { LEGAL_DOCUMENTS, LEGAL_OPERATOR } from '../../legal/legalContent.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let activeDoc = $derived(
    LEGAL_DOCUMENTS.find((d) => d.id === gameUI.activeLegalDoc) ?? LEGAL_DOCUMENTS[0]!
  );

  function selectDoc(id: LegalDocId) {
    soundFX.playUIClick();
    gameUI.activeLegalDoc = id;
  }

  function handleClose() {
    gameUI.closeLegalDoc();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (gameUI.activeLegalDoc !== null && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if gameUI.activeLegalDoc !== null}
  <div class="legal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div
      class="legal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <header class="legal-header">
        <div class="legal-brand">
          <span class="legal-badge">CENTRO LEGAL GLOBAL</span>
          <h2 id="legal-modal-title" class="legal-title">{activeDoc.title}</h2>
          <span class="legal-meta">
            Titular: {LEGAL_OPERATOR.owner} ({LEGAL_OPERATOR.country}) · Actualizado: {LEGAL_OPERATOR.lastUpdated}
          </span>
        </div>

        <button
          type="button"
          class="legal-close-btn"
          onclick={handleClose}
          aria-label="Cerrar documento legal"
        >
          ✕
        </button>
      </header>

      <nav class="legal-tabs" aria-label="Documentos legales">
        {#each LEGAL_DOCUMENTS as doc (doc.id)}
          <button
            type="button"
            class="legal-tab-btn"
            class:active={activeDoc.id === doc.id}
            onclick={() => selectDoc(doc.id)}
          >
            {doc.shortLabel}
          </button>
        {/each}
      </nav>

      <div class="legal-scroll-body">
        <p class="legal-summary">{activeDoc.summary}</p>

        {#each activeDoc.sections as section (section.heading)}
          <section class="legal-section">
            <h3 class="legal-sec-title">{section.heading}</h3>
            {#each section.paragraphs as para}
              <p class="legal-para">{para}</p>
            {/each}
          </section>
        {/each}
      </div>

      <footer class="legal-footer">
        <a
          class="legal-support-link"
          href="mailto:{LEGAL_OPERATOR.supportEmail}?subject=Consulta%20Legal%20LegacyX-GO"
        >
          Contacto: {LEGAL_OPERATOR.supportEmail}
        </a>
        <button type="button" class="legal-accept-btn" onclick={handleClose}>
          Entendido
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .legal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: max(12px, env(safe-area-inset-top, 12px)) max(12px, env(safe-area-inset-right, 12px))
      max(12px, env(safe-area-inset-bottom, 12px)) max(12px, env(safe-area-inset-left, 12px));
    background: rgba(3, 6, 14, 0.86);
    backdrop-filter: blur(8px);
    pointer-events: auto;
  }

  .legal-card {
    width: min(96vw, 760px);
    max-height: min(90dvh, 720px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 14px;
    background: linear-gradient(165deg, rgba(11, 18, 34, 0.98), rgba(6, 10, 20, 0.99));
    border: 1px solid rgba(0, 229, 255, 0.45);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.72), 0 0 28px rgba(0, 229, 255, 0.16);
    color: #e2e8f0;
  }

  .legal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.9rem 1.15rem 0.75rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(15, 23, 42, 0.6);
  }

  .legal-brand {
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
    min-width: 0;
  }

  .legal-badge {
    align-self: flex-start;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 0.14rem 0.48rem;
    border-radius: 999px;
    color: #67e8f9;
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid rgba(0, 229, 255, 0.35);
  }

  .legal-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 800;
    color: #ffffff;
  }

  .legal-meta {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .legal-close-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: rgba(30, 41, 59, 0.7);
    color: #e2e8f0;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
  }

  .legal-close-btn:hover {
    border-color: #00e5ff;
    color: #ffffff;
  }

  .legal-tabs {
    display: flex;
    gap: 0.38rem;
    padding: 0.55rem 1.15rem;
    overflow-x: auto;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    background: rgba(9, 14, 27, 0.8);
    scrollbar-width: thin;
  }

  .legal-tab-btn {
    padding: 0.38rem 0.72rem;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(15, 23, 42, 0.75);
    color: #94a3b8;
    font-size: 0.74rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.16s ease;
  }

  .legal-tab-btn.active {
    background: rgba(0, 229, 255, 0.16);
    border-color: rgba(0, 229, 255, 0.7);
    color: #67e8f9;
  }

  .legal-scroll-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.95rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }

  .legal-summary {
    margin: 0;
    padding: 0.65rem 0.85rem;
    border-radius: 9px;
    background: rgba(0, 229, 255, 0.08);
    border-left: 3px solid #00e5ff;
    font-size: 0.8rem;
    line-height: 1.45;
    color: #cbd5e1;
  }

  .legal-section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .legal-sec-title {
    margin: 0;
    font-size: 0.86rem;
    font-weight: 800;
    color: #67e8f9;
  }

  .legal-para {
    margin: 0;
    font-size: 0.79rem;
    line-height: 1.52;
    color: #cbd5e1;
    white-space: pre-line;
  }

  .legal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.7rem 1.15rem;
    border-top: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(9, 14, 27, 0.9);
  }

  .legal-support-link {
    font-size: 0.76rem;
    font-weight: 700;
    color: #67e8f9;
    text-decoration: none;
  }

  .legal-support-link:hover {
    text-decoration: underline;
  }

  .legal-accept-btn {
    padding: 0.45rem 1rem;
    border-radius: 8px;
    border: 1px solid rgba(0, 229, 255, 0.65);
    background: linear-gradient(135deg, rgba(0, 229, 255, 0.22), rgba(0, 145, 234, 0.3));
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  @media (max-height: 540px) {
    .legal-card {
      max-height: 94dvh;
    }
    .legal-header {
      padding: 0.55rem 0.9rem;
    }
    .legal-scroll-body {
      padding: 0.65rem 0.9rem;
    }
    .legal-footer {
      padding: 0.5rem 0.9rem;
    }
  }
</style>
