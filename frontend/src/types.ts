export type Modo = "vulnerable" | "endurecida";

export interface Ataque {
  id: string;
  nombre: string;
  descripcion: string;
  owasp: string;
  attack: string;
  cwe: string;
  falla: string;
  defensa: string;
  exito: { contiene: string | null; estado: number | null; cabecera?: string | null; falta?: string | null };
  funcion: string;
  variable?: string | null; // campo que el visitante puede ajustar con su diccionario
  n_peticiones: number;
  codigo: Record<Modo, string>;
}

export interface Paso {
  n: number;
  metodo: string;
  ruta: string;
  params: Record<string, string>;
  cuerpo: Record<string, string> | null;
  estado: number;
  respuesta: string;
  cumple: boolean;
  destino: string;
  cabeceras_peticion: Record<string, string>;
  cabeceras_respuesta: Record<string, string>;
  bytes: number;
  ms: number;
}

export interface Ejecucion {
  ataque: string;
  modo: Modo;
  origen: string;
  pasos: Paso[];
  exito: boolean;
}

export interface FilaMatriz {
  ataque: string;
  nombre: string;
  vulnerable: boolean;
  endurecida: boolean;
}
