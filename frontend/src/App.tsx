import { useEffect, useState } from "react";
import { getAtaques, getMatriz, lanzar } from "./api";
import Carril, { NOMBRE } from "./Carril";
import type { Ataque, Ejecucion, FilaMatriz, Modo, Paso } from "./types";

const MODOS: Modo[] = ["vulnerable", "endurecida"];
const PESTANAS = ["Peticiones", "Código", "Matriz"] as const;
type Pestana = (typeof PESTANAS)[number];
type Duelo = Record<Modo, Ejecucion>;

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
  const [duelo, setDuelo] = useState<Duelo | null>(null);
  const [hechos, setHechos] = useState(0); // peticiones ya reproducidas
  const [elegido, setElegido] = useState<number | null>(null); // petición que el usuario quiere mirar
  const [pestana, setPestana] = useState<Pestana>("Peticiones");
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAtaques(), getMatriz()])
      .then(([a, m]) => { setAtaques(a); setMatriz(m); setId(a[0]?.id ?? ""); })
      .catch((e: Error) => setError(e.message));
  }, []);

  const total = duelo ? Math.max(...MODOS.map((m) => duelo[m].pasos.length)) : 0;
  const ritmo = sinMovimiento() ? 0 : total > 8 ? 160 : 700;
  const reproduciendo = !!duelo && hechos < total;

  // Reproduce dos ejecuciones ya terminadas, a la par: los pasos son reales, el ritmo es de presentación.
  useEffect(() => {
    if (!reproduciendo) return;
    const t = setTimeout(() => setHechos((h) => h + 1), ritmo);
    return () => clearTimeout(t);
  }, [reproduciendo, hechos, ritmo]);

  const limpiar = () => { setDuelo(null); setHechos(0); setElegido(null); setError(null); };

  async function onLanzar() {
    limpiar();
    setPidiendo(true);
    try {
      // La misma carga contra las dos versiones.
      const [vulnerable, endurecida] = await Promise.all(MODOS.map((m) => lanzar(id, m)));
      setDuelo({ vulnerable, endurecida });
      setPestana("Peticiones");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPidiendo(false); // pase lo que pase, el botón vuelve
    }
  }

  if (!ataques) {
    return (
      <main className="vacio">
        {error ? <><h1>No se pudo cargar el laboratorio</h1><p className="error" role="alert">{error}</p></> : <p className="muted">Cargando…</p>}
      </main>
    );
  }
  const ataque = ataques.find((a) => a.id === id);
  if (!ataque) return <main className="vacio"><p className="muted">El catálogo está vacío.</p></main>;

  const ocupado = pidiendo || reproduciendo;
  const fin = !!duelo && !reproduciendo;
  // Petición a la vista: la elegida; si no, la que decidió el ataque al terminar o la última reproducida.
  const decisiva = duelo ? MODOS.flatMap((m) => duelo[m].pasos.filter((p) => p.cumple).map((p) => p.n - 1))[0] : undefined;
  const vista = elegido ?? (fin ? decisiva ?? total - 1 : hechos - 1);

  return (
    <div className="shell" onPointerMove={trackPointer}>
      <aside className="lateral">
        <div className="brand">
          <h1>Laboratorio de defensa</h1>
          <p>Ataques reales contra una aplicación propia. Ninguna petición sale de este servidor.</p>
        </div>

        <div>
          <h2 className="eyebrow" id="h-ataques">Ataque</h2>
          <div className="ataques" role="group" aria-labelledby="h-ataques">
            {ataques.map((a) => {
              const fila = matriz.find((f) => f.ataque === a.id);
              return (
                <button key={a.id} className="ataque glow" aria-pressed={a.id === id} disabled={ocupado} onClick={() => { setId(a.id); limpiar(); }}>
                  <strong>{a.nombre}</strong>
                  <span className="etiquetas">{a.owasp.split(" ")[0]} · ATT&amp;CK {a.attack}</span>
                  {fila && (
                    <span className="marcador">
                      <span className={fila.vulnerable ? "v-exito" : "v-fallo"}>Vulnerable: {fila.vulnerable ? "entra" : "resiste"}</span>
                      <span className={fila.endurecida ? "v-exito" : "v-fallo"}>Endurecida: {fila.endurecida ? "entra" : "resiste"}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="accion">
          <button className="primary" onClick={() => void onLanzar()} disabled={ocupado}>{ocupado ? "Lanzando…" : "Lanzar contra las dos"}</button>
          <p className="muted">La misma carga, a la vez, contra la versión vulnerable y la endurecida.</p>
        </div>
      </aside>

      <main className="main">
        <header className="cabecera">
          <h2>{ataque.nombre}</h2>
          <p className="muted descripcion">{ataque.descripcion}</p>
          <p className="chips"><span className="chip">{ataque.owasp}</span><span className="chip">MITRE ATT&amp;CK {ataque.attack}</span></p>
        </header>
        {error && <p className="error" role="alert">{error}</p>}

        <div className="carriles">
          {MODOS.map((m) => <Carril key={m} modo={m} ataque={ataque} ej={duelo?.[m] ?? null} hechos={hechos} ritmo={ritmo} />)}
        </div>

        <section className="detalle">
          <div className="tabs" role="tablist" aria-label="Detalle">
            {PESTANAS.map((p) => (
              <button key={p} role="tab" id={`tab-${p}`} aria-selected={pestana === p} aria-controls="panel-detalle" onClick={() => setPestana(p)}>
                {p}{p === "Peticiones" && duelo ? ` · ${total}` : ""}
              </button>
            ))}
          </div>

          <div className="panel glow" role="tabpanel" id="panel-detalle" aria-labelledby={`tab-${pestana}`}>
            {pestana === "Peticiones" && (!duelo || hechos === 0 ? (
              <p className="muted hueco">Lanza el ataque para ver cada petición y lo que respondió cada versión.</p>
            ) : (
              <div className="dos">
                {MODOS.map((m) => {
                  const pasos = duelo[m].pasos.slice(0, hechos);
                  const p = pasos[Math.min(vista, pasos.length - 1)];
                  return (
                    <div key={m} className={`columna col-${m}`}>
                      <h4>{NOMBRE[m]}</h4>
                      <div className="pasos">
                        {pasos.map((x, i) => (
                          <button key={x.n} className={`paso${x.cumple ? " cumple" : ""}`} aria-pressed={p?.n === x.n} onClick={() => setElegido(i)}
                            aria-label={`${NOMBRE[m]}, petición ${x.n}: respuesta ${x.estado}${x.cumple ? ", cumple la prueba de éxito" : ""}`}>
                            {x.estado}
                          </button>
                        ))}
                      </div>
                      {p && (
                        <>
                          <h5>Petición {p.n}</h5>
                          <pre>{peticion(p, m)}</pre>
                          <h5>Respuesta · {p.estado}{p.cumple ? " · cumple la prueba de éxito" : ""}</h5>
                          <pre className={p.cumple ? "cumple" : undefined}>{p.respuesta}</pre>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {pestana === "Código" && (
              <>
                <p className="muted hueco">Es el código que se ejecuta, leído del propio programa.</p>
                <div className="dos">
                  {MODOS.map((m) => (
                    <div key={m} className={`columna col-${m}`}>
                      <h4>{NOMBRE[m]}</h4>
                      <pre>{ataque.codigo[m]}</pre>
                    </div>
                  ))}
                </div>
              </>
            )}

            {pestana === "Matriz" && (
              <>
                <p className="muted hueco">Cada ataque del catálogo, lanzado contra las dos versiones al arrancar.</p>
                <table data-testid="matriz">
                  <thead><tr><th scope="col">Ataque</th><th scope="col">Vulnerable</th><th scope="col">Endurecida</th></tr></thead>
                  <tbody>
                    {matriz.map((f) => (
                      <tr key={f.ataque} className={f.ataque === id ? "actual" : undefined}>
                        <th scope="row">{f.nombre}</th>
                        {MODOS.map((m) => <td key={m} className={f[m] ? "v-exito" : "v-fallo"}>{f[m] ? "Tuvo éxito" : "No tuvo éxito"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
