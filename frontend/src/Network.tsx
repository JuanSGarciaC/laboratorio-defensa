import { useEffect, useRef } from "react";
import type { Ejecucion, Modo, Paso } from "./types";

const RAZON: Record<number, string> = { 200: "OK", 401: "Unauthorized", 404: "Not Found", 422: "Unprocessable Entity", 429: "Too Many Requests", 500: "Internal Server Error" };
const cabeceras = (h: Record<string, string>) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\n");

// Petición y respuesta HTTP como viajaron. El cuerpo de la petición se reconstruye desde la carga del catálogo.
export const crudoPeticion = (p: Paso) =>
  `${p.metodo} ${p.destino} HTTP/1.1\n${cabeceras(p.cabeceras_peticion)}${p.cuerpo ? `\n\n${JSON.stringify(p.cuerpo)}` : ""}`;
export const crudoRespuesta = (p: Paso) =>
  `HTTP/1.1 ${p.estado} ${RAZON[p.estado] ?? ""}\n${cabeceras(p.cabeceras_respuesta)}\n\n${p.respuesta}`;

export type Seleccion = { modo: Modo; n: number };

interface Props { duelo: Record<Modo, Ejecucion>; hechos: number; modos: Modo[]; sel: Seleccion | null; onSel: (s: Seleccion) => void }

// B4: tabla de peticiones al estilo de la pestaña Network de DevTools y el detalle en crudo de la elegida.
export default function Network({ duelo, hechos, modos, sel, onSel }: Props) {
  // Orden de llegada: petición 1 a cada versión, luego la 2…
  const filas = modos.flatMap((modo) => duelo[modo].pasos.slice(0, hechos).map((p) => ({ modo, p })))
    .sort((a, b) => a.p.n - b.p.n || modos.indexOf(a.modo) - modos.indexOf(b.modo));
  const elegida = sel && duelo[sel.modo].pasos[sel.n - 1];
  // La fila elegida queda a la vista dentro de la tabla; la página no se mueve.
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = caja.current, fila = c?.querySelector<HTMLElement>("tr.activa");
    if (c && fila && (fila.offsetTop < c.scrollTop + 30 || fila.offsetTop + fila.offsetHeight > c.scrollTop + c.clientHeight))
      c.scrollTop = fila.offsetTop - c.clientHeight / 2;
  }, [sel?.modo, sel?.n]);
  return (
    <div className="network" data-testid="network">
      <div className="tabla-scroll" ref={caja}>
        <table>
          <thead><tr><th scope="col">#</th><th scope="col">Versión</th><th scope="col">Método</th><th scope="col">Ruta</th><th scope="col">Estado</th><th scope="col">Tamaño</th><th scope="col">Tiempo</th></tr></thead>
          <tbody>
            {filas.map(({ modo, p }) => {
              const activa = sel?.modo === modo && sel.n === p.n;
              return (
                <tr key={`${modo}-${p.n}`} data-modo={modo} className={`${activa ? "activa" : ""}${p.cumple ? " cumple" : ""}`} onClick={() => onSel({ modo, n: p.n })}>
                  <td><button aria-pressed={activa} aria-label={`Ver la petición ${p.n} a la versión ${modo}`} onClick={(e) => { e.stopPropagation(); onSel({ modo, n: p.n }); }}>{p.n}</button></td>
                  <td className={`v-${modo}`}>{modo}</td>
                  <td>{p.metodo}</td>
                  <td className="ruta">{p.destino}</td>
                  <td className={`e${String(p.estado)[0]}xx`}>{p.estado}{p.cumple ? " ✔" : ""}</td>
                  <td>{p.bytes} B</td>
                  <td>{p.ms} ms</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {elegida ? (
        <div className="crudo">
          <div><h4 className="eyebrow">Petición · {sel!.modo} #{elegida.n}</h4><pre data-testid="crudo-peticion">{crudoPeticion(elegida)}</pre></div>
          <div><h4 className="eyebrow">Respuesta{elegida.cumple ? " · cumple la prueba de éxito" : ""}</h4><pre data-testid="crudo-respuesta" className={elegida.cumple ? "cumple" : undefined}>{crudoRespuesta(elegida)}</pre></div>
        </div>
      ) : <p className="muted">Elige una fila para ver la petición y la respuesta en crudo.</p>}
    </div>
  );
}
