import { useEffect, useRef, useState } from "react";
import { carga } from "./lectura";
import type { Ataque, Ejecucion, Modo } from "./types";

type Duelo = Record<Modo, Ejecucion>;
const sinMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Teclea el comando en ~350 ms, sea cual sea su largo. Sin movimiento aparece entero.
function useTecleo(texto: string, activo: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!activo) { setN(0); return; }
    if (sinMovimiento()) { setN(texto.length); return; }
    const inicio = performance.now();
    let id = 0;
    const paso = (t: number) => {
      const k = Math.min(texto.length, Math.ceil(((t - inicio) / 350) * texto.length));
      setN(k);
      if (k < texto.length) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [texto, activo]);
  return texto.slice(0, n);
}

// Mantiene a la vista la última línea, moviendo solo el panel, nunca la página.
function useAlFondo(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [dep]);
  return ref;
}

interface Props { ataque: Ataque; duelo: Duelo | null; hechos: number; modos: Modo[] }

// H3: la terminal del atacante (lo que se envía) y, al lado, el registro de cada servidor (lo que recibe y responde).
export default function Consola({ ataque, duelo, hechos, modos }: Props) {
  const comando = `lab lanzar ${ataque.id} --contra ${modos.join(",")}`;
  const tecleado = useTecleo(comando, !!duelo);
  const listo = !!duelo && tecleado === comando;
  const total = duelo ? Math.max(...modos.map((m) => duelo[m].pasos.length)) : 0;
  const n = listo ? Math.min(hechos, total) : 0;
  const fin = !!duelo && hechos >= total;
  const terminal = useAlFondo(`${n}${tecleado}`);

  return (
    <div className={`consola vistas-${modos.length}`}>
      <div className="terminal" ref={terminal} data-testid="terminal" role="log" aria-label="Terminal del atacante">
        <p><span className="prompt">atacante@lab:~$</span> {duelo ? tecleado : ""}{!listo && <span className="cursor" aria-hidden="true">▌</span>}</p>
        {!duelo && <p className="t-com"># elige un ataque y pulsa «Lanzar contra las dos»</p>}
        {duelo && Array.from({ length: n }, (_, i) => {
          const base = duelo[modos[0]].pasos[i] ?? duelo[modos[modos.length - 1]].pasos[i];
          return (
            <p key={i}>
              <span className="t-num">[{i + 1}/{total}]</span> {base.metodo} {base.ruta} <span className="t-carga">{carga(base)}</span>
              {modos.map((m) => {
                const p = duelo[m].pasos[i];
                return p && <span key={m} className={`t-res t-${m}${p.cumple ? " t-cumple" : ""}`}> {m} {p.estado}{p.cumple ? " ✔" : ""}</span>;
              })}
            </p>
          );
        })}
        {duelo && fin && listo && modos.map((m) => (
          <p key={m} className={duelo[m].exito ? "t-cae" : "t-resiste"}>
            {duelo[m].exito ? `✔ ${m}: prueba de éxito cumplida en la petición ${duelo[m].pasos.find((p) => p.cumple)?.n}` : `✖ ${m}: la prueba de éxito no se cumplió`}
          </p>
        ))}
      </div>
      <div className="registros">
        {modos.map((m) => <Registro key={m} modo={m} ej={duelo?.[m] ?? null} n={n} />)}
      </div>
    </div>
  );
}

function Registro({ modo, ej, n }: { modo: Modo; ej: Ejecucion | null; n: number }) {
  const pasos = ej ? ej.pasos.slice(0, n) : [];
  const ref = useAlFondo(pasos.length);
  return (
    <div className={`registro r-${modo}`} ref={ref} data-testid={`registro-${modo}`} role="log" aria-label={`Registro del servidor ${modo}`}>
      <p className="r-titulo">servidor /{modo} · access.log</p>
      {pasos.length === 0 && <p className="muted">esperando peticiones…</p>}
      {pasos.map((p) => (
        <p key={p.n} className={`r-linea e${String(p.estado)[0]}xx${p.cumple ? " r-cumple" : ""}`}>
          {ej!.origen} "{p.metodo} {p.destino}" <strong>{p.estado}</strong> {p.bytes}B {p.ms}ms
          <span className="r-cuerpo">{p.respuesta.replace(/\s+/g, " ").slice(0, 90)}</span>
        </p>
      ))}
    </div>
  );
}
