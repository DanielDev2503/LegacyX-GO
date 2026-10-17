/**
 * Catálogo Canónico y Cerrado de Emojis para LegacyX-GO
 * Fuente única de verdad consumida por Gatekeeper (Inicio), SettingsModal (Ajustes)
 * y el selector de disparadores de emotes rápidos.
 */
export const EMOJI_CATALOG = ['⚽', '🔥', '⚡', '👑', '🎯', '🚀', '🤝', '😮', '🏆', '⭐'] as const;
export type CatalogEmoji = typeof EMOJI_CATALOG[number];
