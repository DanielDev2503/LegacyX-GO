/// <reference types="svelte" />
/// <reference types="vite/client" />

declare global {
  const state: typeof $state;
  const effect: typeof $effect;
  const derived: typeof $derived;
  const props: typeof $props;
}

export {};
