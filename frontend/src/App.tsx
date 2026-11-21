import { useEffect, useState } from "react";
import { getAtaques, getMatriz, lanzar } from "./api";
import Consola from "./Consola";
import { Briefing, Conclusion } from "./Explicacion";
import Network, { type Seleccion } from "./Network";
import { useScramble } from "./scramble";
import Topologia from "./Topologia";
import type { Ataque, Ejecucion, FilaMatriz, Modo } from "./types";

const MODOS: Modo[] = ["vulnerable", "endurecida"];
const PESTANAS = ["Network", "Matriz"] as const;
type Pestana = (typeof PESTANAS)[number];
type Duelo = Record<Modo, Ejecucion>;
type Vista = "ambas" | Modo;
const VISTAS: { v: Vista; texto: string }[] = [{ v: "ambas", texto: "Ambas" }, { v: "vulnerable", texto: "Solo vulnerable" }, { v: "endurecida", texto: "Solo endurecida" }];

function trackPointer(e: React.PointerEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>(".glow");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

const sinMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function App() {
  const [ataques, setAtaques] = useState<Ataque[] | null>(null);
  const [matriz, setMatriz] = useState<FilaMatriz[]>([]);
  const [id, setId] = useState("");
  const [duelo, setDuelo] = useState<Duelo | null>(null);
  const [hechos, setHechos] = useState(0); // peticiones ya reproducidas
  const [elegida, setElegida] = useState<Seleccion | null>(null); // fila de Network que el usuario quiere mirar
  const [pestana, setPestana] = useState<Pestana>("Network");
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pausa, setPausa] = useState(false);
  const [rapido, setRapido] = useState(false);
  const [vista, setVista] = useState<Vista>("ambas");

  useEffect(() => {
    Promise.all([getAtaques(), getMatriz()])
      .then(([a, m]) => { setAtaques(a); setMatriz(m); setId(a[0]?.id ?? ""); })
      .catch((e: Error) => setError(e.message));
  }, []);

  const total = duelo ? Math.max(...MODOS.map((m) => duelo[m].pasos.length)) : 0;
  const ritmo = sinMovimiento() ? 0 : (total > 8 ? 320 : 900) / (rapido ? 4 : 1);
  const reproduciendo = !!duelo && hechos < total;

  // Reproduce dos ejecuciones ya terminadas, a la par: los pasos son reales, el ritmo es de presentación.
  useEffect(() => {
    if (!reproduciendo || pausa) return;
    const t = setTimeout(() => setHechos((h) => h + 1), ritmo);
    return () => clearTimeout(t);
  }, [reproduciendo, pausa, hechos, ritmo]);

  const marca = useScramble("Laboratorio de defensa");
  const titulo = useScramble(ataques?.find((a) => a.id === id)?.nombre ?? "");

  const limpiar = () => { setDuelo(null); setHechos(0); setElegida(null); setError(null); };

  async function onLanzar() {
    limpiar();
    setPidiendo(true);
    try {
      // La misma carga contra las dos versiones.
      const [vulnerable, endurecida] = await Promise.all(MODOS.map((m) => lanzar(id, m)));
      setDuelo({ vulnerable, endurecida });
      setPestana("Network");
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
  const modos = vista === "ambas" ? MODOS : [vista];
  // Fila a la vista: la elegida; si no, la petición que decidió el ataque al terminar o la última reproducida.
  const decisiva = duelo && modos.flatMap((m) => duelo[m].pasos.filter((p) => p.cumple).map((p) => ({ modo: m, n: p.n })))[0];
  const sel = (elegida && modos.includes(elegida.modo) ? elegida : null) ?? (fin ? decisiva || { modo: modos[0], n: total } : hechos ? { modo: modos[0], n: hechos } : null);

  return (
    <div className="shell" onPointerMove={trackPointer}>
      <aside className="lateral">
        <div className="brand">
          <h1><span className="sr-only">Laboratorio de defensa</span><span aria-hidden="true">{marca}</span></h1>
          <p>Ataques reales contra una aplicación propia. Ninguna petición sale de este servidor.</p>
        </div>

        <div>
          <h2 className="eyebrow" id="h-ataques">Ataque</h2>
          <div className="ataques" role="group" aria-labelledby="h-ataques">
            {ataques.map((a, i) => {
              const fila = matriz.find((f) => f.ataque === a.id);
              return (
                <button key={a.id} className="ataque glow entra" style={{ "--i": i } as React.CSSProperties} aria-pressed={a.id === id} disabled={ocupado} onClick={() => { setId(a.id); limpiar(); }}>
                  <strong>{a.nombre}</strong>
                  <span className="etiquetas">{a.cwe} · ATT&amp;CK {a.attack}</span>
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
          {/* El lector de pantalla oye el nombre; los signos del descifrado son solo visuales. */}
          <h2><span className="sr-only">{ataque.nombre}</span><span aria-hidden="true">{titulo}</span></h2>
          <p className="chips"><span className="chip">{ataque.owasp}</span><span className="chip">{ataque.cwe}</span><span className="chip">MITRE ATT&amp;CK {ataque.attack}</span></p>
        </header>
        <Briefing ataque={ataque} />
        {error && <p className="error" role="alert">{error}</p>}

        <section className="banco glow" aria-label="Banco de pruebas">
          <div className="controles" role="toolbar" aria-label="Reproducción">
            <button onClick={() => setPausa((p) => !p)} aria-pressed={pausa}>{pausa ? "▶ Seguir" : "❚❚ Pausa"}</button>
            <button onClick={() => setHechos((h) => Math.min(h + 1, total))} disabled={!pausa || !reproduciendo}>Paso ▸</button>
            <button onClick={() => setRapido((r) => !r)} aria-pressed={rapido} aria-label={`Velocidad ${rapido ? "4×" : "1×"}`}>{rapido ? "4×" : "1×"}</button>
            <span className="separador" />
            <span role="group" aria-label="Versiones a la vista" className="segmentos">
              {VISTAS.map(({ v, texto }) => <button key={v} aria-pressed={vista === v} onClick={() => setVista(v)}>{texto}</button>)}
            </span>
          </div>
          <div className="topologia">
            {modos.map((m) => <Topologia key={m} modo={m} ataque={ataque} ej={duelo?.[m] ?? null} hechos={hechos} />)}
          </div>
          <Consola ataque={ataque} duelo={duelo} hechos={hechos} modos={modos} />
        </section>

        <Conclusion ataque={ataque} duelo={fin ? duelo : null} />

        <section className="detalle">
          <div className="tabs" role="tablist" aria-label="Detalle">
            {PESTANAS.map((p) => (
              <button key={p} role="tab" id={`tab-${p}`} aria-selected={pestana === p} aria-controls="panel-detalle" onClick={() => setPestana(p)}>
                {p}{p === "Network" && duelo ? ` · ${Math.min(hechos, total) * modos.length}` : ""}
              </button>
            ))}
          </div>

          <div className="panel" role="tabpanel" id="panel-detalle" aria-labelledby={`tab-${pestana}`}>
            {pestana === "Network" && (!duelo || hechos === 0
              ? <p className="muted">Lanza el ataque para ver cada petición HTTP y lo que respondió cada versión.</p>
              : <Network duelo={duelo} hechos={hechos} modos={modos} sel={sel} onSel={setElegida} />)}

            {pestana === "Matriz" && (
              <>
                <p className="muted hueco">Cada ataque del catálogo, lanzado contra las dos versiones al arrancar.</p>
                <table data-testid="matriz">
                  <thead><tr><th scope="col">Ataque</th><th scope="col">Vulnerable</th><th scope="col">Endurecida</th></tr></thead>
                  <tbody>
                    {matriz.map((f, i) => (
                      <tr key={f.ataque} className={`entra${f.ataque === id ? " actual" : ""}`} style={{ "--i": i } as React.CSSProperties}>
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
