// Motor del lienzo de ataques: un solo bucle requestAnimationFrame para todos los carriles.
// Cada petición real es un paquete que baja de Atacar al Objetivo; al llegar, su desenlace
// (bloqueo, rebote o brecha) sale de los datos del paso, no de la animación.
// El DOM sigue siendo la fuente de verdad: el lienzo solo decora lo que el panel ya dice.

import type { Modo, Paso } from "../types";

const COLOR = { cyan: "#56d4ff", verde: "#4ade9a", rojo: "#ff8278", gris: "#93a1b8", blanco: "#ffffff" } as const;
type Color = keyof typeof COLOR;
type Desenlace = "bloqueo" | "rebote" | "brecha";

const REJILLA = 22; // misma retícula de puntos que el fondo de .via
const BLOQUEO_FUERTE = new Set([403, 423, 429]);

interface Paquete { t0: number; dur: number; desenlace: Desenlace; fuerte: boolean; estela: { x: number; y: number }[]; fase: 0 | 1 | 2 | 3 }
interface Chispa { x: number; y: number; vx: number; vy: number; vida: number; max: number; color: Color; r: number }
interface Onda { x: number; y: number; t0: number; dur: number; radio: number; color: Color }
interface Luz { x: number; y: number; t0: number; dur: number; radio: number; color: Color }
interface Geo { w: number; h: number; cx: number; salida: number; objArriba: number; objAbajo: number; objAncho: number; meta: number }

export function desenlace(p: Paso, modo: Modo): Desenlace {
  if (p.cumple) return "brecha";
  return modo === "endurecida" ? "bloqueo" : "rebote";
}

// Destello radial pre-renderizado por color: drawImage es mucho más barato que crear gradientes por cuadro.
const sprites = new Map<Color, HTMLCanvasElement>();
function sprite(c: Color) {
  let s = sprites.get(c);
  if (!s) {
    s = document.createElement("canvas");
    s.width = s.height = 64;
    const g = s.getContext("2d")!;
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, COLOR[c]);
    rg.addColorStop(0.25, COLOR[c] + "aa");
    rg.addColorStop(1, COLOR[c] + "00");
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    sprites.set(c, s);
  }
  return s;
}

const facil = (t: number) => 1 - (1 - t) * (1 - t); // ease-out
const acelera = (t: number) => t * t * (0.6 + 0.4 * t); // la petición acelera hacia el objetivo

export class Escena {
  private ctx: CanvasRenderingContext2D;
  private geo: Geo = { w: 0, h: 0, cx: 0, salida: 0, objArriba: 0, objAbajo: 0, objAncho: 0, meta: 0 };
  private dpr = 1;
  private paquetes: Paquete[] = [];
  private chispas: Chispa[] = [];
  private ondas: Onda[] = [];
  private luces: Luz[] = [];
  private escudo = 0; // energía del escudo, 0..1.4
  private escudoBase = 0; // nivel en reposo tras un ataque frenado
  private impacto = -1e9; // instante del último golpe contra el escudo
  private enReposo = true;
  private proximoPulso = 0;
  private sucio = true;
  visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;

