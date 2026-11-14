# Entrega 1: objetivo, atacar y lienzo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una aplicación objetivo con rutas vulnerables y endurecidas, un catálogo de cuatro ataques que se lanza desde un lienzo y una matriz que dice, con una prueba objetiva, cuál tuvo éxito en cada modo.

**Architecture:** Un proceso FastAPI. El objetivo es una aplicación ASGI aparte (`crea_objetivo()`) que el lanzador llama con `httpx.ASGITransport`, sin red y sin URL; cada ejecución usa un objetivo nuevo, así no hay estado compartido. La API del laboratorio expone catálogo, lanzar y matriz, y sirve el panel React compilado.

**Tech Stack:** Python 3.12, FastAPI, httpx, PyYAML, sqlite3 (biblioteca estándar), pytest · React 19, Vite 7, TypeScript, `@fontsource/public-sans`, `@fontsource/sora` · Docker, GitHub Actions, Playwright (solo en e2e y capturas, con `uv run --with`).

**Spec:** `docs/superpowers/specs/2026-11-13-laboratorio-defensa-design.md`

## Global Constraints

- Repo: `~/Downloads/portafolio-github/laboratorio-defensa`. Rama de trabajo `feat/objetivo-atacar-lienzo`; `main` solo recibe el commit inicial (spec, plan, `LICENSE`, `.gitignore`).
- Commits y PR sin `Co-Authored-By: Claude` ni pie de Claude Code. Licencia: copiar `../triaje-solicitudes/LICENSE`; `"license": "UNLICENSED"` en `package.json`.
- El lanzador no recibe ninguna URL ni host: solo `Ataque` y `Modo`.
- El objetivo solo se monta en la aplicación pública con `OBJETIVO_EXPUESTO=true`.
- Ningún modo lee fuera de `backend/app/lab/`.
- Orígenes simulados: `203.0.113.N` con N de 1 a 254.
- Sin emojis; estados con texto y color. Tema oscuro; variables de `:root` copiadas de `../triaje-solicitudes/frontend/src/styles.css`. Sin Google Fonts. Todo movimiento apagado con `prefers-reduced-motion`.
- Solo se dibujan las estaciones que existen: Atacar, Objetivo, Resultado.
- Sin dependencias fuera de las listadas en Tech Stack.
- Las heredoc de Bash con comillas fallan en esta máquina: los parches largos van como archivo.

## Review Focus

1. **Ruta de archivo hostil** (`/etc/passwd`, `..\secreto.txt`, `C:\Windows\win.ini`, `../../main.py`): 404 en ambos modos, nunca contenido de fuera de `lab/`. → Tarea 1.
2. **Carga que rompe el SQL** (`q='`): el objetivo vulnerable responde 500 con texto corto y la ejecución termina con ese paso registrado, sin excepción. → Tareas 1 y 2.
3. **Identificador o modo desconocido** en `POST /api/ataques/{id}/lanzar`: 404 y 422 con mensaje en español; el panel lo muestra. → Tarea 3.
4. **Muchos lanzamientos seguidos** desde una IP: 429 con `Retry-After`; el panel dice cuánto esperar y vuelve a habilitar el botón. → Tareas 3 y 4.
5. **API caída o respuesta lenta** al pulsar «Lanzar»: el botón no queda bloqueado para siempre y se ve el error. → Tarea 4 (e2e en Tarea 5).

---

### Task 0: Repositorio

**Files:** Create `.gitignore`, `LICENSE`.

- [ ] **Step 1:** `git init -b main` en la raíz. `.gitignore`: `__pycache__/`, `.venv/`, `node_modules/`, `dist/`, `.env`, `*.db`, `.pytest_cache/`, `uv.lock`. Copiar `LICENSE` de triaje.
- [ ] **Step 2:** Commit en `main`: `docs: diseño, plan y licencia`. Después `git switch -c feat/objetivo-atacar-lienzo`.

### Task 1: Aplicación objetivo

**Files:**
- Create: `backend/app/__init__.py`, `backend/app/objetivo.py`, `backend/app/lab/publico/aviso.txt`, `backend/app/lab/secreto.txt`, `backend/requirements.txt`, `backend/pytest.ini`, `ruff.toml`
- Test: `backend/tests/test_objetivo.py`

