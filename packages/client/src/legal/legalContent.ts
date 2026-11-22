import type { LegalDocId } from '../ui/state/gameUI.svelte.js';

export const LEGAL_OPERATOR = {
  appName: 'LegacyX-GO',
  domain: 'legacyxgo.com',
  appUrl: 'https://legacyxgo.com',
  legalBaseUrl: 'https://legacyxgo.com/legal',
  owner: 'Daniel Sanchez',
  country: 'Colombia',
  supportEmail: 'soporte@legacyxgo.com',
  lastUpdated: '2026-11-22',
  discordInvite: 'https://discord.gg/VBg4fqdY4N'
} as const;

export interface LegalSectionItem {
  heading: string;
  paragraphs: readonly string[];
}

export interface LegalDocumentDefinition {
  id: LegalDocId;
  shortLabel: string;
  title: string;
  summary: string;
  sections: readonly LegalSectionItem[];
}

export const LEGAL_DOCUMENTS: readonly LegalDocumentDefinition[] = [
  {
    id: 'privacy',
    shortLabel: 'Privacidad',
    title: 'Política de Privacidad Global',
    summary:
      'Cumplimiento transparente de GDPR (EEE/Reino Unido), CCPA/CPRA (California), LGPD (Brasil) y Ley 1581 de 2012 (Colombia).',
    sections: [
      {
        heading: '1. Responsable del Tratamiento',
        paragraphs: [
          `El responsable del tratamiento de los datos personales asociados a ${LEGAL_OPERATOR.appName} es ${LEGAL_OPERATOR.owner}, operador independiente domiciliado en ${LEGAL_OPERATOR.country}.`,
          `Canal oficial de contacto, soporte y ejercicio de derechos: ${LEGAL_OPERATOR.supportEmail}. Última actualización: ${LEGAL_OPERATOR.lastUpdated}.`
        ]
      },
      {
        heading: '2. Datos Recopilados y Finalidades',
        paragraphs: [
          'Cuentas registradas (Supabase Auth / PostgreSQL): identificador único de usuario, correo electrónico verificado, nombre de usuario, rol competitivo, calificación ELO, estadísticas de partido (goles, asistencias, atajadas, MVPs) y grabaciones/replays (.lxr.gz) almacenadas opcionalmente en la nube.',
          'Modo Invitado (Guest): no requiere correo ni registro en base de datos; el apodo temporal con prefijo "inv_" y las preferencias técnicas locales permanecen exclusivamente en tu dispositivo.',
          'Inicio de sesión con Google (OAuth): únicamente solicitamos tu identidad básica y correo electrónico verificado para autenticar tu cuenta oficial; no accedemos a contactos, archivos ni calendarios.'
        ]
      },
      {
        heading: '3. Red P2P WebRTC y Exposición Temporal de IP',
        paragraphs: [
          'LegacyX-GO utiliza comunicación directa entre pares (WebRTC) para ofrecer baja latencia en partidas en tiempo real, asistida por el servidor de señalización y servidores STUN/TURN (incluyendo relés Metered.ca cuando el entorno de red requiere retransmisión).',
          'AVISO IMPORTANTE: Al conectarte a una sala multijugador P2P sin relé TURN exclusivo, los protocolos estándar ICE/WebRTC pueden intercambiar temporalmente tu dirección IP pública con el anfitrión (Host) u otros participantes de esa misma sala para establecer la ruta directa. Al crear o unirte a una sala aceptas expresamente este funcionamiento técnico inherente a WebRTC.'
        ]
      },
      {
        heading: '4. Menores de Edad y Cumplimiento Internacional',
        paragraphs: [
          'Este servicio está dirigido a personas mayores de 13 años (o mayores de 16 años en jurisdicciones del EEE/Reino Unido donde así lo exija el GDPR, salvo consentimiento verificable de madre, padre o representante legal).',
          'No vendemos ni compartimos datos personales con anunciantes ni intermediarios de datos (no hay "sale" ni "sharing" bajo CCPA/CPRA), ni ejecutamos perfilado publicitario sobre menores.'
        ]
      },
      {
        heading: '5. Derechos del Titular (GDPR, CCPA, LGPD, Ley 1581)',
        paragraphs: [
          'Puedes acceder a tu perfil, rectificar preferencias, solicitar copia portátil o eliminar permanentemente tu cuenta oficial en cualquier momento desde Ajustes > Cuenta > "Eliminar mi cuenta" o escribiendo a soporte@legacyxgo.com.',
          'Conservamos tus datos mientras tu cuenta permanezca activa. Al solicitar la eliminación definitiva, borramos tu usuario de autenticación, perfil, estadísticas en rankings y archivos de replay asociados.'
        ]
      }
    ]
  },
  {
    id: 'terms',
    shortLabel: 'Términos y EULA',
    title: 'Términos de Servicio y Licencia de Uso (EULA)',
    summary:
      'Reglas competitivas, licencia personal de uso, conducta multijugador y condiciones válidas para Web, Android, iOS y PC/Steam.',
    sections: [
      {
        heading: '1. Aceptación y Alcance',
        paragraphs: [
          `Al registrarte, acceder como invitado o ejecutar ${LEGAL_OPERATOR.appName} en navegador web, Google Play, Apple App Store o Steam, aceptas estos Términos de Servicio y la Política de Privacidad.`,
          `Si utilizas el juego a través de tiendas de terceros (Apple, Google, Valve/Steam), también aplican sus respectivas condiciones de plataforma como terceros beneficiarios en lo relativo a distribución y pagos.`
        ]
      },
      {
        heading: '2. Licencia Limitada de Software',
        paragraphs: [
          `${LEGAL_OPERATOR.owner} te otorga una licencia personal, mundial, gratuita/no exclusiva, intransferible y revocable para jugar ${LEGAL_OPERATOR.appName} con fines de entretenimiento personal o competencia comunitaria.`,
          'Queda prohibido descompilar, redistribuir comercialmente sin autorización o explotar vulnerabilidades de red/simulación.'
        ]
      },
      {
        heading: '3. Código de Conducta y Juego Limpio',
        paragraphs: [
          'Están estrictamente prohibidos los bots, macros de automatización, alteración de paquetes binarios, suplantación de identidad, spam masivo, ataques de denegación de servicio (DDoS) contra anfitriones o servidores de señalización, y cualquier contenido ilegal, discriminatorio o de acoso en el chat o apodos.',
          'Nos reservamos el derecho de suspender, reiniciar métricas o cancelar cuentas que infrinjan estas normas o manipulen el ranking competitivo.'
        ]
      },
      {
        heading: '4. Disponibilidad del Servicio y Limitación de Responsabilidad',
        paragraphs: [
          'El servicio se proporciona "tal cual" y "según disponibilidad". La estabilidad de las salas P2P depende también de la conexión del anfitrión (Host) elegido por los jugadores.',
          'En la máxima medida permitida por la ley aplicable, el operador no responde por pérdidas indirectas, cortes de internet de terceros o incompatibilidades de red local, sin afectar los derechos irrenunciables que te correspondan como consumidor en tu país.'
        ]
      },
      {
        heading: '5. Ley Aplicable y Contacto',
        paragraphs: [
          `Estos términos se rigen por las leyes de ${LEGAL_OPERATOR.country}, sin perjuicio de las normas imperativas de protección al consumidor del país de residencia habitual del usuario.`,
          `Para consultas o notificaciones legales escribe a ${LEGAL_OPERATOR.supportEmail}.`
        ]
      }
    ]
  },
  {
    id: 'legal',
    shortLabel: 'Aviso Legal / IP',
    title: 'Aviso Legal y Propiedad Intelectual',
    summary:
      'Identidad del titular, reserva de derechos de software y declaración explícita de independencia respecto a marcas de terceros.',
    sections: [
      {
        heading: '1. Titular del Proyecto',
        paragraphs: [
          `Nombre comercial / proyecto: ${LEGAL_OPERATOR.appName}.`,
          `Titular y desarrollador: ${LEGAL_OPERATOR.owner} · País: ${LEGAL_OPERATOR.country} · Correo oficial: ${LEGAL_OPERATOR.supportEmail}.`
        ]
      },
      {
        heading: '2. Declaración de No Afiliación',
        paragraphs: [
          `${LEGAL_OPERATOR.appName} es un videojuego independiente original de fútbol 2D con física determinista y mecánicas propias (Turbo, Dash, Efecto Magnus y física elástica de redes).`,
          'Este proyecto NO está afiliado, patrocinado, asociado ni respaldado por Haxball, Basro, FIFA, UEFA, CONMEBOL ni ninguna liga, federación o club deportivo profesional. Los diseños visuales inspirados en balones o estadios de épocas futbolísticas son homenajes estilísticos originales sin marcas registradas de terceros.'
        ]
      },
      {
        heading: '3. Propiedad Intelectual y Reclamaciones',
        paragraphs: [
          'El código fuente, arquitectura de red, efectos sonoros procedurales e interfaz gráfica están protegidos por la legislación vigente sobre derechos de autor.',
          `Si consideras que algún contenido vulnera derechos de propiedad intelectual, envía una notificación motivada a ${LEGAL_OPERATOR.supportEmail} para su revisión inmediata.`
        ]
      }
    ]
  },
  {
    id: 'cookies',
    shortLabel: 'Cookies / Storage',
    title: 'Almacenamiento Local y Tecnologías Técnicas',
    summary:
      'Uso exclusivo de almacenamiento local técnico (localStorage) necesario para sesión, controles y estética; cero rastreo publicitario.',
    sections: [
      {
        heading: '1. Almacenamiento Estrictamente Necesario',
        paragraphs: [
          `${LEGAL_OPERATOR.appName} utiliza localStorage del navegador / WebView exclusivamente para recordar preferencias técnicas esenciales del usuario:`,
          '• Token/sesión de autenticación local cuando el usuario inicia sesión.\n• Configuración de audio, controles/keybinds, diseño HUD móvil, vista de cámara, equipación y skin del balón.\n• Registro de aceptación de los Términos y Política de Privacidad.'
        ]
      },
      {
        heading: '2. Ausencia de Rastreadores Publicitarios',
        paragraphs: [
          'No utilizamos cookies de seguimiento publicitario, píxeles de remarketing ni perfiles de comportamiento entre sitios web.',
          'Puedes limpiar estos datos en cualquier momento desde la configuración de tu navegador/dispositivo o al cerrar y restablecer tu sesión local.'
        ]
      }
    ]
  },
  {
    id: 'rights',
    shortLabel: 'Tus Derechos / Borrado',
    title: 'Derechos del Usuario y Eliminación de Cuenta',
    summary:
      'Procedimiento inmediato dentro de la app y por correo para eliminar tu cuenta, replays y perfil competitivo.',
    sections: [
      {
        heading: '1. Eliminación Inmediata Desde la Aplicación',
        paragraphs: [
          'Cualquier jugador autenticado puede eliminar definitivamente su cuenta entrando a Configuración (⚙) → Cuenta → "Eliminar mi cuenta permanentemente".',
          'Esta acción revoca la sesión activa y elimina el perfil de usuario, estadísticas en ranking, replays guardados en la nube y credencial de acceso en Auth de forma irreversible.'
        ]
      },
      {
        heading: '2. Solicitudes por Correo (GDPR / CCPA / LGPD / Ley 1581)',
        paragraphs: [
          `También puedes solicitar acceso, rectificación, copia de datos o borrado manual enviando un correo desde tu dirección registrada a ${LEGAL_OPERATOR.supportEmail} con el asunto "Solicitud de Datos / Eliminación - ${LEGAL_OPERATOR.appName}".`,
          'Todas las solicitudes verificadas se atienden dentro del plazo legal aplicable (generalmente entre 48 horas y un máximo de 30 días calendario).'
        ]
      }
    ]
  }
];

