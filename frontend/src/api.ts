import type { Ataque, Ejecucion, FilaMatriz, Modo } from "./types";

export interface Ajustes { intentos?: number; diccionario?: string[] }

async function pide<T>(ruta: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ruta, init);
  } catch {
    throw new Error("No se pudo contactar con el laboratorio. Comprueba que el servidor está en marcha.");
  }
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => null);
    if (typeof cuerpo?.detail === "string") throw new Error(cuerpo.detail);
    // Errores de validación de FastAPI: una lista; se enseña el primero.
    if (Array.isArray(cuerpo?.detail) && cuerpo.detail[0]?.msg) throw new Error(`Ajustes no válidos: ${cuerpo.detail[0].msg}`);
    throw new Error(`El laboratorio respondió ${r.status}.`);
  }
  return r.json();
}

export const getAtaques = () => pide<Ataque[]>("/api/ataques");
export const getMatriz = () => pide<FilaMatriz[]>("/api/matriz");
export const lanzar = (id: string, modo: Modo, ajustes?: Ajustes) =>
  pide<Ejecucion>(`/api/ataques/${encodeURIComponent(id)}/lanzar?modo=${modo}`, {
    method: "POST",
    ...(ajustes && { headers: { "content-type": "application/json" }, body: JSON.stringify(ajustes) }),
  });
