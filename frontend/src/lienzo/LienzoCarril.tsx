import { useEffect, useRef } from "react";
import type { Ejecucion, Modo } from "../types";
import { Escena, motor } from "./motor";
import { sinMovimiento } from "../movimiento";

interface Props {
  modo: Modo;
  ej: Ejecucion | null;
  vistos: number; // peticiones ya respondidas
  ritmo: number;
}

// Lienzo de un carril. Solo se monta si hay movimiento permitido; hasta que el motor arranca,
// la vía conserva su versión estática (la petición CSS), así nada depende de este script.
export default function LienzoCarril({ modo, ej, vistos, ritmo }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const escena = useRef<Escena | null>(null);
  const lanzado = useRef<{ ej: Ejecucion | null; n: number }>({ ej: null, n: -1 });

  useEffect(() => {
    const canvas = ref.current, via = canvas?.parentElement;
    if (!canvas || !via || sinMovimiento()) return;
    let e: Escena;
    try {
      e = new Escena(canvas, via, modo, window.matchMedia("(max-width: 600px)").matches);
    } catch {
      return; // sin canvas: queda la vía estática
    }
    escena.current = e;
    motor.alta(e);
    via.classList.add("lienzo-activo");
    return () => {
      via.classList.remove("lienzo-activo");
      motor.baja(e);
      escena.current = null;
      lanzado.current = { ej: null, n: -1 };
    };
  }, [modo]);

  useEffect(() => {
    const e = escena.current;
    if (!e) return;
    const ultimo = lanzado.current;
    if (!ej) {
      if (ultimo.ej) e.reset();
      lanzado.current = { ej: null, n: -1 };
      return;
    }
    if (ultimo.ej !== ej) { e.reset(); lanzado.current = { ej, n: -1 }; }
    const total = ej.pasos.length;
    // Cada petición sale cuando la anterior ya tiene respuesta; tarda lo que el ritmo de la reproducción.
    if (vistos < total && lanzado.current.n !== vistos) {
      e.medir();
      e.lanzar(ej.pasos[vistos], ritmo);
      lanzado.current.n = vistos;
    }
    if (vistos >= total && lanzado.current.n !== total) {
      e.terminar(ej.exito);
      lanzado.current.n = total;
    }
  }, [ej, vistos, ritmo]);

  return <canvas ref={ref} className="lienzo" aria-hidden="true" />;
}