  constructor(private canvas: HTMLCanvasElement, private via: HTMLElement, private modo: Modo, private ligero: boolean) {
    this.ctx = canvas.getContext("2d")!;
    this.ro = new ResizeObserver(() => this.medir());
    this.ro.observe(via);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; motor.despertar(); });
    this.io.observe(via);
    this.medir();
  }

  private get tope() { return this.ligero ? 140 : 300; }

  medir() {
    const v = this.via.getBoundingClientRect();
    const r = (sel: string) => this.via.querySelector(sel)?.getBoundingClientRect();
    const a = r(".n-atacar"), o = r(".n-objetivo"), f = r(".final");
    if (!a || !o || !f || !v.width) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.via.clientWidth, h = this.via.clientHeight;
    const borde = (v.width - w) / 2; // el lienzo cubre la caja de relleno, dentro del borde
    if (this.canvas.width !== Math.round(w * this.dpr) || this.canvas.height !== Math.round(h * this.dpr)) {
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
    }
    const y = (n: number) => n - v.top - borde;
    this.geo = { w, h, cx: w / 2, salida: y(a.bottom), objArriba: y(o.top), objAbajo: y(o.bottom), objAncho: o.width, meta: y(f.top) - 2 };
    this.sucio = true;
    motor.despertar();
  }

  private get yEscudo() { return this.geo.objArriba - 13; }

  lanzar(p: Paso, ms: number, ahora = performance.now()) {
    this.enReposo = false;
    const d = desenlace(p, this.modo);
    this.paquetes.push({ t0: ahora, dur: Math.max(ms, 120), desenlace: d, fuerte: BLOQUEO_FUERTE.has(p.estado), estela: [], fase: 0 });
    motor.despertar();
  }

  terminar(exito: boolean) {
    // Ataque frenado: el escudo se queda encendido a media potencia. Brecha: se apaga.
    this.escudoBase = this.modo === "endurecida" && !exito ? 0.45 : 0;
  }

  reset() {
    this.paquetes = []; this.chispas = []; this.ondas = []; this.luces = [];
    this.escudo = 0; this.escudoBase = 0; this.enReposo = true; this.sucio = true;
    motor.despertar();
  }

  destruir() { this.ro.disconnect(); this.io.disconnect(); }

  private chisporroteo(x: number, y: number, n: number, color: Color, ang: number, abertura: number, vel: number) {
    n = this.ligero ? Math.ceil(n / 2) : n;
    for (let i = 0; i < n && this.chispas.length < this.tope; i++) {
      const a = ang + (Math.random() - 0.5) * abertura, v = vel * (0.35 + Math.random() * 0.65);
      const max = 380 + Math.random() * 420;
      this.chispas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: max, max, color, r: 1 + Math.random() * 1.6 });
    }
  }

  private golpe(t: number, x: number, y: number, color: Color, radio: number) {
    this.ondas.push({ x, y, t0: t, dur: 520, radio, color });
    this.luces.push({ x, y, t0: t, dur: 700, radio: radio * 2.6, color });
  }

  private sacudir() {
    if (this.ligero) return;
    this.via.closest(".carril")?.animate(
      [{ transform: "translate(0,0)" }, { transform: "translate(-4px,1px)" }, { transform: "translate(3px,-1px)" }, { transform: "translate(-2px,0)" }, { transform: "translate(0,0)" }],
      { duration: 280, easing: "ease-out" },
    );
  }

  // Avanza la simulación. Devuelve true si queda algo en movimiento.
  paso(t: number, dt: number): boolean {
    const g = this.geo;
    let vivo = false;

    // Pulso en reposo: una chispa tenue recorre el tramo de ida cada pocos segundos.
    if (this.enReposo && t > this.proximoPulso) {
      this.proximoPulso = t + 2600 + Math.random() * 900;
      this.ondas.push({ x: g.cx, y: g.salida, t0: t, dur: 1100, radio: -1, color: "cyan" }); // radio -1: pulso viajero
    }

    for (const p of this.paquetes) {
      const e = (t - p.t0) / p.dur;
      if (p.fase === 0) {
        const y = g.salida + (this.yEscudo - g.salida) * acelera(Math.min(e, 1));
        p.estela.unshift({ x: g.cx, y });
        if (p.estela.length > (this.ligero ? 1 : 9)) p.estela.pop();
        if (e >= 1) {
          if (p.desenlace === "bloqueo") {
            this.escudo = Math.min(1.4, this.escudo + (p.fuerte ? 0.75 : 0.45));
            this.impacto = t;
            this.chisporroteo(g.cx, this.yEscudo, p.fuerte ? 26 : 16, "verde", -Math.PI / 2, Math.PI * 1.1, 0.32);
            this.golpe(t, g.cx, this.yEscudo, "verde", p.fuerte ? 46 : 32);
            p.fase = 3;
          } else if (p.desenlace === "rebote") {
            // Sin defensa: la petición llega, el objetivo responde, nada se rompe.
            this.chisporroteo(g.cx, g.objArriba, 6, "gris", -Math.PI / 2, Math.PI * 0.9, 0.16);
            this.golpe(t, g.cx, g.objArriba, "cyan", 22);
            p.fase = 3;
          } else {
            this.escudo = 0;
            this.chisporroteo(g.cx, g.objArriba, 18, "rojo", -Math.PI / 2, Math.PI * 1.4, 0.28);
            this.golpe(t, g.cx, g.objArriba, "rojo", 40);
            this.sacudir();
            p.fase = 1; p.t0 = t;
          }
        }
      } else if (p.fase === 1) {
        // Atraviesa el objetivo (oculto tras el nodo) y cae hacia el resultado.
        const total = 420, k = Math.min((t - p.t0) / total, 1);
        const y = g.objArriba + (g.meta - g.objArriba) * k;
        p.estela.unshift({ x: g.cx, y });
        if (p.estela.length > (this.ligero ? 1 : 12)) p.estela.pop();
        if (k >= 1) {
          this.chisporroteo(g.cx, g.meta, 30, "rojo", -Math.PI / 2, Math.PI * 1.6, 0.3);
          this.golpe(t, g.cx, g.meta, "rojo", 48);
          p.fase = 3;
        }
      }
      if (p.fase === 3 && p.estela.length) p.estela.pop(); // la estela se recoge
      vivo = true;
    }
    this.paquetes = this.paquetes.filter((p) => p.fase !== 3 || p.estela.length);

    for (const c of this.chispas) {
      c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 0.0006 * dt; c.vx *= 0.985; c.vy *= 0.985; c.vida -= dt;
    }
    this.chispas = this.chispas.filter((c) => c.vida > 0);
    this.ondas = this.ondas.filter((o) => t - o.t0 < o.dur);
    this.luces = this.luces.filter((l) => t - l.t0 < l.dur);

    const antes = this.escudo;
    if (this.escudo > this.escudoBase) this.escudo = Math.max(this.escudoBase, this.escudo * Math.pow(0.9988, dt));
    else this.escudo += (this.escudoBase - this.escudo) * Math.min(1, dt / 260);
    const cambia = Math.abs(this.escudo - antes) > 0.0005 || t - this.impacto < 600;

    vivo ||= this.chispas.length > 0 || this.ondas.length > 0 || this.luces.length > 0 || cambia;
    if (vivo) this.sucio = true;
    return vivo || this.enReposo;
  }

  dibujar(t: number) {
    if (!this.sucio) return;
    const { ctx, geo: g } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    ctx.globalCompositeOperation = "lighter";

    // E3: la retícula de puntos se enciende alrededor de cada impacto.
    for (const l of this.luces) {
      const k = 1 - (t - l.t0) / l.dur;
      ctx.fillStyle = COLOR[l.color];
      const x0 = Math.floor((l.x - l.radio) / REJILLA), x1 = Math.ceil((l.x + l.radio) / REJILLA);
      const y0 = Math.floor((l.y - l.radio) / REJILLA), y1 = Math.ceil((l.y + l.radio) / REJILLA);
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
        const px = i * REJILLA + REJILLA / 2, py = j * REJILLA + REJILLA / 2;
        const d = Math.hypot(px - l.x, py - l.y) / l.radio;
        if (d >= 1) continue;
        ctx.globalAlpha = k * (1 - d) * 0.9;
        ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
      }
    }

    // Escudo: una fila de hexágonos en arco sobre el objetivo.
    if (this.escudo > 0.01) this.dibujarEscudo(t);

    for (const o of this.ondas) {
      const k = (t - o.t0) / o.dur;
      if (o.radio < 0) {
        // pulso de reposo bajando por el tramo
        const y = g.salida + (g.objArriba - g.salida) * k;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.5;
        ctx.drawImage(sprite(o.color), g.cx - 9, y - 9, 18, 18);
        continue;
      }
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = COLOR[o.color];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, o.radio * facil(k), o.radio * facil(k) * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.9;
      const s = o.radio * 1.1 * (1 - k * 0.5);
      ctx.drawImage(sprite(o.color), o.x - s, o.y - s, s * 2, s * 2);
    }

    for (const p of this.paquetes) {
      const color: Color = p.fase === 1 || (p.desenlace === "brecha" && p.fase === 0 && p.estela[0]?.y > g.objArriba - 60) ? "rojo" : "cyan";
      p.estela.forEach((e, i) => {
        const k = 1 - i / (p.estela.length + 1);
        const r = 13 * k;
        ctx.globalAlpha = k * 0.85;
        ctx.drawImage(sprite(color), e.x - r, e.y - r, r * 2, r * 2);
      });
      const cab = p.estela[0];
      if (cab && p.fase !== 3) {
        ctx.globalAlpha = 1;
        ctx.drawImage(sprite("blanco"), cab.x - 5, cab.y - 5, 10, 10);
      }
    }

    for (const c of this.chispas) {
      const k = c.vida / c.max;
      ctx.globalAlpha = k;
      ctx.fillStyle = COLOR[c.color];
      ctx.fillRect(c.x - c.r / 2, c.y - c.r / 2, c.r, c.r);
      if (!this.ligero && k > 0.5) {
        ctx.globalAlpha = (k - 0.5) * 0.8;
        ctx.drawImage(sprite(c.color), c.x - 6, c.y - 6, 12, 12);
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    this.sucio = false;
  }

  private dibujarEscudo(t: number) {
    const { ctx, geo: g } = this;
    const ancho = Math.min(g.objAncho, g.w - 24) * 0.92, mitad = ancho / 2;
    const r = 7, paso = r * 1.8;
    const n = Math.floor(ancho / paso);
    const golpe = Math.max(0, 1 - (t - this.impacto) / 600);
    ctx.strokeStyle = COLOR.verde;
    ctx.lineWidth = 1.2;
    for (let i = 0; i <= n; i++) {
      const x = g.cx - mitad + (i * ancho) / n;
      const u = (x - g.cx) / mitad;
      const y = this.yEscudo - (1 - u * u) * 9 + (i % 2) * 3;
      const cerca = Math.max(0, 1 - Math.abs(x - g.cx) / (mitad * 0.6));
      const a = Math.min(1, this.escudo * (0.35 + 0.65 * (1 - Math.abs(u)))) * (0.55 + golpe * cerca * 0.9);
      if (a < 0.02) continue;
      ctx.globalAlpha = Math.min(a, 1);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = Math.PI / 6 + (k * Math.PI) / 3;
        const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = Math.min(1, this.escudo) * 0.5;
    ctx.drawImage(sprite("verde"), g.cx - mitad * 0.7, this.yEscudo - 26, mitad * 1.4, 36);
  }
}

// Un único bucle para todas las escenas; se duerme cuando no hay nada visible o nada que mover.
class Motor {
  private escenas = new Set<Escena>();
  private raf = 0;
  private ultimo = 0;
  private oculto = typeof document !== "undefined" && document.hidden;

  constructor() {
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", () => { this.oculto = document.hidden; this.despertar(); });
  }

  alta(e: Escena) { this.escenas.add(e); this.despertar(); }
  baja(e: Escena) { this.escenas.delete(e); e.destruir(); }

  despertar() {
    if (this.raf || this.oculto) return;
    this.ultimo = performance.now();
    this.raf = requestAnimationFrame(this.cuadro);
  }

  private cuadro = (t: number) => {
    this.raf = 0;
    if (this.oculto) return;
    const dt = Math.min(t - this.ultimo, 50); // tras una pausa no hay saltos
    this.ultimo = t;
    let seguir = false;
    for (const e of this.escenas) {
      const vivo = e.paso(t, dt);
      if (e.visible) e.dibujar(t);
      seguir ||= vivo && e.visible;
    }
    if (seguir) this.raf = requestAnimationFrame(this.cuadro);
  };
}

export const motor = new Motor();
