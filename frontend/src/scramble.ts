import { useEffect, useState } from "react";

const SIGNOS = "ABCDEF0123456789<>/{}#$%&*";
const DURACION = 420; // ms

// Descifra el texto de izquierda a derecha pasando por signos aleatorios. Sin movimiento, el texto llega tal cual.
export function useScramble(texto: string) {
  const [visible, setVisible] = useState(texto);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setVisible(texto); return; }
    const inicio = performance.now();
    let id = 0;
    const paso = (ahora: number) => {
      const fijas = Math.floor(((ahora - inicio) / DURACION) * texto.length);
      setVisible([...texto].map((c, i) => (i < fijas || c === " " ? c : SIGNOS[Math.floor(Math.random() * SIGNOS.length)])).join(""));
      if (fijas < texto.length) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [texto]);

  return visible;
}
