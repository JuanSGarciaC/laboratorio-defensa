import type { Ataque, Modo, Paso } from "./types";

export type Estado = "reposo" | "en-curso" | "exito" | "fallo";

interface Props {
  ataque: Ataque;
  modo: Modo;
  estado: Estado;
  hechos: number; // pasos ya respondidos
  total: number;
  ultimo: Paso | null; // último paso respondido
  ritmo: number; // ms por paso
}

// Lienzo: Atacar → Objetivo → Resultado. Solo se mueve mientras hay una petición en camino.
export default function Flow({ ataque, modo, estado, hechos, total, ultimo, ritmo }: Props) {
  const enCurso = estado === "en-curso";
  const fin = estado === "exito" || estado === "fallo";
  return (
    <div className={`flow estado-${estado}`}>
      <div className="flow-scroll">
        <div className="flow-stage">
          <svg viewBox="0 0 1100 300" preserveAspectRatio="none" aria-hidden="true">
            <line className={`edge e-ataque${enCurso || fin ? " hot" : ""}`} x1="230" y1="150" x2="455" y2="150" />
            <line className={`edge e-resultado${fin ? " hot" : ""}`} x1="645" y1="150" x2="870" y2="150" />
          </svg>
          {/* key: la animación arranca de nuevo con cada petición */}
          {enCurso && <span key={hechos} className="viajera" style={{ animationDuration: `${Math.max(ritmo, 1)}ms` }} />}

          <div className={`node n-atacar${enCurso ? " lit" : ""}`} data-testid="nodo-atacar" data-activo={enCurso}>
            <span className="node-label">Atacar</span>
            <span className="node-count">{estado === "reposo" ? total : `${hechos} / ${total}`}</span>
            <span className="node-title">{ataque.nombre}</span>
            <span className="node-sub">{estado === "reposo" ? (total === 1 ? "petición lista" : "peticiones listas") : "peticiones enviadas"}</span>
          </div>

          <div className={`node n-objetivo modo-${modo}${enCurso ? " busy" : ""}${fin ? " lit" : ""}`} data-testid="nodo-objetivo" data-activo={enCurso}>
            <span className="node-label">Objetivo</span>
            <span className="node-count">{ultimo ? ultimo.estado : "—"}</span>
            <span className="node-title">{modo === "vulnerable" ? "Versión vulnerable" : "Versión endurecida"}</span>
            <span className="node-sub">{ultimo ? "última respuesta HTTP" : `ruta /${ataque.funcion}`}</span>
          </div>

          <div className={`node n-resultado${fin ? " lit" : ""}`} data-testid="nodo-resultado" data-activo={fin}>
            <span className="node-label">Resultado</span>
            <span className="node-count">{estado === "exito" ? "Éxito" : estado === "fallo" ? "Sin éxito" : "—"}</span>
            <span className="node-title">
              {estado === "exito" ? "El ataque consiguió lo que buscaba" : estado === "fallo" ? "La aplicación resistió" : "Prueba objetiva"}
            </span>
            <span className="node-sub">{fin ? "comprobado en la respuesta" : "se comprueba en la respuesta"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