**Interfaces — Produces:**
- `Modo = Literal["vulnerable", "endurecida"]`
- `crea_objetivo(reloj: Callable[[], float] = time.monotonic) -> FastAPI`, con rutas `/{modo}/login` (POST JSON `{usuario, clave}`), `/{modo}/buscar?q=` (HTML), `/{modo}/archivo?nombre=` (texto).
- `FUENTES: dict[str, dict[Modo, str]]`: código fuente (`inspect.getsource`) de cada manejador, con claves `login`, `buscar`, `archivo`.
- Datos fijos: tabla `productos(nombre, precio)` con 5 filas, una llamada `Teclado mecánico`; tabla `usuarios(usuario, email, clave)` con `admin` / `admin@lab.invalid` / clave `dragon2024` guardada con `hashlib.scrypt`. `secreto.txt` contiene `SENUELO-LAB-7f3a`. `aviso.txt` contiene `Horario de atención`.

`requirements.txt`: `fastapi>=0.115`, `uvicorn[standard]>=0.30`, `httpx>=0.27`, `pyyaml>=6.0`, `pytest>=8.0`. `pytest.ini` y `ruff.toml` iguales a los de triaje.

- [ ] **Step 1: Pruebas que fallan** (`TestClient(crea_objetivo())`; `SQLI = "' UNION SELECT email, clave FROM usuarios --"`, `XSS = "<script>alert(1)</script>"`):

```python
def test_buscar_normal_en_ambos_modos(c, modo):          # parametrizada por modo
    r = c.get(f"/{modo}/buscar", params={"q": "Teclado"})
    assert r.status_code == 200 and "Teclado mecánico" in r.text

def test_sqli_extrae_usuarios_solo_en_vulnerable(c):
    assert "admin@lab.invalid" in c.get("/vulnerable/buscar", params={"q": SQLI}).text
    assert "admin@lab.invalid" not in c.get("/endurecida/buscar", params={"q": SQLI}).text

def test_xss_se_refleja_solo_en_vulnerable(c):
    assert XSS in c.get("/vulnerable/buscar", params={"q": XSS}).text
    r = c.get("/endurecida/buscar", params={"q": XSS})
    assert XSS not in r.text and "&lt;script&gt;" in r.text

def test_sql_roto_responde_500_corto(c):
    r = c.get("/vulnerable/buscar", params={"q": "'"})
    assert r.status_code == 500 and len(r.text) < 300
    assert c.get("/endurecida/buscar", params={"q": "'"}).status_code == 200

def test_la_base_es_de_solo_lectura(c):
    c.get("/vulnerable/buscar", params={"q": "'; DROP TABLE productos --"})
    assert "Teclado mecánico" in c.get("/vulnerable/buscar", params={"q": "Teclado"}).text

def test_archivo_publico(c, modo):
    assert "Horario de atención" in c.get(f"/{modo}/archivo", params={"nombre": "aviso.txt"}).text

def test_recorrido_lee_el_senuelo_solo_en_vulnerable(c):
    assert "SENUELO-LAB-7f3a" in c.get("/vulnerable/archivo", params={"nombre": "../secreto.txt"}).text
    assert c.get("/endurecida/archivo", params={"nombre": "../secreto.txt"}).status_code == 404

@pytest.mark.parametrize("nombre", ["/etc/passwd", "..\\secreto.txt", "C:\\Windows\\win.ini", "../../main.py", "../../../requirements.txt", ""])
def test_nada_fuera_del_laboratorio(c, modo, nombre):
    r = c.get(f"/{modo}/archivo", params={"nombre": nombre})
    assert r.status_code == 404 or (modo == "vulnerable" and "SENUELO" in r.text)  # "..\\" en Windows

def test_login(c, modo):
    assert c.post(f"/{modo}/login", json={"usuario": "admin", "clave": "dragon2024"}).status_code == 200
    assert c.post(f"/{modo}/login", json={"usuario": "admin", "clave": "x"}).status_code == 401

def test_bloqueo_tras_cinco_fallos_solo_en_endurecida():
    t = [0.0]; c = TestClient(crea_objetivo(reloj=lambda: t[0]))
    for _ in range(5): c.post("/endurecida/login", json={"usuario": "admin", "clave": "x"})
    assert c.post("/endurecida/login", json={"usuario": "admin", "clave": "dragon2024"}).status_code == 429
    t[0] = 61.0
    assert c.post("/endurecida/login", json={"usuario": "admin", "clave": "dragon2024"}).status_code == 200
    for _ in range(6): c.post("/vulnerable/login", json={"usuario": "admin", "clave": "x"})
    assert c.post("/vulnerable/login", json={"usuario": "admin", "clave": "dragon2024"}).status_code == 200

def test_fuentes_expone_las_dos_versiones():
    assert "LIKE '%{q}%'" in FUENTES["buscar"]["vulnerable"] and "?" in FUENTES["buscar"]["endurecida"]
```

