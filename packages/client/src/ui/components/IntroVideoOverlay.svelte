<script lang="ts">
  import { onMount } from 'svelte';

  let { onFinish }: { onFinish: () => void } = $props();

  const FALLBACK_INTRO_URL = '/media/intro/Neon_lines_drawing_sports_arena_5df3ac64_1080p.mp4';

  let videoEl = $state<HTMLVideoElement | null>(null);
  let introUrl = $state<string>(FALLBACK_INTRO_URL);
  let isMutedFallback = $state<boolean>(false);
  let isFinished = $state<boolean>(false);

  function finishIntro() {
    if (isFinished) return;
    isFinished = true;
    try {
      if (videoEl) {
        videoEl.pause();
      }
    } catch {
      // Ignore pause errors on teardown
    }
    onFinish();
  }

  function enableSound() {
    if (!videoEl) return;
    try {
      videoEl.muted = false;
      isMutedFallback = false;
      void videoEl.play().catch(() => {});
    } catch {
      // Ignore audio unlock error
    }
  }

  onMount(() => {
    let active = true;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        finishIntro();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const safetyTimeout = window.setTimeout(() => {
      if (active && (!videoEl || videoEl.readyState === 0)) {
        finishIntro();
      }
    }, 3500);

    const startPlayback = async () => {
      try {
        if (typeof fetch === 'function') {
          const res = await fetch('/api/media/list');
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.intros) && data.intros.length > 0 && typeof data.intros[0]?.url === 'string') {
              introUrl = data.intros[0].url;
            }
          }
        }
      } catch {
        // Use fallback intro path
      }

      if (!active || !videoEl) return;
      try {
        videoEl.muted = false;
        await videoEl.play();
        isMutedFallback = false;
      } catch {
        // Browsers often block unmuted autoplay before first user gesture
        try {
          if (!videoEl) return;
          videoEl.muted = true;
          isMutedFallback = true;
          await videoEl.play();
        } catch {
          finishIntro();
        }
      }
    };

    void startPlayback();

    return () => {
      active = false;
      window.clearTimeout(safetyTimeout);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="intro-overlay" data-testid="intro-video-overlay" role="dialog" aria-label="Intro de LegacyX-GO">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoEl}
    src={introUrl}
    class="intro-video"
    autoplay
    playsinline
    preload="auto"
    onended={finishIntro}
    onerror={finishIntro}
  ></video>

  <div class="intro-hud">
    <div class="intro-brand">
      <span class="intro-kicker">LEGACYX-GO</span>
      <span class="intro-sub">CYBER-PITCH ARENA</span>
    </div>

    <div class="intro-actions">
      {#if isMutedFallback}
        <button type="button" class="intro-btn sound-btn" onclick={enableSound}>
          🔊 Activar Sonido
        </button>
      {/if}
      <button type="button" class="intro-btn skip-btn" data-testid="btn-skip-intro" onclick={finishIntro}>
        SALTAR INTRO ⏭
      </button>
    </div>
  </div>
</div>

<style>
  .intro-overlay {
    position: fixed;
    inset: 0;
    z-index: 9500;
    background: #02050b;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .intro-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #02050b;
  }

  .intro-hud {
    position: fixed;
    inset: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 20px 24px;
    background: linear-gradient(180deg, rgba(2, 5, 11, 0.55) 0%, transparent 25%, transparent 72%, rgba(2, 5, 11, 0.8) 100%);
  }

  .intro-brand {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .intro-kicker {
    font-family: 'Orbitron', sans-serif;
    font-weight: 900;
    font-size: 1rem;
    letter-spacing: 3px;
    color: #00e5ff;
    text-shadow: 0 0 12px rgba(0, 229, 255, 0.5);
  }

  .intro-sub {
    font-family: 'Rajdhani', sans-serif;
    font-size: 0.72rem;
    letter-spacing: 2.5px;
    color: rgba(255, 255, 255, 0.72);
    font-weight: 700;
  }

  .intro-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    pointer-events: auto;
  }

  .intro-btn {
    padding: 10px 18px;
    border-radius: 10px;
    font-family: 'Orbitron', sans-serif;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 1px;
    cursor: pointer;
    transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease;
  }

  .sound-btn {
    background: rgba(10, 20, 38, 0.9);
    border: 1px solid rgba(0, 229, 255, 0.45);
    color: #00e5ff;
  }

  .skip-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: #ffffff;
  }

  .intro-btn:hover {
    transform: translateY(-2px);
    border-color: #00e5ff;
  }

  @media (max-width: 720px) {
    .intro-hud {
      padding: 14px 16px;
    }

    .intro-btn {
      padding: 8px 14px;
      font-size: 0.7rem;
    }
  }
</style>
