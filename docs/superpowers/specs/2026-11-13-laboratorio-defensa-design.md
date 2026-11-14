# Laboratorio de defensa: diseño

Fecha: 2026-11-13 · Estado: pendiente de aprobación

## Para qué

Proyecto de portafolio que demuestra, en un solo recorrido, las cuatro habilidades de seguridad
que un reclutador quiere ver juntas: **prevenir, atacar (probar), detectar y responder**.
Lo pidió el autor para sustituir al tablero de datos abiertos: quiere algo muy visual, que
aporte de verdad y que muestre versatilidad, no una sola técnica.

Quien lo abre debe poder pulsar un botón, ver un ataque real recorrer el lienzo y entender
en diez segundos qué pasó: funcionó o no, qué regla lo vio y qué lo detuvo.

## Metas

- Una aplicación objetivo pequeña con dos implementaciones de cada ruta: vulnerable y endurecida.
- Un catálogo de ataques que se lanza desde la interfaz y dice, con una prueba objetiva, si cada ataque tuvo éxito.
- Reglas de detección sobre el registro de peticiones, etiquetadas con OWASP Top 10 y MITRE ATT&CK.
- Respuesta automática: bloqueo temporal del origen.
- Prioridad de parches de dependencias con datos reales (OSV, KEV de CISA, EPSS).
- Cifras medidas en el CI: ataques con éxito por modo, ataques detectados, falsos positivos sobre tráfico normal.
- Código corto que el autor pueda explicar línea a línea en una entrevista.

## Fuera de alcance

- Atacar cualquier cosa que no sea la aplicación objetivo del propio proceso.
- Usuarios, cuentas o persistencia entre despliegues.
- Modelos de lenguaje, APIs de pago, servicios con clave.
- Escáner de vulnerabilidades genérico, WAF de producción o SIEM: es un laboratorio y se presenta como tal.
- Resolver dependencias transitivas de Python (ver Prevenir).

## Lo que lo haría fracasar aunque funcione

- Que la demo pública sirva para atacar a terceros o filtre algo del servidor.
- Cifras inventadas o «100 % detectado» porque las reglas se escribieron mirando el catálogo sin tráfico normal que las contradiga.
- Movimiento que decora en vez de informar.
- Tres mini-proyectos pegados: todo debe verse en un mismo lienzo.

## Restricciones

- Gratis y local. Sin dependencias nuevas si la biblioteca estándar o lo ya instalado basta.
- Mismo stack y convenciones que `triaje-solicitudes`: FastAPI + SQLite, React + Vite, un contenedor
  donde la API sirve el panel, `render.yaml` con `autoDeploy: false`, CI en GitHub Actions.
- Tema oscuro, sin emojis, lienzo SVG propio, misma paleta y tipografías que triaje e integrador
  (tipografías servidas en local, sin Google Fonts). Todo se apaga con `prefers-reduced-motion`.
- Licencia de todos los derechos reservados; commits y PR sin firma de Claude.
- Nombres de dominio en español; identificadores de código como en los repos hermanos.

## Enfoques considerados

| Enfoque | Qué es | Por qué sí o no |
|---|---|---|
| **A. Laboratorio con aplicación objetivo** (elegido) | Objetivo vulnerable/endurecido + atacar + detectar + responder + prevenir en un lienzo | Cubre las cuatro habilidades y tiene pieza viva. Lo eligió el autor el 2026-11-13 |
| B. Postura de seguridad del propio portafolio | Auditar los 7 repos y las demos: dependencias, secretos, cabeceras | Todo dato real, pero casi solo prevención y nada se dispara en vivo |
| C. Detección sobre registros públicos | Analizar conjuntos públicos de ataques | Lo más barato; una sola habilidad y sin interacción |

## Cómo funciona

### Una sola aplicación, ataques dentro del proceso

Un proceso FastAPI con tres partes:

- `/api/*`: el laboratorio (catálogo, lanzar, eventos, alertas, bloqueos, escaneo).
- `/objetivo/vulnerable/*` y `/objetivo/endurecida/*`: la misma aplicación objetivo dos veces.
  Dos implementaciones lado a lado, sin estado global: el modo va en la ruta, así dos visitantes no se pisan
  y el README puede enseñar el antes y el después de cada función.
- El panel compilado en `/`.

