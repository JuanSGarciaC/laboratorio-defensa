import type { Ataque, Ejecucion, Modo, Paso } from "./types";

export const VERSION: Record<Modo, string> = { vulnerable: "vulnerable", endurecida: "endurecida" };

// La carga de una petición en corto: "admin:dragon2024" o el término de búsqueda.
export const carga = (p: Paso) => Object.values(p.cuerpo ?? p.params).join(":");

// B2: el resultado de una versión en una frase, con los datos de la ejecución.
export function resumen(ataque: Ataque, modo: Modo, ej: Ejecucion): string {
  const total = ej.pasos.length;
  const prueba = ataque.exito.contiene != null ? `trajo «${ataque.exito.contiene}»` : `respondió ${ataque.exito.estado}`;
  const decisiva = ej.pasos.find((p) => p.cumple);
  if (decisiva) {
    const donde = total > 1 ? `en la petición ${decisiva.n} de ${total}` : "con la primera petición";
    return `La versión ${VERSION[modo]} cayó ${donde} (${carga(decisiva)} → ${decisiva.estado}): la respuesta ${prueba}.`;
  }
  const bloqueo = ej.pasos.find((p) => p.estado === 429);
  const como = bloqueo ? `bloqueó la cuenta desde la petición ${bloqueo.n} con 429` : `ninguna respuesta ${prueba}`;
  return `La versión ${VERSION[modo]} resistió ${total > 1 ? `las ${total} peticiones` : "la petición"}: ${como}.`;
}

// El porqué, solo cuando el resultado es el esperado (la vulnerable cae y la endurecida resiste).
export const porque = (ataque: Ataque, modo: Modo, ej: Ejecucion) =>
  modo === "vulnerable" ? (ej.exito ? ataque.falla : null) : ej.exito ? null : ataque.defensa;

export type Linea = { tipo: " " | "-" | "+"; texto: string; codigo: boolean };

// B3: diff por líneas (LCS) entre las dos versiones. El sufijo del nombre de la función no cuenta como cambio.
export function diff(vulnerable: string, endurecida: string): Linea[] {
  const norma = (s: string) => s.trimEnd().split("\n").map((l) => l.replace(/_(vulnerable|endurecida)\b/g, ""));
  const a = norma(vulnerable), b = norma(endurecida);
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Linea[] = [];
  const linea = (tipo: Linea["tipo"], texto: string) => out.push({ tipo, texto, codigo: tipo !== " " && !/^\s*#/.test(texto) });
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { linea(" ", a[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) linea("-", a[i++]);
    else linea("+", b[j++]);
  }
  while (i < a.length) linea("-", a[i++]);
  while (j < b.length) linea("+", b[j++]);
  return out;
}
