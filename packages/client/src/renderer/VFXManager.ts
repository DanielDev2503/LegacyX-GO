export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  type: 'magnus' | 'fire' | 'spark';
}

export interface FloatingText {
  active: boolean;
  text: string;
  color: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  scale: number;
  alpha: number;
}

const MAX_PARTICLES = 128;
const MAX_TEXTS = 8;

export class VFXManager {
  private particles: Particle[];
  private floatingTexts: FloatingText[];

  public magnusTrailEnabled: boolean = true;
  public fireTrailEnabled: boolean = true;
  public floatingPointsEnabled: boolean = true;

  constructor() {
    // Pre-alocación de pool de partículas para garantizar Zero-GC
    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = {
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: '#ffffff',
        alpha: 1,
        type: 'spark'
      };
    }

    // Pre-alocación de pool de textos flotantes
    this.floatingTexts = new Array(MAX_TEXTS);
    for (let i = 0; i < MAX_TEXTS; i++) {
      this.floatingTexts[i] = {
        active: false,
        text: '',
        color: '#ffffff',
        x: 0,
        y: 0,
        life: 0,
        maxLife: 1.5,
        scale: 1,
        alpha: 1
      };
    }
  }

  private allocParticle(): Particle | null {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.particles[i].active) {
        return this.particles[i];
      }
    }
    return null;
  }

  private allocText(): FloatingText | null {
    for (let i = 0; i < MAX_TEXTS; i++) {
      if (!this.floatingTexts[i].active) {
        return this.floatingTexts[i];
      }
    }
    return null;
  }

  /**
   * Estela luminosa/neón para trayectorias curvas generadas por el efecto Magnus
   */
  public emitMagnusTrail(x: number, y: number, color: string = '#00e5ff', radius: number = 8): void {
    if (!this.magnusTrailEnabled) return;
    const p = this.allocParticle();
    if (!p) return;

    p.active = true;
    p.type = 'magnus';
    p.x = x;
    p.y = y;
    p.vx = (Math.random() - 0.5) * 4;
    p.vy = (Math.random() - 0.5) * 4;
    p.size = radius * 0.9;
    p.color = color;
    p.life = 0;
    p.maxLife = 0.35; // 350 ms de duración
    p.alpha = 0.65;
  }

  /**
   * Partículas ardientes cuando la velocidad del balón supera 950 px/s
   */
  public emitFireTrail(x: number, y: number, vx: number, vy: number): void {
    if (!this.fireTrailEnabled) return;
    for (let i = 0; i < 2; i++) {
      const p = this.allocParticle();
      if (!p) return;

      p.active = true;
      p.type = 'fire';
      p.x = x + (Math.random() - 0.5) * 6;
      p.y = y + (Math.random() - 0.5) * 6;
      // Dirección contraria al vector de velocidad del balón
      p.vx = -vx * 0.15 + (Math.random() - 0.5) * 15;
      p.vy = -vy * 0.15 + (Math.random() - 0.5) * 15;
      p.size = 5 + Math.random() * 4;
      p.color = Math.random() > 0.4 ? '#ff3f34' : '#ffa801';
      p.life = 0;
      p.maxLife = 0.25;
      p.alpha = 0.85;
    }
  }

  /**
   * Chispas radiales emitidas en el punto de contacto con postes
   */
  public emitPostSparks(x: number, y: number, count: number = 12): void {
    for (let i = 0; i < count; i++) {
      const p = this.allocParticle();
      if (!p) return;

      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;

      p.active = true;
      p.type = 'spark';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 1.8 + Math.random() * 1.5;
      p.color = Math.random() > 0.3 ? '#ffd32a' : '#ffffff';
      p.life = 0;
      p.maxLife = 0.30;
      p.alpha = 1.0;
    }
  }

  /**
   * Textos flotantes efímeros para goles o transiciones de juego
   */
  public showFloatingText(text: string, color: string = '#ffd32a', x: number = 0, y: number = -60, durationSec: number = 2.0): void {
    if (!this.floatingPointsEnabled) return;
    const t = this.allocText();
    if (!t) return;

    t.active = true;
    t.text = text;
    t.color = color;
    t.x = x;
    t.y = y;
    t.life = 0;
    t.maxLife = durationSec;
    t.scale = 0.5;
    t.alpha = 1.0;
  }

  public update(dt: number): void {
    // 1. Actualización de partículas físicas
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      const progress = p.life / p.maxLife;
      p.alpha = Math.max(0, 1.0 - progress);
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.type === 'spark') {
        p.vx *= 0.92;
        p.vy *= 0.92;
      } else if (p.type === 'fire') {
        p.size *= 0.96;
      }
    }

    // 2. Actualización de textos flotantes
    for (let i = 0; i < MAX_TEXTS; i++) {
      const t = this.floatingTexts[i];
      if (!t.active) continue;

      t.life += dt;
      if (t.life >= t.maxLife) {
        t.active = false;
        continue;
      }

      const progress = t.life / t.maxLife;

      // Animación de entrada: escala elástica
      if (progress < 0.2) {
        t.scale = 0.5 + (progress / 0.2) * 0.7; // De 0.5 a 1.2
      } else if (progress < 0.3) {
        t.scale = 1.2 - ((progress - 0.2) / 0.1) * 0.2; // De 1.2 a 1.0
      } else {
        t.scale = 1.0;
      }

      // Desvanecimiento suave en el tramo final
      if (progress > 0.6) {
        t.alpha = 1.0 - (progress - 0.6) / 0.4;
      } else {
        t.alpha = 1.0;
      }

      // Ascenso vertical gradual
      t.y -= 15 * dt;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    // 1. Renderizado de partículas
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active || p.alpha <= 0.01) continue;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'magnus') {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'fire') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // 2. Renderizado de textos flotantes efímeros
    for (let i = 0; i < MAX_TEXTS; i++) {
      const t = this.floatingTexts[i];
      if (!t.active || t.alpha <= 0.01) continue;

      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.translate(t.x, t.y);
      ctx.scale(t.scale, t.scale);

      ctx.font = "bold 38px 'Space Grotesk', system-ui, sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Sombra proyectada
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.lineWidth = 6;
      ctx.strokeText(t.text, 0, 0);

      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);

      ctx.restore();
    }
  }

  public clear(): void {
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles[i].active = false;
    for (let i = 0; i < MAX_TEXTS; i++) this.floatingTexts[i].active = false;
  }
}