- [ ] **Step 2:** `cd backend && pytest -q` → falla por importación.
- [ ] **Step 3: Implementar `objetivo.py`.** Decisiones que las pruebas no fijan:
  - Base: `sqlite3.connect(":memory:", check_same_thread=False)` creada dentro de `crea_objetivo`, poblada y luego `PRAGMA query_only = ON`.
  - Seis manejadores con nombre propio (`buscar_vulnerable`, `buscar_endurecida`, …), cortos y sin ayudantes compartidos para la parte que difiere: son lo que el panel enseña como código.
  - `archivo`: `destino = (base / nombre).resolve()` con `base = LAB/"publico"`; vulnerable exige `destino.is_relative_to(LAB)`, endurecida `destino.is_relative_to(base)`; además `destino.is_file()`. Si no, 404.
  - Bloqueo: `dict[str, list[float]]` de fallos por usuario dentro del cierre de `crea_objetivo`; ventana 60 s, umbral 5. Comparar claves con `hmac.compare_digest`.
  - El 500 del SQL roto: capturar `sqlite3.Error` y responder `Error en la consulta`.
- [ ] **Step 4:** `pytest -q` y `ruff check .` en verde.
- [ ] **Step 5:** Commit `feat: aplicación objetivo con rutas vulnerables y endurecidas`.

### Task 2: Catálogo y lanzador

**Files:**
- Create: `backend/app/ataques.yaml`, `backend/app/catalogo.py`, `backend/app/lanzador.py`
- Test: `backend/tests/test_lanzador.py`

**Interfaces:**
- Consumes: `crea_objetivo`, `Modo`.
- Produces:
  - `catalogo.py`: modelos pydantic `Peticion(metodo, ruta, params: dict = {}, cuerpo: dict | None = None)`, `Exito(contiene: str | None = None, estado: int | None = None)`, `Ataque(id, nombre, descripcion, owasp, attack, funcion, peticiones, exito)`; `ATAQUES: dict[str, Ataque]` cargado al importar.
  - `lanzador.py`: `async def lanzar(ataque: Ataque, modo: Modo) -> Ejecucion`; `Paso(n, metodo, ruta, params, cuerpo, estado, respuesta, cumple)`, `Ejecucion(ataque, modo, origen, pasos, exito)`. `respuesta` recortada a 2000 caracteres. `cumple` = este paso satisface el oráculo; `exito` = alguno lo cumple.

Catálogo (valores exactos):

| id | owasp | attack | funcion | peticiones | exito |
|---|---|---|---|---|---|
| `inyeccion-sql` | `A03:2021 Inyección` | `T1190` | `buscar` | `GET /buscar?q=' UNION SELECT email, clave FROM usuarios --` | `contiene: admin@lab.invalid` |
| `xss-reflejado` | `A03:2021 Inyección` | `T1059.007` | `buscar` | `GET /buscar?q=<script>alert(1)</script>` | `contiene: <script>alert(1)</script>` |
| `recorrido-rutas` | `A01:2021 Pérdida de control de acceso` | `T1190` | `archivo` | `GET /archivo?nombre=../secreto.txt` y `GET /archivo?nombre=publico/../../secreto.txt` | `contiene: SENUELO-LAB-7f3a` |
| `fuerza-bruta` | `A07:2021 Fallos de identificación y autenticación` | `T1110.001` | `login` | 20 `POST /login` con usuario `admin`; la clave correcta `dragon2024` va en la posición 12 | `estado: 200` |

- [ ] **Step 1: Pruebas que fallan:**

