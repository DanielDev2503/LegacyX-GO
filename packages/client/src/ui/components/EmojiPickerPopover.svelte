<script lang="ts">
  import { soundFX } from '../../audio/SoundFX.js';
  import { EMOJI_CATALOG } from '../utils/constants.js';

  interface Props {
    value: string;
    onSelect: (emoji: string) => void;
    ariaLabel?: string;
    compact?: boolean;
    testId?: string;
  }

  let {
    value = '⚽',
    onSelect,
    ariaLabel = 'Elegir emoji',
    compact = false,
    testId = 'emoji-picker-popover'
  }: Props = $props();

  type CategoryId = 'all' | 'futbol' | 'manos' | 'expresiones' | 'varios';

  const CATEGORIES: ReadonlyArray<{ id: CategoryId; label: string; emojis: readonly string[] }> = [
    { id: 'all', label: 'Todos', emojis: EMOJI_CATALOG },
    { id: 'futbol', label: 'Fútbol', emojis: ['⚽', '🥅', '🧤', '👟', '🏆', '🥇', '🟨', '🟥', '⏱️', '🎯'] },
    { id: 'manos', label: 'Manos', emojis: ['✋', '🙌', '👏', '🤝', '💪', '🛡️'] },
    { id: 'expresiones', label: 'Cara', emojis: ['😮', '🥶', '😤', '😂', '👀', '🤫', '🐐', '👑'] },
    { id: 'varios', label: 'Varios', emojis: ['🔥', '⚡', '🚀', '⭐', '💨', '🌀', '💔'] }
  ];

  const EMOJI_KEYWORDS: Record<string, string> = {
    '⚽': 'futbol balon pelota gol',
    '🥅': 'arco porteria red',
    '🧤': 'guante portero atajada gk',
    '👟': 'bota botin tiro chute',
    '🏆': 'copa trofeo campeon',
    '🥇': 'medalla oro ganador',
    '🟨': 'amarilla tarjeta falta',
    '🟥': 'roja expulsion tarjeta',
    '⏱️': 'reloj tiempo',
    '🎯': 'diana precision tiro',
    '✋': 'mano arriba alto stop',
    '🙌': 'manos celebracion festejo',
    '👏': 'aplauso bravo',
    '🤝': 'apreton respeto gg',
    '💪': 'fuerza musculo',
    '🛡️': 'escudo defensa dfc',
    '😮': 'sorpresa wow',
    '🥶': 'frio hielo crack',
    '😤': 'enojado furia',
    '😂': 'risa jajaja',
    '👀': 'ojos mira',
    '🤫': 'silencio callar',
    '🐐': 'cabra goat mejor',
    '👑': 'corona rey capitan mvp',
    '🔥': 'fuego onfire',
    '⚡': 'rayo turbo velocidad',
    '🚀': 'cohete potencia disparo',
    '⭐': 'estrella star',
    '💨': 'dash viento rapido',
    '🌀': 'curva efecto magnus',
    '💔': 'corazon roto autogol'
  };

  let isOpen = $state(false);
  let activeCategory = $state<CategoryId>('all');
  let searchQuery = $state('');
  let rootEl = $state<HTMLDivElement | null>(null);

  let visibleEmojis = $derived.by(() => {
    const base =
      CATEGORIES.find((c) => c.id === activeCategory)?.emojis ?? EMOJI_CATALOG;
    const pool = base.filter((e) => (EMOJI_CATALOG as readonly string[]).includes(e) || e === '🥇');
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pool;
    return EMOJI_CATALOG.filter((e) => {
      const kw = EMOJI_KEYWORDS[e] || '';
      return e.includes(q) || kw.includes(q);
    });
  });

  function toggleOpen() {
    soundFX.playUIClick();
    isOpen = !isOpen;
    if (!isOpen) searchQuery = '';
  }

  function handleSelect(emoji: string) {
    soundFX.playUIClick();
    onSelect(emoji);
    isOpen = false;
    searchQuery = '';
  }

  function handleWindowPointerDown(e: PointerEvent) {
    if (!isOpen || !rootEl) return;
    const target = e.target as Node | null;
    if (target && !rootEl.contains(target)) {
      isOpen = false;
    }
  }
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<div class="emoji-popover-wrap" class:is-compact={compact} bind:this={rootEl} data-testid={testId}>
  <button
    type="button"
    class="emoji-trigger-btn"
    class:is-open={isOpen}
    aria-label={ariaLabel}
    aria-expanded={isOpen}
    onclick={toggleOpen}
  >
    <span class="trigger-emoji">{value || '⚽'}</span>
    <span class="trigger-label">{compact ? '' : 'Elegir emoji'}</span>
    <span class="trigger-caret" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
  </button>

  {#if isOpen}
    <div class="emoji-popover-panel" role="dialog" aria-label={ariaLabel} data-testid="{testId}-panel">
      <div class="popover-tabs" role="tablist">
        {#each CATEGORIES as cat (cat.id)}
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === cat.id}
            class="cat-tab-btn"
            class:active={activeCategory === cat.id}
            onclick={() => {
              soundFX.playUIClick();
              activeCategory = cat.id;
            }}
          >
            {cat.label}
          </button>
        {/each}
      </div>

      <input
        type="text"
        class="emoji-search-input"
        placeholder="Buscar emoji (ej. gol, mano, corona...)"
        bind:value={searchQuery}
      />

      <div class="popover-emoji-grid">
        {#each visibleEmojis as emoji (emoji)}
          <button
            type="button"
            class="popover-emoji-btn"
            class:selected={value === emoji}
            aria-label={`Emoji ${emoji}`}
            onclick={() => handleSelect(emoji)}
          >
            {emoji}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .emoji-popover-wrap {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    max-width: 100%;
  }

  .emoji-trigger-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.7rem;
    border-radius: 9px;
    border: 1px solid rgba(56, 189, 248, 0.42);
    background: #0f172a;
    color: #f8fafc;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .is-compact .emoji-trigger-btn {
    padding: 0.25rem 0.5rem;
    gap: 0.28rem;
    border-radius: 7px;
  }

  .emoji-trigger-btn:hover,
  .emoji-trigger-btn.is-open {
    border-color: #00e5ff;
    background: #162238;
  }

  .trigger-emoji {
    font-size: 1.15rem;
    line-height: 1;
  }

  .trigger-label {
    color: #cbd5e1;
    font-size: 0.74rem;
  }

  .trigger-caret {
    font-size: 0.72rem;
    color: #38bdf8;
  }

  .emoji-popover-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 60;
    width: min(290px, 86vw);
    background: #0b1220;
    border: 1px solid rgba(0, 229, 255, 0.45);
    border-radius: 11px;
    padding: 0.55rem;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.65);
    display: flex;
    flex-direction: column;
    gap: 0.42rem;
    box-sizing: border-box;
  }

  .popover-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.22rem;
  }

  .cat-tab-btn {
    padding: 0.2rem 0.42rem;
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: #111b2e;
    color: #94a3b8;
    font-size: 0.66rem;
    font-weight: 700;
    cursor: pointer;
  }

  .cat-tab-btn.active {
    background: rgba(0, 229, 255, 0.16);
    border-color: #00e5ff;
    color: #67e8f9;
  }

  .emoji-search-input {
    width: 100%;
    padding: 0.34rem 0.52rem;
    border-radius: 7px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: #070c16;
    color: #f8fafc;
    font-size: 0.72rem;
    box-sizing: border-box;
  }

  .emoji-search-input:focus {
    outline: none;
    border-color: #00e5ff;
  }

  .popover-emoji-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.26rem;
    max-height: 150px;
    overflow-y: auto;
    padding: 0.1rem;
  }

  .popover-emoji-btn {
    height: 32px;
    border-radius: 7px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: #121c2f;
    font-size: 1.05rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s ease, border-color 0.1s ease;
  }

  .popover-emoji-btn:hover {
    border-color: #38bdf8;
    transform: scale(1.06);
  }

  .popover-emoji-btn.selected {
    background: rgba(0, 229, 255, 0.22);
    border-color: #00e5ff;
  }
</style>
