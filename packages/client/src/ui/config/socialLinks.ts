export type SocialIconKind = 'discord' | 'instagram' | 'tiktok';

export interface SocialLinkEntry {
  id: string;
  label: string;
  description: string;
  cta: string;
  badge: string;
  url: string | null;
  accentColor: string;
  iconKind: SocialIconKind;
}

/**
 * Catálogo centralizado de redes oficiales y comunidad.
 * Agregar o activar nuevas redes requiere únicamente completar `url`.
 */
export const SOCIAL_LINKS: readonly SocialLinkEntry[] = [
  {
    id: 'discord',
    label: 'Discord Oficial',
    description: 'Torneos, novedades, soporte directo, búsqueda de equipo y reportes de la comunidad.',
    cta: 'Unirse al servidor',
    badge: 'Activo',
    url: 'https://discord.gg/VBg4fqdY4N',
    accentColor: '#5865f2',
    iconKind: 'discord'
  },
  {
    id: 'instagram',
    label: 'Instagram',
    description: 'Clips destacados, resúmenes de torneos y actualizaciones visuales.',
    cta: 'Próximamente',
    badge: 'Muy pronto',
    url: null,
    accentColor: '#e1306c',
    iconKind: 'instagram'
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: 'Jugadas virales, goles con efecto Magnus y tutoriales rápidos.',
    cta: 'Próximamente',
    badge: 'Muy pronto',
    url: null,
    accentColor: '#00f2ea',
    iconKind: 'tiktok'
  }
];
