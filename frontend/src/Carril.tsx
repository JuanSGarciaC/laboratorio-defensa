import type { CSSProperties } from "react";
import type { Ataque, Ejecucion, Modo, Paso } from "./types";

// Color de la respuesta que vuelve: roja si cumple la prueba de éxito, verde si la cuenta está bloqueada.
const tono = (p: Paso) => (p.cumple ? "var(--alta)" : p.estado === 429 ? "var(--auto)" : "#dfe7f5");

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
  const enCamino = enCurso ? ej.pasos[vistos] : null; // la petición que viaja ahora

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
          {/* Baja la petición y sube la respuesta; si la cuenta está bloqueada, rebota sin entrar. */}
          {enCamino && (
            <span key={vistos} className={`viajera${enCamino.estado === 429 ? " rebota" : ""}`}
              style={{ animationDuration: `${Math.max(ritmo, 1)}ms`, "--vuelta": tono(enCamino) } as CSSProperties} />
          )}
        </div>
        <div className={`node n-objetivo${enCurso ? " busy" : ""}${fin ? " lit" : ""}`}>
          <span className="node-label">Objetivo</span>
          <span key={mostrado?.n ?? 0} className="node-count">{mostrado ? mostrado.estado : "—"}</span>
          <span className="node-sub">{mostrado ? `respuesta a la petición ${mostrado.n}` : `ruta /${modo}/${ataque.funcion}`}</span>
        </div>
        {ej && (
          // Rastro: una marca por petición respondida; la decisiva queda resaltada.
          <ol className="rastro" aria-hidden="true">
            {ej.pasos.slice(0, vistos).map((p) => (
              <li key={p.n} className={p.cumple ? "cumple" : p.estado === 429 ? "bloqueo" : undefined} />
            ))}
          </ol>
        )}
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
