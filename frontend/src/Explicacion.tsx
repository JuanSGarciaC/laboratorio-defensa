import { diff, porque, resumen } from "./lectura";
import type { Ataque, Ejecucion, Modo } from "./types";

const MODOS: Modo[] = ["vulnerable", "endurecida"];

// B1: lo que hay que saber antes de lanzar, en tres frases.
export function Briefing({ ataque }: { ataque: Ataque }) {
  return (
    <section className="briefing" aria-label="Qué vas a ver">
      <div><h3 className="eyebrow">Qué intenta</h3><p>{ataque.descripcion}</p></div>
      <div className="b-vulnerable"><h3 className="eyebrow">Por qué cae la vulnerable</h3><p>{ataque.falla}</p></div>
      <div className="b-endurecida"><h3 className="eyebrow">Qué cambia en la endurecida</h3><p>{ataque.defensa}</p></div>
    </section>
  );
}

// B2 + B3: el resultado en lenguaje claro y, al lado, la diferencia de código que lo explica.
export function Conclusion({ ataque, duelo }: { ataque: Ataque; duelo: Record<Modo, Ejecucion> | null }) {
  const lineas = diff(ataque.codigo.vulnerable, ataque.codigo.endurecida);
  return (
    <section className="conclusion">
      <div className="veredicto" data-testid="veredicto" aria-live="polite">
        <h3 className="eyebrow">Resultado</h3>
        {duelo ? MODOS.map((m) => (
          <p key={m} className={`frase f-${m}`} data-testid={`frase-${m}`}>
            {resumen(ataque, m, duelo[m])} <span className="muted">{porque(ataque, m, duelo[m])}</span>
          </p>
        )) : <p className="muted">Lanza el ataque: aquí verás en qué petición cae cada versión y por qué.</p>}
      </div>
      <div className="diff-caja">
        <h3 className="eyebrow">Qué cambia en el código <span className="leyenda"><span className="menos">− vulnerable</span> <span className="mas">+ endurecida</span></span></h3>
        <pre className="diff" data-testid="diff">
          {lineas.map((l, i) => (
            <span key={i} className={`dl${l.tipo === "-" ? " menos" : l.tipo === "+" ? " mas" : ""}${l.codigo ? " clave" : ""}`}>
              {`${l.tipo} ${l.texto}\n`}
            </span>
          ))}
        </pre>
      </div>
    </section>
  );
}
