<script lang="ts">
  import { gameUI } from '../state/gameUI.svelte.js';
  import { soundFX } from '../../audio/SoundFX.js';

  let currentSlide = $state<0 | 1 | 2>(0);

  function nextSlide() {
    soundFX.playUIClick();
    currentSlide = ((currentSlide + 1) % 3) as 0 | 1 | 2;
  }

  function prevSlide() {
    soundFX.playUIClick();
    currentSlide = ((currentSlide + 2) % 3) as 0 | 1 | 2;
  }

  function goToSlide(slide: 0 | 1 | 2) {
    soundFX.playUIClick();
    currentSlide = slide;
  }

  function handleReturnToLobby() {
    soundFX.playUIClick();
    gameUI.fsmPhase = 'PLAYING';
    gameUI.navigateTo('LOBBY');
  }

  function handleRematch() {
    soundFX.playUIClick();
    gameUI.redScore = 0;
    gameUI.blueScore = 0;
    gameUI.fsmPhase = 'PLAYING';
  }
</script>

<div class="carousel-root">
  <!-- 100vw Panoramic Viewport -->
  <div class="carousel-viewport">
    <div
      class="carousel-track"
      style="transform: translateX(-{currentSlide * 100}vw);"
    >
      <!-- SLIDE 0: Final Result & Dual Team Tables -->
      <div class="carousel-slide">
        <div class="slide-card">
          <!-- Slide Header: Final Score & MVP Crown Badge -->
          <div class="match-summary-header">
            <div class="score-proclamation">
              <span class="team-title red">RED</span>
              <div class="score-box">
                <span class="score-txt red">{gameUI.redScore}</span>
                <span class="score-hyphen">-</span>
                <span class="score-txt blue">{gameUI.blueScore}</span>
              </div>
              <span class="team-title blue">BLUE</span>
            </div>

            <div class="mvp-golden-plaque">
              <span class="crown-icon">👑</span>
              <span class="mvp-title">MVP: {gameUI.mvp.nickname}</span>
              <span class="mvp-pts">({gameUI.mvp.points} pts)</span>
            </div>
          </div>

          <!-- Dual Parallel Tables -->
          <div class="tables-grid">
            <!-- RED Team Table -->
            <div class="team-table red">
              <div class="table-header red">
                <span class="col-player">Jugador</span>
                <span class="col-pts">Pts</span>
                <span class="col-stat">G</span>
                <span class="col-stat">A</span>
                <span class="col-stat">P</span>
                <span class="col-stat">S</span>
              </div>
              <div class="table-body">
                {#each gameUI.redTeamStats as player}
                  <div class="table-row">
                    <span class="col-player bold">
                      {#if player.isCaptain}<span class="cap-badge">©</span>{/if}
                      {player.nickname}
                    </span>
                    <span class="col-pts red-txt">{player.points}</span>
                    <span class="col-stat">{player.goals}</span>
                    <span class="col-stat">{player.assists}</span>
                    <span class="col-stat">{player.passes}</span>
                    <span class="col-stat">{player.shots}</span>
                  </div>
                {/each}
              </div>
            </div>

            <!-- BLUE Team Table -->
            <div class="team-table blue">
              <div class="table-header blue">
                <span class="col-player">Jugador</span>
                <span class="col-pts">Pts</span>
                <span class="col-stat">G</span>
                <span class="col-stat">A</span>
                <span class="col-stat">P</span>
                <span class="col-stat">S</span>
              </div>
              <div class="table-body">
                {#each gameUI.blueTeamStats as player}
                  <div class="table-row" class:mvp-row={player.isMvp}>
                    <span class="col-player bold">
                      {#if player.isMvp}👑{:else if player.isCaptain}<span class="cap-badge blue">©</span>{/if}
                      {player.nickname}
                    </span>
                    <span class="col-pts blue-txt">{player.points}</span>
                    <span class="col-stat">{player.goals}</span>
                    <span class="col-stat">{player.assists}</span>
                    <span class="col-stat">{player.passes}</span>
                    <span class="col-stat">{player.shots}</span>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SLIDE 1: Individual MVP & Accolades -->
      <div class="carousel-slide">
        <div class="slide-card mvp-spotlight">
          <div class="spotlight-header">
            <span class="star-badge">★ JUGADOR DESTACADO DEL PARTIDO ★</span>
            <h2 class="spotlight-name">👑 {gameUI.mvp.nickname} (EQUIPO AZUL)</h2>
          </div>

          <div class="spotlight-grid">
            <div class="stat-pill">
              <span class="stat-val gold">{gameUI.mvp.points}</span>
              <span class="stat-name">PUNTOS TOTALES</span>
            </div>
            <div class="stat-pill">
              <span class="stat-val cyan">{gameUI.mvp.goals}</span>
              <span class="stat-name">GOLES ANOTADOS</span>
            </div>
            <div class="stat-pill">
              <span class="stat-val green">{gameUI.mvp.assists}</span>
              <span class="stat-name">ASISTENCIAS</span>
            </div>
            <div class="stat-pill">
              <span class="stat-val cyan">100%</span>
              <span class="stat-name">EFECTIVIDAD DE TIRO</span>
            </div>
          </div>

          <p class="spotlight-quote">
            "Dominio absoluto en el centro del campo con curva Magnus quirúrgica y definición impecable."
          </p>
        </div>
      </div>

      <!-- SLIDE 2: Tactical Team Comparison -->
      <div class="carousel-slide">
        <div class="slide-card tactical-overview">
          <h2 class="tactical-title">COMPARATIVA TÁCTICA GLOBAL</h2>

          <div class="comparison-bars">
            <!-- Posesión -->
            <div class="bar-group">
              <div class="bar-label-row">
                <span class="team-stat red">{gameUI.redPossession}%</span>
                <span class="bar-metric">POSESIÓN DE BALÓN</span>
                <span class="team-stat blue">{gameUI.bluePossession}%</span>
              </div>
              <div class="dual-progress">
                <div class="fill-red" style="width: {gameUI.redPossession}%"></div>
                <div class="fill-blue" style="width: {gameUI.bluePossession}%"></div>
              </div>
            </div>

            <!-- Tiros Totales -->
            <div class="bar-group">
              <div class="bar-label-row">
                <span class="team-stat red">3</span>
                <span class="bar-metric">DISPAROS A PUERTA</span>
                <span class="team-stat blue">8</span>
              </div>
              <div class="dual-progress">
                <div class="fill-red" style="width: 27%"></div>
                <div class="fill-blue" style="width: 73%"></div>
              </div>
            </div>

            <!-- Pases Completados -->
            <div class="bar-group">
              <div class="bar-label-row">
                <span class="team-stat red">29</span>
                <span class="bar-metric">PASES COMPLETADOS</span>
                <span class="team-stat blue">41</span>
              </div>
              <div class="dual-progress">
                <div class="fill-red" style="width: 41%"></div>
                <div class="fill-blue" style="width: 59%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Navigation & Action Bar -->
  <footer class="carousel-controls">
    <div class="nav-arrows">
      <button type="button" class="arrow-btn" onclick={prevSlide} title="Diapositiva anterior">◀</button>
      <div class="slide-dots">
        <button type="button" class="dot" class:active={currentSlide === 0} aria-label="Ver resultado y tablas" onclick={() => goToSlide(0)}></button>
        <button type="button" class="dot" class:active={currentSlide === 1} aria-label="Ver MVP y estadísticas individuales" onclick={() => goToSlide(1)}></button>
        <button type="button" class="dot" class:active={currentSlide === 2} aria-label="Ver comparativa táctica" onclick={() => goToSlide(2)}></button>
      </div>
      <button type="button" class="arrow-btn" onclick={nextSlide} title="Siguiente diapositiva">▶</button>
    </div>

    <div class="action-buttons">
      <button type="button" class="btn-rematch" onclick={handleRematch}>
        REVANCHA
      </button>
      <button type="button" class="btn-lobby" onclick={handleReturnToLobby}>
        VOLVER AL LOBBY
      </button>
    </div>
  </footer>
</div>

<style>
  .carousel-root {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: rgba(5, 8, 17, 0.88);
    pointer-events: auto;
    user-select: none;
  }

  .carousel-viewport {
    position: absolute;
    top: 50px;
    bottom: 80px;
    left: 0;
    width: 100vw;
    overflow: hidden;
  }

  .carousel-track {
    display: flex;
    width: 300vw;
    height: 100%;
    transition: transform 0.45s cubic-bezier(0.25, 1, 0.5, 1);
    will-change: transform;
  }

  .carousel-slide {
    width: 100vw;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 10px;
  }

  .slide-card {
    width: min(92vw, 860px);
    max-height: 100%;
    background: rgba(10, 16, 26, 0.98);
    border: 1px solid #00e5ff;
    border-radius: 12px;
    box-shadow: 0 0 28px rgba(0, 229, 255, 0.28);
    padding: 22px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: hidden;
  }

  .match-summary-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0, 229, 255, 0.2);
    padding-bottom: 14px;
  }

  .score-proclamation {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .team-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 22px;
    font-weight: 800;
  }

  .team-title.red {
    color: #ff4757;
  }

  .team-title.blue {
    color: #00e5ff;
  }

  .score-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.3);
    padding: 4px 16px;
    border-radius: 6px;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.18);
  }

  .score-txt {
    font-family: 'JetBrains Mono', monospace;
    font-size: 26px;
    font-weight: 800;
  }

  .score-txt.red {
    color: #ff4757;
  }

  .score-txt.blue {
    color: #00e5ff;
  }

  .score-hyphen {
    color: #8fa0b5;
    font-size: 20px;
    font-weight: 700;
  }

  .mvp-golden-plaque {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 219, 60, 0.12);
    border: 1px solid #ffe16d;
    padding: 6px 14px;
    border-radius: 6px;
    box-shadow: 0 0 16px rgba(255, 215, 0, 0.35);
  }

  .crown-icon {
    font-size: 18px;
  }

  .mvp-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 800;
    color: #ffe16d;
    letter-spacing: 0.05em;
  }

  .mvp-pts {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 700;
    color: #ffe16d;
  }

  .tables-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .team-table {
    border-radius: 6px;
    overflow: hidden;
    background: rgba(8, 14, 24, 0.85);
  }

  .team-table.red {
    border: 1px solid rgba(255, 71, 87, 0.35);
  }

  .team-table.blue {
    border: 1px solid rgba(0, 229, 255, 0.35);
  }

  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    font-family: 'Chivo', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .table-header.red {
    background: rgba(255, 71, 87, 0.2);
    color: #ff4757;
    border-bottom: 1px solid rgba(255, 71, 87, 0.4);
  }

  .table-header.blue {
    background: rgba(0, 229, 255, 0.2);
    color: #00e5ff;
    border-bottom: 1px solid rgba(0, 229, 255, 0.4);
  }

  .table-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
  }

  .table-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(22, 28, 38, 0.7);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #dde2f1;
  }

  .table-row.mvp-row {
    border: 1px solid rgba(255, 219, 60, 0.5);
    background: rgba(255, 219, 60, 0.08);
  }

  .col-player {
    flex: 2;
    text-align: left;
  }

  .col-player.bold {
    font-weight: 700;
    color: #ffffff;
  }

  .cap-badge {
    color: #ff4757;
    font-weight: 900;
    margin-right: 2px;
  }

  .cap-badge.blue {
    color: #00e5ff;
  }

  .col-pts {
    width: 38px;
    text-align: right;
    font-weight: 700;
  }

  .col-pts.red-txt {
    color: #ff4757;
  }

  .col-pts.blue-txt {
    color: #00e5ff;
  }

  .col-stat {
    width: 26px;
    text-align: center;
  }

  /* SLIDE 1 SPOTLIGHT */
  .mvp-spotlight {
    text-align: center;
    align-items: center;
    padding: 32px 24px;
  }

  .star-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #ffe16d;
    background: rgba(255, 219, 60, 0.15);
    padding: 4px 14px;
    border-radius: 20px;
    border: 1px solid rgba(255, 219, 60, 0.4);
    letter-spacing: 0.1em;
  }

  .spotlight-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 24px;
    font-weight: 800;
    color: #ffffff;
    margin: 12px 0 0 0;
  }

  .spotlight-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    width: 100%;
    margin-top: 14px;
  }

  .stat-pill {
    background: #080e18;
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 8px;
    padding: 16px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .stat-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 24px;
    font-weight: 800;
  }

  .stat-val.gold { color: #ffe16d; }
  .stat-val.cyan { color: #00e5ff; }
  .stat-val.green { color: #2ecc71; }

  .stat-name {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 10px;
    font-weight: 700;
    color: #8fa0b5;
    letter-spacing: 0.05em;
  }

  .spotlight-quote {
    font-family: 'Chivo', system-ui, sans-serif;
    font-style: italic;
    font-size: 13px;
    color: #c3f5ff;
    margin-top: 10px;
  }

  /* SLIDE 2 TACTICAL */
  .tactical-overview {
    padding: 28px;
  }

  .tactical-title {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 18px;
    font-weight: 800;
    color: #00e5ff;
    letter-spacing: 0.05em;
    margin: 0 0 16px 0;
    text-align: center;
  }

  .comparison-bars {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .bar-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 700;
  }

  .team-stat.red { color: #ff4757; }
  .team-stat.blue { color: #00e5ff; }
  .bar-metric { color: #ffffff; letter-spacing: 0.05em; }

  .dual-progress {
    width: 100%;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
    display: flex;
    background: #080e18;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .fill-red {
    background: #ff4757;
    height: 100%;
  }

  .fill-blue {
    background: #00e5ff;
    height: 100%;
  }

  /* Footer Controls */
  .carousel-controls {
    position: fixed;
    bottom: 14px;
    left: 0;
    right: 0;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 32px;
    box-sizing: border-box;
    z-index: 95;
  }

  .nav-arrows {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .arrow-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #161c26;
    border: 1px solid rgba(0, 229, 255, 0.4);
    color: #00e5ff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: background 0.15s;
  }

  .arrow-btn:hover {
    background: rgba(0, 229, 255, 0.2);
  }

  .slide-dots {
    display: flex;
    gap: 8px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(143, 160, 181, 0.3);
    border: 1px solid transparent;
    cursor: pointer;
    transition: background 0.15s;
  }

  .dot.active {
    background: #00e5ff;
    box-shadow: 0 0 8px #00e5ff;
  }

  .action-buttons {
    display: flex;
    gap: 12px;
  }

  .btn-rematch {
    height: 40px;
    padding: 0 20px;
    border-radius: 6px;
    background: #2ecc71;
    border: none;
    color: #05150c;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.06em;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(46, 204, 113, 0.4);
  }

  .btn-lobby {
    height: 40px;
    padding: 0 18px;
    border-radius: 6px;
    background: rgba(26, 32, 42, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.4);
    color: #00e5ff;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.06em;
    cursor: pointer;
  }
</style>
