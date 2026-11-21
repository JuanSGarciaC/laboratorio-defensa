import { useEffect, useRef, useState } from "react";

const CLAVE = "lab-guia";
const PASOS = [
  { foco: ".ataques", titulo: "Elige un ataque", texto: "Cada ataque es real y apunta a una ruta de esta misma aplicación, que existe dos veces: una vulnerable y otra endurecida." },
  { foco: ".briefing", titulo: "Lee qué esperar", texto: "Qué intenta el ataque, por qué debería caer la versión vulnerable y qué cambia en la endurecida." },
  { foco: ".banco", titulo: "Lanza y mira", texto: "La misma carga va a las dos versiones. A la izquierda, la terminal del atacante; a la derecha, lo que registra cada servidor. Puedes pausar, avanzar paso a paso o ver una sola versión." },
  { foco: ".conclusion", titulo: "Entiende el porqué", texto: "El resultado en una frase y la diferencia exacta de código que lo explica." },
  { foco: ".detalle", titulo: "Mira cada petición", texto: "En Network, cada petición y respuesta HTTP en crudo, con cabeceras y tiempos. En Matriz, todos los ataques contra las dos versiones." },
];

// localStorage puede no estar disponible (modo privado estricto): entonces la guía se muestra cada vez.
export const guiaVista = () => { try { return localStorage.getItem(CLAVE) === "vista"; } catch { return false; } };
const marcarVista = () => { try { localStorage.setItem(CLAVE, "vista"); } catch { /* sin almacenamiento */ } };

// B6: recorrido de primera vez. No es modal: la página sigue usable y cada paso resalta su zona.
export default function Guia({ onCerrar }: { onCerrar: () => void }) {
  const [i, setI] = useState(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const paso = PASOS[i];
  const cerrar = () => { marcarVista(); onCerrar(); };

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(paso.foco);
    el?.classList.add("guia-foco");
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "center", behavior: quieto ? "auto" : "smooth" });
    titulo.current?.focus();
    return () => el?.classList.remove("guia-foco");
  }, [paso.foco]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  return (
    <aside className="guia" role="dialog" aria-modal="false" aria-labelledby="guia-titulo" data-testid="guia">
      <p className="eyebrow">Guía · {i + 1} de {PASOS.length}</p>
      <h2 id="guia-titulo" ref={titulo} tabIndex={-1}>{paso.titulo}</h2>
      <p>{paso.texto}</p>
      <div className="guia-botones">
        <button onClick={cerrar}>Saltar</button>
        <span className="separador" />
        {i > 0 && <button onClick={() => setI(i - 1)}>Anterior</button>}
        {i < PASOS.length - 1
          ? <button className="guia-siguiente" onClick={() => setI(i + 1)}>Siguiente</button>
          : <button className="guia-siguiente" onClick={cerrar}>Empezar</button>}
      </div>
    </aside>
  );
}