El lanzador de ataques usa `httpx` con `ASGITransport` apuntando a la propia aplicación. Son peticiones
HTTP completas que pasan por el middleware y los manejadores reales, pero **no salen a la red**: el
lanzador no puede apuntar a otro sitio porque no recibe ninguna URL. Ese es el límite de seguridad,
y es estructural, no una validación.

Por defecto `/objetivo/*` **no** es accesible desde fuera: el objetivo es una aplicación ASGI aparte
que el lanzador llama directamente y que solo se monta en la aplicación pública con `OBJETIVO_EXPUESTO=true`
(para probar a mano con `curl` en local). No se distingue al lanzador por su dirección, que se podría falsear.
La demo pública lo deja cerrado.

### La aplicación objetivo

Tres rutas, datos ficticios en un SQLite propio abierto en solo lectura:

| Ruta | Vulnerable | Endurecida |
|---|---|---|
| `POST /login` | Sin límite de intentos | Bloqueo de la cuenta tras 5 fallos en 1 minuto |
| `GET /buscar?q=` | SQL armado con concatenación; devuelve el término sin escapar | Consulta con parámetros; salida escapada |
| `GET /archivo?nombre=` | Une la ruta sin normalizar | Normaliza y exige que quede dentro de `publico/` |

El recorrido de rutas vulnerable solo puede leer dentro de `lab/` (carpeta con `publico/` y un
`secreto.txt` señuelo al lado). Nada fuera de `lab/` se lee en ningún modo.

### Catálogo de ataques

`backend/app/ataques.yaml`. Cada ataque: `id`, nombre, categoría OWASP, técnica ATT&CK, lista de
peticiones y un **oráculo** de éxito comprobable (por ejemplo: la respuesta contiene el texto del
señuelo; el login devolvió 200 con una contraseña de la lista; la respuesta trae filas de la tabla `usuarios`).

Primera versión: inyección SQL (extraer `usuarios` con `UNION`), fuerza bruta de login (20 contraseñas),
recorrido de rutas (`../secreto.txt`, también con codificación `%2e%2e`) y XSS reflejado.

Cada lanzamiento usa un origen simulado nuevo del rango de documentación `203.0.113.0/24`
(parámetro `client` del transporte), para que el bloqueo de una ejecución no afecte a la siguiente.

### Registro, detección y respuesta (fase 2)

- Un middleware guarda cada petición al objetivo en la tabla `peticiones` (hora, origen, método, ruta, consulta, cuerpo recortado, estado).
- `backend/app/reglas.yaml`: reglas de **firma** (expresión regular sobre ruta, consulta o cuerpo ya decodificados)
  y de **umbral** (N fallos de login por origen en una ventana). Cada una con id, gravedad, OWASP y ATT&CK.
- El detector corre en el mismo middleware, después de responder, y escribe en `alertas`.
- Respuesta: una alerta de gravedad alta, o tres de cualquier gravedad, bloquea el origen 5 minutos
  (tabla `bloqueos`). El middleware responde 403 a un origen bloqueado antes de llegar al objetivo.
- Tráfico normal de contraste: `backend/eval/trafico_normal.yaml`, peticiones legítimas incómodas
  (apellido `O'Brien`, buscar «select», nombres de archivo con puntos). Sirve para medir falsos positivos.

### Prevenir (fase 3)

- Entrada: texto pegado de un `requirements.txt` con versiones fijas o un `package-lock.json`. Máximo 200 paquetes y 200 KB.
- `POST https://api.osv.dev/v1/querybatch` para las vulnerabilidades; catálogo KEV de CISA y EPSS de FIRST
  para ordenar. Las tres fuentes respondieron sin clave el 2026-11-13. KEV se guarda en caché 24 h (pesa 1,8 MB).
- Orden: primero lo que está en KEV, después por EPSS, después por gravedad. Se muestra la versión que lo arregla.
- Lienzo: con `package-lock.json`, el grafo de dependencias con el camino hasta el paquete afectado;
  con `requirements.txt`, lista plana (el archivo no trae el árbol y no se resuelve).
- Ejemplos precargados: los archivos de dependencias de este mismo repo y uno antiguo con vulnerabilidades conocidas.
- Si una fuente no responde, se muestra el error y lo que sí se obtuvo; nunca cifras de relleno.

### Interfaz

Una página con el lienzo arriba y el detalle abajo.

```
 [ Prevenir ] ── [ Atacar ] ──► [ Objetivo: vulnerable | endurecida ] ──► [ Resultado ]
   dependencias    catálogo            │
                                 [ Detectar ] ──► [ Responder ]
                                   reglas           bloqueo 5 min
```

