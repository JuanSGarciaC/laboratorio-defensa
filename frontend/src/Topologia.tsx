import type { Ataque, Ejecucion, Modo } from "./types";

export const NOMBRE: Record<Modo, string> = { vulnerable: "Versión vulnerable", endurecida: "Versión endurecida" };

interface Props {
  modo: Modo;
  ataque: Ataque;
  ej: Ejecucion | null;
  hechos: number; // peticiones ya reproducidas
}

// Una fila por versión: atacante → ruta del objetivo, una marca por petición y el resultado.
export default function Topologia({ modo, ataque, ej, hechos }: Props) {
  const total = ej?.pasos.length ?? ataque.n_peticiones;
  const vistos = Math.min(hechos, total);
  const fin = !!ej && vistos >= total;
  const estado = !ej ? "reposo" : !fin ? "en-curso" : ej.exito ? "exito" : "fallo";

  return (
    <div className={`topo topo-${modo} estado-${estado}`} data-testid={`carril-${modo}`} data-estado={estado}>
      <span className="topo-ruta"><span className="muted">atacante ──▶</span> /{modo}/{ataque.funcion}</span>
      <ol className="rastro" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => {
          const p = ej && i < vistos ? ej.pasos[i] : null;
          return <li key={i} className={!p ? "pendiente" : p.cumple ? "cumple" : p.estado === 429 ? "bloqueo" : undefined} />;
        })}
      </ol>
      <span className="topo-cuenta">{vistos}/{total}</span>
      <p className="topo-final" aria-live="polite">
        {fin && ej
          ? <strong data-testid={`resultado-${modo}`}>{ej.exito ? "El ataque tuvo éxito" : "El ataque no tuvo éxito"}</strong>
          : <span className="muted">{ej ? "Atacando…" : "Sin lanzar"}</span>}
      </p>
    </div>
  );
}
