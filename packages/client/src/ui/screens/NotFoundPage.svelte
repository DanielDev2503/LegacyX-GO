<script lang="ts">
  import { LEGAL_OPERATOR, getLegalHref } from '../../legal/legalContent.js';

  let {
    pathname = '/'
  }: {
    pathname?: string;
  } = $props();
</script>

<div class="notfound-root" data-testid="not-found-page">
  <div class="pitch-grid-bg" aria-hidden="true"></div>

  <main class="notfound-card">
    <div class="error-code-badge">
      <span class="pulse-dot" aria-hidden="true"></span>
      <span>ERROR 404 · FUERA DE LA CANCHA</span>
    </div>

    <div class="notfound-hero">
      <div class="code-404" aria-label="404">4<span class="ball-zero">⚽</span>4</div>
      <div class="mini-pitch-graphic" aria-hidden="true">
        <div class="pitch-half-line"></div>
        <div class="pitch-circle"></div>
      </div>
    </div>

    <h1>Balón fuera del estadio</h1>
    <p class="notfound-desc">
      La ruta <code class="path-chip">{pathname}</code> no existe o fue movida en
      <strong>{LEGAL_OPERATOR.domain}</strong>. Regresa al campo para seguir jugando o consulta nuestro Centro Legal independiente.
    </p>

    <div class="notfound-actions">
      <a href="/" class="cta-primary">
        <span aria-hidden="true">⚽</span>
        <span>VOLVER AL CAMPO ({LEGAL_OPERATOR.domain})</span>
      </a>
      <a href={getLegalHref('privacy')} class="cta-secondary">
        <span aria-hidden="true">⚖️</span>
        <span>CENTRO LEGAL ({LEGAL_OPERATOR.domain}/legal)</span>
      </a>
    </div>
  </main>
</div>

<style>
  .notfound-root {
    position: relative;
    min-height: 100dvh;
    width: 100%;
    background: #050a14;
    color: #f8fafc;
    font-family: 'Plus Jakarta Sans', 'Space Grotesk', system-ui, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    box-sizing: border-box;
    overflow: hidden;
  }

  .pitch-grid-bg {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.05) 1px, transparent 1px),
      linear-gradient(rgba(0, 229, 255, 0.05) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
  }

  .notfound-card {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 560px;
    background: rgba(11, 18, 32, 0.96);
    border: 1px solid rgba(0, 229, 255, 0.4);
    border-radius: 1rem;
    padding: clamp(1.35rem, 3vw, 2.2rem);
    text-align: center;
    box-shadow: 0 0 36px rgba(0, 229, 255, 0.2), 0 18px 40px rgba(0, 0, 0, 0.75);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.95rem;
  }

  .error-code-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    background: rgba(255, 71, 87, 0.16);
    border: 1px solid rgba(255, 71, 87, 0.5);
    color: #ff6b81;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
  }

  .pulse-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ff4757;
  }

  .notfound-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .code-404 {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: clamp(3.5rem, 10vw, 5.2rem);
    font-weight: 900;
    line-height: 1;
    color: #ffffff;
    letter-spacing: 0.06em;
    text-shadow: 0 0 24px rgba(0, 229, 255, 0.5);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .ball-zero {
    font-size: clamp(2.8rem, 8vw, 4.2rem);
  }

  .mini-pitch-graphic {
    position: relative;
    width: 180px;
    height: 46px;
    border-radius: 8px;
    border: 1.5px solid rgba(16, 185, 129, 0.55);
    background: rgba(16, 185, 129, 0.1);
  }

  .pitch-half-line {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1.5px;
    background: rgba(16, 185, 129, 0.45);
  }

  .pitch-circle {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1.5px solid rgba(16, 185, 129, 0.45);
    transform: translate(-50%, -50%);
  }

  h1 {
    margin: 0;
    font-size: clamp(1.2rem, 3vw, 1.55rem);
    font-weight: 800;
    color: #ffffff;
  }

  .notfound-desc {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.55;
    color: #94a3b8;
  }

  .path-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    padding: 0.14rem 0.42rem;
    border-radius: 4px;
    background: rgba(0, 229, 255, 0.14);
    color: #67e8f9;
  }

  .notfound-actions {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: center;
    margin-top: 0.35rem;
  }

  .cta-primary,
  .cta-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.68rem 1.15rem;
    border-radius: 0.55rem;
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .cta-primary {
    background: #00e5ff;
    color: #06101c;
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.45);
  }

  .cta-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.65);
  }

  .cta-secondary {
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.35);
    color: #e2e8f0;
  }

  .cta-secondary:hover {
    border-color: #00e5ff;
    color: #ffffff;
  }
</style>