- Se elige un ataque y un modo y se pulsa «Lanzar». La API devuelve la ejecución completa (cada petición,
  su estado, si el oráculo se cumplió, alertas y bloqueo) y el panel la **reproduce paso a paso**:
  la petición viaja por la arista, el objetivo late, se enciende la regla y, si hay bloqueo, las
  siguientes rebotan en Responder. No hace falta sondeo: la ejecución dura milisegundos.
- Debajo: la petición y la respuesta de cada paso, la regla que disparó con su etiqueta OWASP/ATT&CK,
  y el fragmento de código vulnerable frente al endurecido.
- Matriz de resultados: ataque × modo, con «tuvo éxito», «detectado», «bloqueado en la petición N».
- Cada fase solo dibuja las estaciones que ya existen; no hay nodos «próximamente».

### API

| Ruta | Fase | Qué hace |
|---|---|---|
| `GET /api/health` | 1 | Estado |
| `GET /api/ataques` | 1 | Catálogo |
| `POST /api/ataques/{id}/lanzar?modo=vulnerable\|endurecida` | 1 | Ejecuta y devuelve los pasos |
| `GET /api/matriz` | 1 | Tabla de todo el catálogo en ambos modos; se calcula una vez al arrancar (es determinista) |
| `GET /api/alertas`, `GET /api/bloqueos` | 2 | Últimas alertas y bloqueos vigentes |
| `POST /api/dependencias` | 3 | Escanea el texto pegado |

Límite de uso en `lanzar`, `matriz` y `dependencias` por IP del visitante (el mismo mecanismo
`CLIENT_IP_HEADER` de triaje). Las IP de visitantes no se guardan ni se muestran.

## Entregas

Cada una es un PR con CI en verde, capturas y GIF, y su propio plan.

1. **Objetivo + Atacar + lienzo.** Las tres rutas en dos modos, catálogo, lanzador, matriz y reproducción en el lienzo. Docker, CI (backend, frontend, e2e), README.
2. **Detectar + Responder.** Registro, reglas, bloqueo, tráfico normal y cifras de detección y falsos positivos en el CI.
3. **Prevenir + demo pública.** Escaneo de dependencias, `render.yaml`, tarjeta en el README del perfil.

## Pruebas

- Por ataque y modo: el oráculo se cumple en vulnerable y no en endurecida. Esta prueba **es** la evidencia del proyecto.
- El lanzador no puede salir del proceso; `/objetivo/*` responde 404 desde fuera salvo con `OBJETIVO_EXPUESTO`.
- El recorrido de rutas nunca lee fuera de `lab/`.
- Fase 2: cada ataque dispara su regla; el tráfico normal no dispara ninguna (o las que dispare quedan contadas como falsos positivos, no escondidas); el bloqueo caduca.
- Fase 3: fuentes simuladas con `httpx.MockTransport`; fuente caída; entrada demasiado grande.
- E2E con Playwright contra el contenedor: lanzar un ataque en cada modo y comprobar que el lienzo y la matriz dicen lo mismo que la API.

## Decisiones tomadas por mí (el autor puede cambiarlas)

- Nombre y lugar: repo nuevo `laboratorio-defensa` en `~/Downloads/portafolio-github/`. El repo de datos abiertos no se toca hasta que el autor decida archivarlo.
- Ataques dentro del proceso con `ASGITransport` en vez de por red.
- Los dos modos como dos rutas, no como un interruptor global.
- Objetivo cerrado al exterior por defecto.
- Orígenes simulados del rango de documentación; bloqueo de 5 minutos.
- La reproducción en el lienzo es de una ejecución ya terminada (pasos reales, ritmo de presentación), y el README lo dirá.
- `requirements.txt` se muestra como lista plana, sin árbol.

## Lo que queda al constructor

Nombres de módulos y componentes, esquema exacto de las tablas, forma del JSON de una ejecución,
textos de la interfaz, cifras del límite de uso y el detalle visual del lienzo (se enseña una captura temprana al autor antes de terminar el resto).

## Sin comprobar

- Que el plan gratuito de Render (512 MB) aguante la demo: se espera que sí, es más ligera que triaje, pero se mide en la fase 3.
- Límites de uso de OSV y EPSS: no documentan una cuota para este volumen; se cubre con caché y con el tope de 200 paquetes.
