import { carga, criterio, diff, porque, resumen } from "./lectura";
import type { Ataque, Ejecucion, Modo } from "./types";

const MODOS: Modo[] = ["vulnerable", "endurecida"];
// Las cargas van en celdas de tabla: se escapan la barra vertical y los acentos graves.
const celda = (s: string) => `\`${s.replace(/`/g, "ˋ").replace(/\|/g, "\\|")}\``;

// B7: informe en Markdown con la estructura de un experimento, generado con los datos reales de la ejecución.
export function informe(ataque: Ataque, duelo: Record<Modo, Ejecucion>, fecha = new Date()): string {
  const total = Math.max(...MODOS.map((m) => duelo[m].pasos.length));
  const p0 = duelo.vulnerable.pasos[0];
  const confirma = duelo.vulnerable.exito && !duelo.endurecida.exito;
  const filas = Array.from({ length: total }, (_, i) => {
    const [v, e] = MODOS.map((m) => duelo[m].pasos[i]);
    const marca = (p?: typeof v) => (p ? `${p.estado}${p.cumple ? " ✔" : ""}` : "—");
    return `| ${i + 1} | ${celda(carga(v ?? e))} | ${marca(v)} | ${marca(e)} |`;
  });
  const lineas = diff(ataque.codigo.vulnerable, ataque.codigo.endurecida).map((l) => `${l.tipo === " " ? " " : l.tipo}${l.texto}`);

  return [
    `# Informe de laboratorio: ${ataque.nombre}`,
    "",
    `${fecha.toISOString().slice(0, 10)} · ${ataque.owasp} · ${ataque.cwe} · MITRE ATT&CK ${ataque.attack}`,
    "",
    "## Hipótesis",
    "",
    ataque.descripcion,
    "",
    `- **Versión vulnerable:** debería caer. ${ataque.falla}`,
    `- **Versión endurecida:** debería resistir. ${ataque.defensa}`,
    "",
    "## Experimento",
    "",
    `- La misma carga contra \`/vulnerable/${ataque.funcion}\` y \`/endurecida/${ataque.funcion}\`, dentro del proceso: ninguna petición sale a la red.`,
    `- ${total} ${total === 1 ? "petición" : "peticiones"} ${p0.metodo} ${p0.ruta}.`,
    `- Prueba objetiva de éxito: ${criterio(ataque)}.`,
    "",
    "## Resultado",
    "",
    "| # | Carga | Vulnerable | Endurecida |",
    "|---|---|---|---|",
    ...filas,
    "",
    "✔ = la respuesta cumple la prueba de éxito.",
    "",
    "## Conclusión",
    "",
    ...MODOS.map((m) => `- ${resumen(ataque, m, duelo[m])}${porque(ataque, m, duelo[m]) ? ` ${porque(ataque, m, duelo[m])}` : ""}`),
    "",
    confirma ? "La hipótesis se confirma: la corrección cierra el fallo frente a esta carga." : "La hipótesis no se confirma: revisa el resultado de cada versión.",
    "",
    "### Qué cambia en el código",
    "",
    "```diff",
    ...lineas,
    "```",
    "",
  ].join("\n");
}

export function descargar(nombre: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/markdown;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
