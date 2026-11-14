import type { Ataque, Ejecucion, FilaMatriz, Modo } from "./types";

async function pide<T>(ruta: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ruta, init);
  } catch {
    throw new Error("No se pudo contactar con el laboratorio. Comprueba que el servidor está en marcha.");
  }
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => null);
    throw new Error(typeof cuerpo?.detail === "string" ? cuerpo.detail : `El laboratorio respondió ${r.status}.`);
  }
  return r.json();
}

export const getAtaques = () => pide<Ataque[]>("/api/ataques");
export const getMatriz = () => pide<FilaMatriz[]>("/api/matriz");
export const lanzar = (id: string, modo: Modo) =>
  pide<Ejecucion>(`/api/ataques/${encodeURIComponent(id)}/lanzar?modo=${modo}`, { method: "POST" });
