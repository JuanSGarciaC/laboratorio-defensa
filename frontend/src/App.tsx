import { useEffect, useState } from "react";
import { getAtaques, getMatriz, lanzar } from "./api";
import Flow, { type Estado } from "./Flow";
import type { Ataque, Ejecucion, FilaMatriz, Modo, Paso } from "./types";

const MODOS: { id: Modo; nombre: string }[] = [
  { id: "vulnerable", nombre: "Vulnerable" },
  { id: "endurecida", nombre: "Endurecida" },
];

function trackPointer(e: React.PointerEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".glow");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

const sinMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function peticion(p: Paso, modo: Modo) {
  const consulta = Object.entries(p.params).map(([k, v]) => `${k}=${v}`).join("&");
  return `${p.metodo} /${modo}${p.ruta}${consulta ? `?${consulta}` : ""}${p.cuerpo ? `\n${JSON.stringify(p.cuerpo)}` : ""}`;
}

export default function App() {
  const [ataques, setAtaques] = useState<Ataque[] | null>(null);
  const [matriz, setMatriz] = useState<FilaMatriz[]>([]);
  const [id, setId] = useState("");
  const [modo, setModo] = useState<Modo>("vulnerable");
  const [ej, setEj] = useState<Ejecucion | null>(null);
  const [hechos, setHechos] = useState(0); // pasos ya reproducidos
  const [elegido, setElegido] = useState<number | null>(null); // paso que el usuario quiere mirar
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAtaques(), getMatriz()])
      .then(([a, m]) => { setAtaques(a); setMatriz(m); setId(a[0]?.id ?? ""); })
      .catch((e: Error) => setError(e.message));
  }, []);

  const total = ej?.pasos.length ?? 0;
  const ritmo = sinMovimiento() ? 0 : total > 8 ? 160 : 700;
  const reproduciendo = !!ej && hechos < total;

  // Reproduce una ejecución ya terminada: los pasos son reales, el ritmo es de presentación.
  useEffect(() => {
    if (!reproduciendo) return;
    const t = setTimeout(() => setHechos((h) => h + 1), ritmo);
    return () => clearTimeout(t);
  }, [reproduciendo, hechos, ritmo]);

  const limpiar = () => { setEj(null); setHechos(0); setElegido(null); setError(null); };

  async function onLanzar() {
    limpiar();
    setPidiendo(true);
    try {
      setEj(await lanzar(id, modo));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPidiendo(false); // pase lo que pase, el botón vuelve
    }
  }

  if (!ataques) {
    return (
      <main className="main">
        {error ? <><h1>No se pudo cargar el laboratorio</h1><p className="error" role="alert">{error}</p></> : <p className="muted">Cargando…</p>}
      </main>
    );
  }
  const ataque = ataques.find((a) => a.id === id);
  if (!ataque) return <main className="main"><p className="muted">El catálogo está vacío.</p></main>;

  const fin = !!ej && hechos >= total;
  const estado: Estado = !ej ? "reposo" : !fin ? "en-curso" : ej.exito ? "exito" : "fallo";
  const ultimo = ej && hechos > 0 ? ej.pasos[hechos - 1] : null;
  const decisivo = ej?.pasos.find((p) => p.cumple) ?? null;
  const visto = ej ? (elegido != null ? ej.pasos[elegido] : fin ? decisivo ?? ultimo : ultimo) : null;
  const ocupado = pidiendo || reproduciendo;

  return (
    <div className="shell" onPointerMove={trackPointer}>
      <header className="top">
        <div className="brand">
          <h1>Laboratorio de defensa</h1>
          <p>Ataques reales contra una aplicación propia. Ninguna petición sale de este servidor.</p>
        </div>
      </header>

      <main className="main">
        <section className="controles" aria-label="Elegir ataque">
          <div className="ataques" role="group" aria-label="Ataque">
            {ataques.map((a) => (
              <button key={a.id} className="ataque glow" aria-pressed={a.id === id} disabled={ocupado} onClick={() => { setId(a.id); limpiar(); }}>
                <strong>{a.nombre}</strong>
                <span className="chips"><span className="chip">{a.owasp}</span><span className="chip">ATT&amp;CK {a.attack}</span></span>
              </button>
            ))}
          </div>
          <div className="lanzar">
            <fieldset className="modos">
              <legend>Modo</legend>
              {MODOS.map((m) => (
                <label key={m.id} className={`modo modo-${m.id}`}>
                  <input type="radio" name="modo" checked={modo === m.id} disabled={ocupado} onChange={() => { setModo(m.id); limpiar(); }} />
                  {m.nombre}
                </label>
              ))}
            </fieldset>
            <button className="primary" onClick={() => void onLanzar()} disabled={ocupado}>{ocupado ? "Lanzando…" : "Lanzar"}</button>
          </div>
        </section>
        <p className="muted descripcion">{ataque.descripcion}</p>
        {error && <p className="error" role="alert">{error}</p>}

        <Flow ataque={ataque} modo={modo} estado={estado} hechos={hechos} total={ej ? total : ataque.n_peticiones} ultimo={ultimo} ritmo={ritmo} />

        <div className="veredicto" aria-live="polite">
          {fin && ej && (
            <p className={ej.exito ? "v-exito" : "v-fallo"}>
              <strong data-testid="resultado">{ej.exito ? "El ataque tuvo éxito" : "El ataque no tuvo éxito"}</strong>
              {decisivo ? ` en la petición ${decisivo.n} de ${total}.` : ` tras ${total} ${total === 1 ? "petición" : "peticiones"}.`}{" "}
              <span className="muted">Origen simulado {ej.origen}.</span>
            </p>
          )}
        </div>

        {ej && hechos > 0 && (
          <section className="panel glow" aria-labelledby="h-pasos">
            <div className="panel-head">
              <h3 id="h-pasos">Peticiones</h3>
              <span className="muted">Rojo: la respuesta cumple la prueba de éxito del ataque.</span>
            </div>
            <div className="pasos">
              {ej.pasos.slice(0, hechos).map((p, i) => (
                <button key={p.n} className={`paso${p.cumple ? " cumple" : ""}`} aria-pressed={visto?.n === p.n} onClick={() => setElegido(i)}
                  aria-label={`Petición ${p.n}: respuesta ${p.estado}${p.cumple ? ", cumple la prueba de éxito" : ""}`}>
                  {p.estado}
                </button>
              ))}
            </div>
            {visto && (
              <div className="split">
                <div><h4>Petición {visto.n}</h4><pre>{peticion(visto, ej.modo)}</pre></div>
                <div><h4>Respuesta · {visto.estado}</h4><pre>{visto.respuesta}</pre></div>
              </div>
            )}
          </section>
        )}

        <section className="panel glow" aria-labelledby="h-codigo">
          <div className="panel-head">
            <h3 id="h-codigo">El mismo código, antes y después</h3>
            <span className="muted">Es el código que se ejecuta, leído del propio programa.</span>
          </div>
          <div className="split">
            {MODOS.map((m) => (
              <div key={m.id} className={`codigo modo-${m.id}${modo === m.id ? " activo" : ""}`}>
                <h4>{m.nombre}</h4>
                <pre>{ataque.codigo[m.id]}</pre>
              </div>
            ))}
          </div>
        </section>

        <section className="panel glow" aria-labelledby="h-matriz">
          <div className="panel-head">
            <h3 id="h-matriz">Matriz de resultados</h3>
            <span className="muted">Cada ataque del catálogo, lanzado en los dos modos al arrancar.</span>
          </div>
          <table data-testid="matriz">
            <thead><tr><th scope="col">Ataque</th><th scope="col">Vulnerable</th><th scope="col">Endurecida</th></tr></thead>
            <tbody>
              {matriz.map((f) => (
                <tr key={f.ataque} className={f.ataque === id ? "actual" : undefined}>
                  <th scope="row">{f.nombre}</th>
                  {MODOS.map((m) => <td key={m.id} className={f[m.id] ? "v-exito" : "v-fallo"}>{f[m.id] ? "Tuvo éxito" : "No tuvo éxito"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
