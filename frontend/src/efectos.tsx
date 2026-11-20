import { useEffect, useRef, useState } from "react";
import { sinMovimiento } from "./movimiento";

const CIFRAS = "0123456789";
const SIGNOS = "0123456789ABCDEF#%$&*";

// B3: el código de estado se descifra hasta su valor real. Mismo número de caracteres en todo
// momento y cifras tabulares: el ancho no cambia mientras se descifra.
export function Descifra({ texto, ms = 320 }: { texto: string; ms?: number }) {
  const [ver, setVer] = useState(texto);
  const previo = useRef(texto);

  useEffect(() => {
    if (texto === previo.current) return;
    previo.current = texto;
    if (sinMovimiento() || !/\d/.test(texto)) { setVer(texto); return; }
    const juego = /^\d+$/.test(texto) ? CIFRAS : SIGNOS;
    const t0 = performance.now();
    let raf = 0;
    const cuadro = (t: number) => {
      const k = Math.min((t - t0) / ms, 1);
      const fijos = Math.floor(k * texto.length);
      setVer(k >= 1 ? texto : [...texto].map((c, i) => (i < fijos ? c : juego[(Math.random() * juego.length) | 0])).join(""));
      if (k < 1) raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => { cancelAnimationFrame(raf); setVer(texto); };
  }, [texto, ms]);

  return <>{ver}</>;
}

// H3: la petición se escribe como en una consola. El texto completo está en el DOM desde el
// principio: lo pendiente queda invisible ocupando su sitio, así el layout no se mueve.
export function Terminal({ texto, animar, onFin }: { texto: string; animar: boolean; onFin?: () => void }) {
  const [n, setN] = useState(animar && !sinMovimiento() ? 0 : texto.length);
  const fin = useRef(onFin);
  fin.current = onFin;

  useEffect(() => {
    if (!animar || sinMovimiento()) { setN(texto.length); fin.current?.(); return; }
    setN(0);
    const dur = Math.min(320, 90 + texto.length * 4);
    const t0 = performance.now();
    let raf = 0;
    const cuadro = (t: number) => {
      const k = Math.min((t - t0) / dur, 1);
      setN(Math.round(k * texto.length));
      if (k < 1) raf = requestAnimationFrame(cuadro);
      else fin.current?.();
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, [texto, animar]);

  const escribiendo = n < texto.length;
  return (
    <pre className={`terminal${escribiendo ? " escribiendo" : ""}`}>
      {texto.slice(0, n)}
      <span className="cursor-term" aria-hidden="true" />
      {escribiendo && <span className="pendiente-term">{texto.slice(n)}</span>}
    </pre>
  );
}