```python
@pytest.mark.parametrize("id", ["inyeccion-sql", "xss-reflejado", "recorrido-rutas", "fuerza-bruta"])
async def test_cada_ataque_funciona_en_vulnerable_y_falla_en_endurecida(id):
    assert (await lanzar(ATAQUES[id], "vulnerable")).exito is True
    assert (await lanzar(ATAQUES[id], "endurecida")).exito is False

async def test_fuerza_bruta_paso_a_paso():
    v = await lanzar(ATAQUES["fuerza-bruta"], "vulnerable")
    assert len(v.pasos) == 20 and v.pasos[11].cumple and v.pasos[11].estado == 200
    e = await lanzar(ATAQUES["fuerza-bruta"], "endurecida")
    assert [p.estado for p in e.pasos[:6]] == [401] * 5 + [429]

async def test_origen_simulado_y_ejecuciones_aisladas():
    a, b = await lanzar(ATAQUES["fuerza-bruta"], "endurecida"), await lanzar(ATAQUES["fuerza-bruta"], "endurecida")
    assert ipaddress.ip_address(a.origen) in ipaddress.ip_network("203.0.113.0/24")
    assert b.pasos[0].estado == 401          # el bloqueo de la primera no llega a la segunda

async def test_respuesta_recortada_y_error_del_objetivo_no_rompe():
    roto = ATAQUES["inyeccion-sql"].model_copy(update={"peticiones": [Peticion(metodo="GET", ruta="/buscar", params={"q": "'"})]})
    ej = await lanzar(roto, "vulnerable")
    assert ej.pasos[0].estado == 500 and ej.exito is False
    assert all(len(p.respuesta) <= 2000 for p in ej.pasos)

def test_el_lanzador_no_acepta_destino():
    assert list(inspect.signature(lanzar).parameters) == ["ataque", "modo"]
```

Sin `pytest-asyncio`: las pruebas son síncronas y llaman a `lanzar` con `asyncio.run` (los `async def` y `await` de arriba se escriben así). `crea_app()` lee la configuración al llamarse, no al importar.

- [ ] **Step 2:** `pytest tests/test_lanzador.py -q` → falla.
- [ ] **Step 3: Implementar.** `httpx.AsyncClient(transport=httpx.ASGITransport(app=crea_objetivo(), client=(origen, 40000)), base_url=f"http://objetivo/{modo}")`. `raise_app_exceptions=False` en el transporte para que un fallo del objetivo sea un 500 y no una excepción.
- [ ] **Step 4:** `pytest -q` y `ruff check .` en verde.
- [ ] **Step 5:** Commit `feat: catálogo de ataques y lanzador dentro del proceso`.

### Task 3: API del laboratorio

**Files:**
- Create: `backend/app/main.py`, `backend/app/config.py`
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Consumes: `ATAQUES`, `lanzar`, `FUENTES`, `crea_objetivo`.
- Produces (JSON que usa el panel):
  - `GET /api/health` → `{"status": "ok"}`
  - `GET /api/ataques` → lista de `Ataque` sin `peticiones`, más `n_peticiones: int` y `codigo: {vulnerable: str, endurecida: str}` (de `FUENTES[funcion]`).
  - `POST /api/ataques/{id}/lanzar?modo=` → `Ejecucion`.
  - `GET /api/matriz` → `[{ataque, nombre, vulnerable: bool, endurecida: bool}]`, calculada una vez en el `lifespan`.
- `config.py`: `OBJETIVO_EXPUESTO` (bool, por defecto falso), `CLIENT_IP_HEADER` (por defecto vacío), `LIMITE_POR_MINUTO` (por defecto 30), leídos de `os.environ`.

- [ ] **Step 1: Pruebas que fallan:**