export const CONSENT_STORAGE_KEY = 'legacyx_legal_consent_v1';

export function parseLegalDocFromLocation(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''
): LegalDocId | null {
  try {
    const params = new URLSearchParams(search);
    const paramDoc = (params.get('legal') || '').trim().toLowerCase();
    if (isValidLegalDocId(paramDoc)) {
      return paramDoc;
    }
    if (params.has('support')) {
      return 'rights';
    }
    const lowerPath = pathname.toLowerCase().replace(/\/+$/, '') || '/';
    if (lowerPath === '/legal') {
      return 'privacy';
    }
    const match = lowerPath.match(/^\/legal\/(privacy|terms|legal|cookies|rights)$/);
    if (match && match[1] && isValidLegalDocId(match[1])) {
      return match[1];
    }
  } catch {
    // Ignore malformed query string
  }
  return null;
}

export function getLegalHref(docId: LegalDocId = 'privacy'): string {
  return docId === 'privacy' ? '/legal/privacy' : `/legal/${docId}`;
}

export function isLegalRoute(pathname: string): boolean {
  const clean = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  return (
    clean === '/legal' ||
    /^\/legal\/(privacy|terms|legal|cookies|rights)$/.test(clean)
  );
}

export function isKnownAppRoute(pathname: string): boolean {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '/index.html') return true;
  if (/^\/room\/[A-Za-z0-9_-]+$/.test(clean)) return true;
  return isLegalRoute(clean);
}

export function isValidLegalDocId(val: string): val is LegalDocId {
  return val === 'privacy' || val === 'terms' || val === 'legal' || val === 'cookies' || val === 'rights';
}
