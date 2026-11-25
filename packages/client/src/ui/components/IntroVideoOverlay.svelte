<script lang="ts">
  import { onMount } from 'svelte';
  import { gameUI } from '../state/gameUI.svelte.js';

  let { onFinish }: { onFinish: () => void } = $props();

  const FALLBACK_INTRO_URL = '/media/intro/Neon_lines_drawing_sports_arena_5df3ac64_1080p.mp4';

  let videoEl = $state<HTMLVideoElement | null>(null);
  let introUrl = $state<string>(FALLBACK_INTRO_URL);
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

  onMount(() => {
    let active = true;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      finishIntro();
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
        videoEl.volume = gameUI.settings.isMuted ? 0 : Math.max(0, Math.min(1, gameUI.settings.masterVolume));
        await videoEl.play();
      } catch {
        // Fallback only if browser policy blocks unmuted autoplay before any gesture
        try {
          if (!videoEl) return;
          videoEl.muted = true;
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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="intro-overlay"
  data-testid="intro-video-overlay"
  role="dialog"
  tabindex="-1"
  aria-label="Intro de LegacyX-GO"
  onpointerdown={finishIntro}
>
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
    cursor: pointer;
  }

  .intro-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: #02050b;
  }
</style>