```python
def test_catalogo_trae_codigo_y_no_las_cargas(c):
    a = {x["id"]: x for x in c.get("/api/ataques").json()}
    assert set(a) == {"inyeccion-sql", "xss-reflejado", "recorrido-rutas", "fuerza-bruta"}
    assert "peticiones" not in a["fuerza-bruta"] and a["fuerza-bruta"]["n_peticiones"] == 20
    assert "LIKE" in a["inyeccion-sql"]["codigo"]["vulnerable"]

def test_lanzar(c):
    r = c.post("/api/ataques/inyeccion-sql/lanzar", params={"modo": "vulnerable"}).json()
    assert r["exito"] is True and r["pasos"][0]["cumple"] is True and r["origen"].startswith("203.0.113.")

def test_matriz(c):
    assert all(f["vulnerable"] is True and f["endurecida"] is False for f in c.get("/api/matriz").json())
    assert len(c.get("/api/matriz").json()) == 4

def test_ataque_desconocido_y_modo_invalido(c):
    r = c.post("/api/ataques/no-existe/lanzar", params={"modo": "vulnerable"})
    assert r.status_code == 404 and r.json()["detail"] == "Ese ataque no está en el catálogo."
    assert c.post("/api/ataques/inyeccion-sql/lanzar", params={"modo": "otro"}).status_code == 422

def test_limite_de_uso(monkeypatch):
    monkeypatch.setenv("LIMITE_POR_MINUTO", "3")
    c = TestClient(crea_app())
    lanza = lambda: c.post("/api/ataques/xss-reflejado/lanzar", params={"modo": "vulnerable"})
    assert [lanza().status_code for _ in range(3)] == [200, 200, 200]
    r = lanza()
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0
    assert r.json()["detail"] == f"Demasiados lanzamientos. Espera {r.headers['Retry-After']} s."

def test_objetivo_cerrado_por_defecto_y_abierto_con_la_variable(monkeypatch):
    assert TestClient(crea_app()).get("/objetivo/vulnerable/buscar", params={"q": "a"}).status_code == 404
    monkeypatch.setenv("OBJETIVO_EXPUESTO", "true")
    assert TestClient(crea_app()).get("/objetivo/vulnerable/buscar", params={"q": "Teclado"}).status_code == 200
```

- [ ] **Step 2:** `pytest tests/test_api.py -q` → falla.
- [ ] **Step 3: Implementar `crea_app() -> FastAPI` y `app = crea_app()`.** Límite: `dict[str, deque[float]]` por IP, ventana 60 s, solo en `lanzar`; la IP sale de `CLIENT_IP_HEADER` si está definido, si no de `request.client.host`; no se guarda en ningún otro sitio. Montar `frontend/dist` en `/` al final si existe (como triaje).
- [ ] **Step 4:** `pytest -q` y `ruff check .` en verde.
- [ ] **Step 5:** Commit `feat: API del laboratorio (catálogo, lanzar, matriz, límite de uso)`.

### Task 4: Panel y lienzo

**Files:**
- Create: `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/main.tsx`, `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/Flow.tsx`, `frontend/src/App.tsx`, `frontend/src/styles.css`

**Interfaces:**
- Consumes: los JSON de la Tarea 3.
- Produces (lo que el e2e y las capturas localizan):
  - `data-testid="nodo-atacar" | "nodo-objetivo" | "nodo-resultado"`; el nodo activo lleva `data-activo="true"`.
  - `data-testid="resultado"` con el texto exacto `El ataque tuvo éxito` o `El ataque no tuvo éxito`.
  - `data-testid="matriz"`: tabla con una fila por ataque y celdas `Tuvo éxito` / `No tuvo éxito`.
  - Botón con nombre accesible `Lanzar`; grupo de radio `Modo` con `Vulnerable` y `Endurecida`; lista de ataques como botones con su nombre.

`package.json` como el de triaje sin `react-router-dom`, con `@fontsource/public-sans` y `@fontsource/sora` y `"license": "UNLICENSED"`. `vite.config.ts` con proxy de `/api` a `http://localhost:8000`.

- [ ] **Step 1: `types.ts` y `api.ts`.** `getAtaques()`, `getMatriz()`, `lanzar(id, modo)`. Un error HTTP lanza `Error(detail)`; en 429 el mensaje es el `detail` del servidor.
- [ ] **Step 2: `Flow.tsx`.** `Flow({ ataque, modo, paso, total, estado })` donde `estado` es `"reposo" | "en-curso" | "exito" | "fallo"`. SVG propio: tres nodos y dos aristas. En curso, un punto recorre la arista Atacar → Objetivo una vez por paso y el nodo Objetivo late; al terminar, la arista Objetivo → Resultado se enciende en `--alta` si hubo éxito y en `--auto` si no. El nodo Objetivo muestra el modo; el de Atacar, `paso / total`. En reposo no se mueve nada.
- [ ] **Step 3: `App.tsx`.** Estado: ataques, matriz, ataque elegido, modo, ejecución, índice de paso, error. Al pulsar «Lanzar»: botón deshabilitado, `lanzar()`, y reproducción de `pasos` con un temporizador de 450 ms por paso (0 ms con `prefers-reduced-motion`; con más de 8 pasos, 160 ms). El resultado se anuncia al terminar la reproducción en una región `aria-live`. Cualquier error rehabilita el botón y se muestra con `role="alert"`. Debajo del lienzo:
  - Paso actual: método, ruta con parámetros, estado y respuesta (en `<pre>`, como texto, nunca como HTML).
  - Etiquetas OWASP y ATT&CK del ataque.
  - Código vulnerable y endurecido lado a lado, con el del modo elegido resaltado.
  - Matriz.
