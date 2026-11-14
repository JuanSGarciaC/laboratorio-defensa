import type { Ataque, Ejecucion, Modo } from "./types";

export const NOMBRE: Record<Modo, string> = { vulnerable: "Versión vulnerable", endurecida: "Versión endurecida" };

interface Props {
  modo: Modo;
  ataque: Ataque;
  ej: Ejecucion | null;
  hechos: number; // peticiones ya respondidas en la reproducción
  ritmo: number; // ms por petición
}

// Un carril por versión del objetivo: Atacar → Objetivo → resultado, de arriba abajo.
// Solo se mueve mientras hay una petición en camino.
export default function Carril({ modo, ataque, ej, hechos, ritmo }: Props) {
  const total = ej?.pasos.length ?? ataque.n_peticiones;
  const vistos = Math.min(hechos, total);
  const enCurso = !!ej && vistos < total;
  const fin = !!ej && vistos >= total;
  const estado = !ej ? "reposo" : enCurso ? "en-curso" : ej.exito ? "exito" : "fallo";
  const ultimo = ej && vistos > 0 ? ej.pasos[vistos - 1] : null;
  const decisivo = ej?.pasos.find((p) => p.cumple) ?? null;
  // Al terminar, el objetivo enseña la respuesta que decidió el resultado, no la última.
  const mostrado = fin ? decisivo ?? ultimo : ultimo;

  return (
    <section className={`carril carril-${modo} estado-${estado}`} data-testid={`carril-${modo}`} data-estado={estado} aria-label={NOMBRE[modo]}>
      <header>
        <h3>{NOMBRE[modo]}</h3>
        <span className="carril-cuenta">{ej ? `${vistos} de ${total} peticiones` : `${total} ${total === 1 ? "petición lista" : "peticiones listas"}`}</span>
      </header>

      <div className="via">
        <div className={`node n-atacar${enCurso ? " lit" : ""}`}>
          <span className="node-label">Atacar</span>
          <span className="node-title">{ataque.nombre}</span>
        </div>
        <div className={`tramo t-ida${enCurso || fin ? " hot" : ""}`}>
          {/* key: la animación arranca de nuevo con cada petición */}
          {enCurso && <span key={vistos} className="viajera" style={{ animationDuration: `${Math.max(ritmo, 1)}ms` }} />}
        </div>
        <div className={`node n-objetivo${enCurso ? " busy" : ""}${fin ? " lit" : ""}`}>
          <span className="node-label">Objetivo</span>
          <span className="node-count">{mostrado ? mostrado.estado : "—"}</span>
          <span className="node-sub">{mostrado ? `respuesta a la petición ${mostrado.n}` : `ruta /${modo}/${ataque.funcion}`}</span>
        </div>
        <div className={`tramo t-fin${fin ? " hot" : ""}`} />
        <p className="final" aria-live="polite">
          {fin && ej ? (
            <>
              <strong data-testid={`resultado-${modo}`}>{ej.exito ? "El ataque tuvo éxito" : "El ataque no tuvo éxito"}</strong>
              <span>{decisivo ? `en la petición ${decisivo.n} de ${total}` : `tras ${total} ${total === 1 ? "petición" : "peticiones"}`}</span>
            </>
          ) : (
            <span className="pendiente">{enCurso ? "Atacando…" : "Sin lanzar"}</span>
          )}
        </p>
      </div>
    </section>
  );
}