- [ ] **Step 4: `styles.css`.** Variables y base copiadas de triaje; tarjetas con borde cónico y brillo que sigue al puntero (misma receta); bloque `@media (prefers-reduced-motion: reduce)` que anula animaciones y transiciones.
- [ ] **Step 5:** `npm install && npm run build` sin errores. Con `uvicorn app.main:app` y `npm run dev`, lanzar los cuatro ataques en ambos modos a mano.
- [ ] **Step 6: Captura temprana.** Captura del lienzo a mitad de un ataque y del resultado, y enseñarla al autor antes de seguir (lo pide el proceso del portafolio). Ajustar con su respuesta.
- [ ] **Step 7:** Commit `feat: panel con lienzo, reproducción paso a paso y matriz`.

### Task 5: Contenedor, extremo a extremo, CI y README

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/ci.yml`, `e2e/test_lab.py`, `scripts/capturas.py`, `README.md`, `docs/img/`

- [ ] **Step 1:** `Dockerfile` como el de triaje sin `/data` ni `DATABASE_URL`. `docker-compose.yml`: puerto `${LAB_PORT:-8095}:8000`. `ci.yml` igual al de triaje (backend con ruff y pytest, frontend con `npm ci` y build, e2e).
- [ ] **Step 2: `e2e/test_lab.py`** (pytest + Playwright contra `http://localhost:8095`, variable `LAB_URL`):

```python
def test_cada_ataque_en_cada_modo_coincide_con_la_api(page):   # 4 × 2
    # elegir ataque y modo, Lanzar, esperar data-testid=resultado;
    # su texto coincide con /api/matriz para ese ataque y modo
def test_la_matriz_del_panel_es_la_de_la_api(page)
def test_error_de_la_api_rehabilita_el_boton(page):
    # page.route("**/lanzar*", abort) → aparece role=alert y «Lanzar» vuelve a estar habilitado
def test_limite_de_uso_se_muestra(page):
    # page.route devuelve 429 con detail «Demasiados lanzamientos. Espera 12 s.» → ese texto en role=alert
def test_sin_errores_de_consola_propios(page)
def test_el_objetivo_no_es_accesible(page):
    # GET {LAB_URL}/objetivo/vulnerable/buscar?q=a → 404
```

- [ ] **Step 3:** `COMPOSE_PROJECT_NAME=laboratorio-defensa-e2e docker compose up -d --build --wait` y `uv run --with pytest --with playwright pytest e2e -q` en verde.
- [ ] **Step 4: `scripts/capturas.py`** (`uv run --with playwright --with pillow`, `channel="msedge"`): capturas del lienzo en reposo, a mitad de la inyección SQL y de la matriz, y GIF de fuerza bruta en vulnerable y después en endurecida. GIF con `Image.Quantize.FASTOCTREE`, 255 colores, menos de 1 MB.
- [ ] **Step 5: `README.md`.** GIF arriba; qué es y qué no es (laboratorio; los ataques no salen del proceso); tabla de ataques con OWASP y ATT&CK; matriz medida (copiada de `/api/matriz`, con fecha); el antes y el después de una función; cómo ejecutarlo; pruebas; decisiones y límites honestos (reproducción a ritmo de presentación, orígenes simulados, objetivo cerrado); estaciones previstas para las entregas 2 y 3 en una línea; licencia.
- [ ] **Step 6:** Commit `feat: contenedor, pruebas de extremo a extremo, CI y README`.
- [ ] **Step 7: Publicación (con confirmación del autor).** Crear el repo público en GitHub, subir `main` y la rama, abrir el PR y esperar el CI en verde. La fusión la hace el autor.
