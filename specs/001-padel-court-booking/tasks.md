---

description: "Lista de tareas para implementar el Sistema de Reservas de Canchas de Pádel"
---

# Tasks: Sistema de Reservas de Canchas de Pádel

**Input**: Design documents from `/specs/001-padel-court-booking/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api.md](./contracts/api.md), [quickstart.md](./quickstart.md)

**Tests**: Incluidas. SC-003 (≥ 10 confirmaciones simultáneas, 0 dobles reservas) y SC-004 (100 % de rechazos) son criterios medibles que exigen pruebas automatizadas, y `plan.md` define los archivos de prueba. Escribir cada prueba primero y verificar que FALLA antes de implementar.

**Organization**: Tareas agrupadas por historia de usuario (US1 = Registro e inicio de sesión, US2 = Disponibilidad y reserva, US3 = Mis Reservas).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Se puede ejecutar en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1, US2, US3)
- Rutas relativas a la raíz del repositorio: `backend/`, `frontend/`, `db/`

## Reglas transversales (aplican a TODAS las tareas)

- **Constitución**: sin ORMs, sin clases (salvo que una librería lo exija), sin capas repositorio/servicio, sin DI; SQL puro con `better-sqlite3`; `camelCase` para funciones/variables, `PascalCase` para tipos/componentes.
- **Errores**: siempre el cuerpo `{ "error": { "code", "message" } }` con los códigos y mensajes EXACTOS del [catálogo de errores](./contracts/api.md#catálogo-de-errores).
- **Tiempo**: nunca llamar `new Date()` dentro de la lógica; usar el `now()` recibido por `createApp` y las funciones de `backend/src/time.ts`.
- **Nada fuera de spec.md** (Principio VI): si algo no está documentado, detenerse y preguntar.
- **Imports en el backend** (`"type": "module"` + `NodeNext`): todo import relativo lleva extensión `.js` aunque el archivo fuente sea `.ts` (p. ej. `import { openDb } from './db.js'`, `import { makeCreateReservation } from '../src/reservations.js'`). Los imports de paquetes no la llevan. La única excepción es la URL del worker en T029 (`new URL('./concurrencyWorker.ts', import.meta.url)`), que apunta al archivo `.ts` real porque `tsx` lo carga directamente.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicializar las tres carpetas planas y sus herramientas.

- [X] T001 Crear las carpetas `db/`, `backend/src/`, `backend/tests/`, `frontend/src/pages/`, `frontend/src/components/`, `frontend/tests/` y un `.gitignore` en la raíz que ignore `node_modules/`, `dist/`, `db/padel.db`, `db/*.db-wal`, `db/*.db-shm` y `*.test.db`
- [X] T002 Crear `backend/package.json` con `"type": "module"`, dependencias `express@4`, `better-sqlite3`; devDependencies `typescript`, `tsx`, `vitest`, `supertest`, `@types/express`, `@types/better-sqlite3`, `@types/supertest`, `@types/node`; scripts `dev` (`tsx watch src/index.ts`), `build` (`tsc -p tsconfig.build.json`), `start` (`node dist/index.js`), `test` (`vitest run`), `typecheck` (`tsc -p tsconfig.json`); ejecutar `npm install` en `backend/`
- [X] T003 [P] Crear la configuración de TypeScript y Vitest del backend:
  - `backend/tsconfig.json` (verificación de tipos de código y pruebas): `strict: true`, `target: ES2022`, `module`/`moduleResolution: NodeNext`, `esModuleInterop: true`, `skipLibCheck: true`, `types: ["node"]`, `noEmit: true`, `include: ["src", "tests", "vitest.config.ts"]`, sin `rootDir` ni `outDir`.
  - `backend/tsconfig.build.json` (compilación de producción): `"extends": "./tsconfig.json"`, `compilerOptions: { noEmit: false, rootDir: "src", outDir: "dist" }`, `include: ["src"]`, de modo que `dist/index.js` corresponde a `src/index.ts`.
  - `backend/vitest.config.ts`: `environment: 'node'`, `include: ['tests/**/*.test.ts']` (así `concurrencyWorker.ts` y `helpers.ts` no se ejecutan como suites).
- [X] T004 [P] Crear el proyecto Vite React+TS en `frontend/`: `frontend/package.json` (dependencias `react@18`, `react-dom@18`, `react-router-dom@6`; devDependencies `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`, `tailwindcss@3`, `postcss`, `autoprefixer`, `vitest`, `@testing-library/react`, `jsdom`; scripts `dev`, `build`, `test` (`vitest run`), `typecheck` (`tsc --noEmit`)), `frontend/tsconfig.json` (strict, `jsx: react-jsx`), `frontend/index.html` (`lang="es"`, título "Reservas de Pádel") y `frontend/vite.config.ts` con `server.proxy` `'/api' → 'http://localhost:3000'` y bloque `test: { environment: 'jsdom', include: ['tests/**/*.test.{ts,tsx}'] }`; ejecutar `npm install` en `frontend/`
- [X] T005 [P] Configurar Tailwind en `frontend/tailwind.config.js` (content `./index.html`, `./src/**/*.{ts,tsx}`), `frontend/postcss.config.js` y `frontend/src/index.css` con las directivas `@tailwind base; @tailwind components; @tailwind utilities;`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Base de datos, reloj, errores, app Express, sesión y cliente HTTP que usan todas las historias.

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta completar esta fase.

- [X] T006 Crear `db/schema.sql` con `CREATE TABLE IF NOT EXISTS` para `users`, `sessions`, `courts` y `reservations` exactamente como en [data-model.md](./data-model.md) (incluye `email UNIQUE COLLATE NOCASE`, `sessions.token_hash PRIMARY KEY`, `ON DELETE CASCADE`, `CHECK (start_hour BETWEEN 0 AND 23)`, `CHECK` de formato de `date`, `UNIQUE (court_id, date, start_hour)`, índices `idx_sessions_user` e `idx_reservations_user (user_id, date, start_hour)`)
- [X] T007 [P] Crear `db/seed.sql` con `INSERT OR IGNORE INTO courts (id, name)` de las 5 canchas: 1 Cancha Laureles, 2 Cancha El Poblado, 3 Cancha Belén, 4 Cancha Robledo, 5 Cancha Envigado
- [X] T008 Implementar `openDb(path: string, options: { init?: boolean } = {})` en `backend/src/db.ts`: abre `better-sqlite3` y siempre aplica `PRAGMA journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`; si `options.init !== false` (por defecto) ejecuta además `db/schema.sql` y `db/seed.sql` (resueltos relativos al archivo con `import.meta.url`); devuelve la conexión. `init: false` lo usan solo conexiones adicionales a una base ya inicializada (T029). exportar también `defaultDbPath` = `process.env.DB_PATH ?? <raíz>/db/padel.db`
- [X] T009 [P] Implementar funciones puras en `backend/src/time.ts` (UTC−5 fijo, ver [research R4](./research.md#r4-zona-horaria-y-cálculo-de-ahora-supuestos-fr-012-fr-018-fr-025)): `todayInMedellin(now: Date): string` (YYYY-MM-DD vía `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })`), `isValidDate(s: string): boolean` (formato y fecha real, rechaza `2026-02-30`), `addDays(date: string, n: number): string`, `slotStart(date: string, startHour: number): Date` (`Date.UTC(y, m-1, d, startHour + 5)`), `slotEnd(date, startHour): Date` (+1 h), `bookingWindow(now): { from: string; to: string }` (hoy..hoy+13), `isWithinWindow(date, now): boolean`, `formatHour(h): string` (`"HH:00"`, con `24` → `"24:00"`), `slotLabel(h): string` (`"14:00–15:00"`, el último `"23:00–24:00"`, guion en `–`)
- [X] T010 [P] Implementar `backend/src/errors.ts`: constante `ERRORS` con TODOS los códigos del [catálogo](./contracts/api.md#catálogo-de-errores) (`status` + `message` literal), tipo `ErrorCode`, función `appError(code: ErrorCode): Error & { code: ErrorCode }` para lanzar dentro de transacciones y función `sendError(res, code)` que responde `res.status(status).json({ error: { code, message } })`
- [X] T011 Implementar la base de sesión en `backend/src/auth.ts` (sin rutas todavía): `hashPassword(pw): Promise<string>` y `verifyPassword(pw, stored): Promise<boolean>` con `crypto.scrypt` asíncrono (sin bloquear el servidor; N=16384, r=8, p=1, keylen 64, salt 16 bytes, formato `scrypt$<saltHex>$<hashHex>`, comparación con `timingSafeEqual`); `createSession(db, userId, now): string` (token `randomBytes(32).toString('base64url')`, guarda `sha256(token)` hex con `expires_at = now + 7 días` ISO); `setSessionCookie(res, token)` (`sid`, `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 7 días`, `secure` si `NODE_ENV === 'production'`); `readSidCookie(req): string | undefined` (parseo manual de `req.headers.cookie`); middleware `requireAuth(db, now)` que busca la sesión por hash, si no existe → 401 `UNAUTHENTICATED`, si `expires_at <= now()` → borra la fila y 401, si es válida → `res.locals.userId` y `res.locals.tokenHash`
- [X] T012 Implementar `createApp({ db, now }: { db: Database; now: () => Date })` en `backend/src/app.ts`: `express.json()`, manejador que convierte JSON mal formado (`entity.parse.failed`) en 400 `INVALID_REQUEST`, punto de montaje de routers (vacío por ahora), fallback `/api/*` → 404 `NOT_FOUND` y error handler final que hace `console.error` y responde 500 `INTERNAL_ERROR` (o el `code` si el error viene de `appError`), sin detalles internos. Crear `backend/src/index.ts` que llama `openDb(defaultDbPath)`, `createApp({ db, now: () => new Date() })` y escucha en `process.env.PORT ?? 3000`
- [X] T013 Crear helpers de prueba en `backend/tests/helpers.ts` (requiere T008, T011 y T012): `makeTestApp(nowIso: string)` (DB temporal única en `os.tmpdir()` con `openDb`, reloj mutable `setNow(iso)`, devuelve `{ app, db, setNow }`), `createUserWithSession(db, email, now)` (inserta usuario con `hashPassword('secreta123')` y devuelve la cabecera `Cookie: sid=...`), `insertReservation(db, { userId, courtId, date, startHour })`
- [X] T014 [P] Escribir `backend/tests/time.test.ts`: `todayInMedellin` en 2026-11-08T04:59Z → `2026-11-07` y en 05:00Z → `2026-11-08`; `isValidDate('2026-02-30') === false`; `slotStart('2026-11-10', 14)` = `2026-11-10T19:00:00Z`; `bookingWindow` = hoy..hoy+13; `slotLabel(23) === '23:00–24:00'`, `slotLabel(0) === '00:00–01:00'`
- [X] T015 [P] Implementar `frontend/src/api.ts`: tipos `User`, `Court`, `Slot`, `Reservation`, `ApiError` (objeto `{ status, code, message }`, sin clase); `apiFetch<T>(path, init)` con `credentials: 'include'` y `Content-Type: application/json`; si la respuesta no es OK lanza `ApiError` con el `code`/`message` del cuerpo o, si no hay cuerpo válido o falla la red, `{ code: 'INTERNAL_ERROR', message: 'Ocurrió un problema inesperado. Inténtalo de nuevo en unos minutos.' }`; ante 401 en rutas distintas de `/api/auth/login` dispara `window.dispatchEvent(new Event('auth:expired'))`; respuesta 204 → `undefined`
- [X] T016 [P] Crear `frontend/src/components/ErrorMessage.tsx`: recibe `message?: string` y lo muestra en un contenedor Tailwind rojo con `role="alert"`; no renderiza nada si no hay mensaje
- [X] T017 Crear `frontend/src/main.tsx` (importa `index.css`, monta `<App />` dentro de `BrowserRouter`) y `frontend/src/App.tsx` con un layout base (encabezado "Reservas de Pádel", `<main>`) y `<Routes>` vacío con redirección de `/` a `/canchas`

**Checkpoint**: `npm test` y `npm run typecheck` pasan en `backend/`; `npm run dev` levanta backend y frontend; `db/padel.db` contiene las 5 canchas.

---

## Phase 3: User Story 1 - Registro e inicio de sesión (Priority: P1) 🎯 MVP

**Goal**: Una persona puede registrarse, iniciar sesión, mantener la sesión 7 días y cerrarla; sin sesión se le pide iniciar sesión.

**Independent Test**: Registrar una cuenta nueva, cerrar sesión, iniciar sesión con las mismas credenciales y comprobar `GET /api/auth/me` = 200; sin cookie = 401 (pasos 3–6 de [quickstart.md](./quickstart.md#validación-manual-navegador)).

### Tests for User Story 1 ⚠️

- [X] T018 [P] [US1] Escribir `backend/tests/auth.test.ts` (Supertest + `makeTestApp`): register 201 con `Set-Cookie: sid` HttpOnly y cuerpo `{ user: { id, email } }`; correo normalizado a minúsculas; duplicado `ANA@example.com` → 409 `EMAIL_TAKEN`; correo inválido → 400 `INVALID_EMAIL`; contraseña de 7 caracteres → 400 `PASSWORD_TOO_SHORT`; de 129 caracteres → 400 `PASSWORD_TOO_LONG`; login correcto 200 + cookie; contraseña incorrecta y correo inexistente → ambos 401 `INVALID_CREDENTIALS` con el mismo `message`; `GET /api/auth/me` sin cookie → 401 `UNAUTHENTICATED`, con cookie → 200; logout → 204 y luego `me` → 401; sesión con reloj avanzado 7 días + 1 minuto → 401; ninguna respuesta contiene `password_hash`

### Implementation for User Story 1

- [X] T019 [US1] Crear `backend/src/rules.ts` con `validateEmail(email: unknown): string | null` (trim, lowercase, ≤ 254, regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`; devuelve el correo normalizado o `null`) y `validatePassword(pw: unknown): null | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG'` (no string o < 8 → `PASSWORD_TOO_SHORT`; > 128 → `PASSWORD_TOO_LONG`; FR-003)
- [X] T020 [US1] Añadir a `backend/src/auth.ts` la función `authRouter(db, now, auth)` (`auth` = middleware `requireAuth` compartido, ver T059) con: `POST /register` (valida con `rules.ts` → 400, inserta usuario; si `SQLITE_CONSTRAINT_UNIQUE` → 409 `EMAIL_TAKEN`; crea sesión, pone cookie, 201); `POST /login` (faltan campos → 400 `INVALID_REQUEST`; si el usuario no existe ejecuta igualmente `verifyPassword` contra un hash ficticio fijo para igualar tiempos; fallo → 401 `INVALID_CREDENTIALS`; éxito → sesión + cookie + 200); `POST /logout` protegido con `requireAuth` (borra la sesión por `tokenHash`, limpia la cookie con `maxAge: 0`, 204); `GET /me` protegido (200 `{ user: { id, email } }`)
- [X] T021 [US1] Montar `authRouter(db, now, auth)` en `/api/auth` dentro de `backend/src/app.ts` (antes del fallback 404)
- [X] T022 [P] [US1] Crear `frontend/src/useAuth.tsx`: `AuthProvider` + hook `useAuth()` con estado `{ user: User | null; loading: boolean }`, carga inicial con `GET /api/auth/me` (401 → `user = null`), funciones `login(email, pw)`, `register(email, pw)`, `logout()`; escucha el evento `auth:expired` para poner `user = null`
- [X] T023 [P] [US1] Crear `frontend/src/pages/LoginPage.tsx`: formulario correo + contraseña (labels en español), botón "Iniciar sesión", muestra `ErrorMessage` con el `message` del `ApiError`, tras éxito navega a la ruta de origen (`location.state.from`) o a `/canchas`; enlace "¿No tienes cuenta? Regístrate" a `/registro`; si llegó por sesión expirada muestra "Tu sesión expiró o no has iniciado sesión. Inicia sesión para continuar."
- [X] T024 [P] [US1] Crear `frontend/src/pages/RegisterPage.tsx`: formulario correo + contraseña con ayuda "Mínimo 8 caracteres", validación previa de conveniencia (mismos mensajes del catálogo), botón "Crear cuenta", muestra errores del backend, tras éxito navega a `/canchas`; enlace a `/login`
- [X] T025 [US1] En `frontend/src/App.tsx`: envolver en `AuthProvider`, añadir componente `RequireAuth` (si `loading` muestra "Cargando…"; si no hay usuario redirige a `/login` con `state.from`), rutas `/login` y `/registro`, y barra de navegación que muestra el correo del usuario y botón "Cerrar sesión" (o enlaces "Iniciar sesión"/"Registrarse" sin sesión); al cerrar sesión navegar a `/login`

**Checkpoint**: US1 completa: `auth.test.ts` en verde y pasos 3–6 del quickstart funcionan en el navegador.

---

## Phase 4: User Story 2 - Consultar disponibilidad y reservar un bloque (Priority: P1)

**Goal**: Ver las 5 canchas, elegir fecha dentro de la ventana de 14 días, ver la grilla de 24 bloques y reservar sin doble reserva, respetando la regla de 1 reserva activa (+1 contigua, máx. 2 h).

**Independent Test**: Con un usuario autenticado sin reservas, reservar mañana 14:00 en Cancha Belén; otro usuario ve ese bloque "Reservado"; 10 confirmaciones simultáneas sobre un mismo bloque producen exactamente 1 × 201 (pasos 1–2 y 7–13 del [quickstart](./quickstart.md#validación-manual-navegador)).

### Tests for User Story 2 ⚠️

- [X] T026 [P] [US2] Escribir `backend/tests/rules.test.ts` para `checkActiveRule(active, candidate)`: 0 activas → OK; 1 activa Belén 14:00 + candidata Belén 15:00 u 13:00 → OK; + Laureles 15:00 → `ACTIVE_RESERVATION_EXISTS`; + Belén 17:00 → `ACTIVE_RESERVATION_EXISTS`; activa Belén 23:00 día D + Belén 00:00 día D+1 → OK (contigüidad a medianoche); 2 activas → `MAX_CONSECUTIVE_REACHED`. Las pruebas de `consecutiveRunLength` se añadieron en T055.
- [X] T027 [P] [US2] Escribir `backend/tests/courts.test.ts`: `GET /api/courts` sin cookie → 200 con exactamente las 5 canchas en orden por id; availability sin cookie → 401; `courtId=9` → 404 `COURT_NOT_FOUND`; `date` ausente o `2026-02-30` → 400 `INVALID_DATE`; respuesta con 24 `slots` (`startHour` 0..23, `label` `00:00–01:00` … `23:00–24:00`), `bookingWindow` correcto; con reloj a las 14:20 de hoy los bloques 0..14 tienen `selectable: false`; bloque reservado → `status: 'reserved'`, `selectable: false` y la respuesta no contiene `userId`/`user_id`/correo; fecha válida fuera de ventana → 200 con todos `selectable: false`
- [X] T028 [P] [US2] Escribir `backend/tests/reservations.test.ts` para `POST /api/reservations`: sin cookie → 401 y no inserta; éxito → 201 con `court`, `date`, `startTime`, `endTime`; `startHour` 10.5, 24, -1 o string → 400 `INVALID_SLOT`; `courtId` 9 → 404; fecha pasada y bloque en curso (14:20 → 14:00) → 400 `SLOT_IN_PAST`; hoy+14 → 400 `OUTSIDE_BOOKING_WINDOW`, hoy+13 → 201; bloque ocupado → 409 `SLOT_TAKEN`; regla FR-019 (escenarios US2-6, US2-7, US2-8) con sus mensajes literales; bloque contiguo ocupado por otro usuario → 409 `SLOT_TAKEN` (la colisión se evalúa antes que la regla); reserva activa que ya terminó (reloj avanzado) no cuenta y permite reservar otra
- [X] T029 [P] [US2] Escribir `backend/tests/concurrency.test.ts` con tres casos:
  (a) **HTTP**: crear 10 usuarios con sesión y lanzar 10 `POST /api/reservations` al mismo bloque con `Promise.all` → exactamente 1 × 201 y 9 × 409 `SLOT_TAKEN`; la tabla tiene 1 fila para ese bloque.
  (b) **Multiconexión real**: antes de lanzar los hilos, inicializar la base y crear los 10 usuarios desde el hilo principal (`makeTestApp` + `createUserWithSession`) y pasar `db.name` como `dbPath`. Crear `backend/tests/concurrencyWorker.ts` que lee `workerData` (`{ dbPath, userId, slot, nowIso, barrier }`), abre su propia conexión con `openDb(dbPath, { init: false })` (ver T008), espera la barrera (`Atomics.wait` sobre el `Int32Array` de `barrier`, un `SharedArrayBuffer`), ejecuta `makeCreateReservation(db)(userId, slot, new Date(nowIso))` (exportada desde `backend/src/reservations.ts`, ver T034) y envía con `parentPort.postMessage` `{ ok: true }` o `{ ok: false, code }` (el `code` de `appError`, o `'UNEXPECTED'` con el mensaje si es otro error); cierra la conexión al terminar. En la prueba, lanzar 10 hilos con `new Worker(bootstrap, { eval: true, workerData })`, donde `bootstrap` es ``import('tsx/esm/api').then(({ tsImport }) => tsImport(workerUrl, workerUrl))`` y `workerUrl` la URL de `concurrencyWorker.ts` (nota de implementación: en Node 22 `execArgv: ['--import', 'tsx']` no aplica el cargador dentro de `worker_threads` y los imports `.js` no resuelven a `.ts`), esperar el evento `online` de los 10, liberar la barrera (`Atomics.store` + `Atomics.notify`) y recoger los 10 mensajes → exactamente 1 `{ ok: true }` y 9 `{ ok: false, code: 'SLOT_TAKEN' }`, ninguno `SQLITE_BUSY` ni `UNEXPECTED` (lo evita `busy_timeout`); la tabla tiene 1 fila para ese bloque. Timeout de la prueba: 20 s.
  (c) **Red de seguridad**: con una segunda conexión, un `INSERT` directo del mismo bloque lanza `SQLITE_CONSTRAINT_UNIQUE`.
- [X] T030 [P] [US2] Escribir `frontend/tests/SlotGrid.test.tsx` (React Testing Library): renderiza 24 bloques con sus etiquetas, texto "Disponible"/"Reservado", los no seleccionables están `disabled`, al pulsar uno seleccionable llama `onSelect(startHour)`
- [X] T031 [P] [US2] Escribir `frontend/tests/DatePicker.test.tsx`: el `<input type="date">` tiene `min` = `from` y `max` = `to` de la ventana y al cambiar llama `onChange(fecha)`

### Implementation for User Story 2

- [X] T032 [US2] Añadir a `backend/src/rules.ts`: `parseSlotInput(body): { courtId: number; date: string; startHour: number } | null` (enteros, `startHour` 0..23, `isValidDate`) y la función pura `checkActiveRule(active: Array<{ courtId; date; startHour }>, candidate): null | 'ACTIVE_RESERVATION_EXISTS' | 'MAX_CONSECUTIVE_REACHED'` según [research R5](./research.md#r5-regla-de-reserva-activa-con-excepción-contigua-fr-019), comparando instantes con `slotStart` para que la contigüidad cruce la medianoche. (La racha de 2 horas seguidas que incluye reservas finalizadas la cubre `consecutiveRunLength`, ver T055.)
- [X] T033 [US2] Crear `backend/src/courts.ts` con `courtsRouter(db, now, auth)`: `GET /` público (`SELECT id, name FROM courts ORDER BY id`); `GET /:courtId/availability` con el middleware `auth`: valida cancha (404) y `date` (400 `INVALID_DATE`), consulta `SELECT start_hour FROM reservations WHERE court_id = ? AND date = ?` y construye los 24 `slots` con `status` y `selectable` (`available` && `slotStart > now` && `isWithinWindow`), más `court`, `date` y `bookingWindow`; nunca seleccionar columnas de usuario
- [X] T034 [US2] Crear `backend/src/reservations.ts` con `reservationsRouter(db, now, auth)` y `POST /` protegido: valida con `parseSlotInput` (400 `INVALID_SLOT`; si `courtId` es entero pero no existe → 404 `COURT_NOT_FOUND`) y llama a la función creada con `makeCreateReservation(db)`. Esa fábrica, exportada desde este mismo archivo, prepara las sentencias una vez y la reutiliza T029. Dentro de `db.transaction(...).immediate()` aplica, en el orden de [data-model.md](./data-model.md#reglas-de-validación-al-crear-una-reserva-en-orden-dentro-de-una-transacción-immediate): cancha inexistente → `COURT_NOT_FOUND`; `slotStart <= now` → `SLOT_IN_PAST`; fuera de ventana → `OUTSIDE_BOOKING_WINDOW`; colisión → `SLOT_TAKEN`; con las reservas del usuario desde ayer, `checkActiveRule` sobre las activas (fin > now) y `consecutiveRunLength` sobre las de la misma cancha (T056); `INSERT`; `SQLITE_CONSTRAINT_UNIQUE` → `SLOT_TAKEN`. Responde 201 con el formato del [contrato](./contracts/api.md#post-apireservations-)
- [X] T035 [US2] Montar `courtsRouter` en `/api/courts` y `reservationsRouter` en `/api/reservations` en `backend/src/app.ts`
- [X] T036 [US2] Añadir a `frontend/src/api.ts` las funciones `getCourts()`, `getAvailability(courtId, date)` y `createReservation({ courtId, date, startHour })` con sus tipos de respuesta
- [X] T037 [P] [US2] Crear `frontend/src/components/DatePicker.tsx`: `<input type="date">` con label "Fecha", props `value`, `min`, `max`, `onChange`; las fechas fuera de la ventana quedan deshabilitadas por `min`/`max`
- [X] T038 [P] [US2] Crear `frontend/src/components/SlotGrid.tsx`: grilla Tailwind responsiva de 24 botones; cada uno muestra `label` y "Disponible" (verde) o "Reservado" (gris); `disabled` si `!selectable` (estilo atenuado, incluye bloques pasados); resalta el seleccionado; prop `onSelect(startHour)`
- [X] T039 [US2] Crear `frontend/src/pages/CourtsPage.tsx` (pública): lista las 5 canchas de `getCourts()`; con sesión cada una enlaza a `/canchas/:id`; sin sesión, al pulsar muestra "Inicia sesión o regístrate para ver la disponibilidad" con enlaces a `/login` y `/registro` (FR-009, US1-5)
- [X] T040 [US2] Crear `frontend/src/pages/CourtAvailabilityPage.tsx`: lee `courtId` de la URL, fecha inicial = `bookingWindow.from` (primera carga con la fecha de hoy calculada en America/Bogota), muestra nombre de la cancha, `DatePicker` y `SlotGrid`; al elegir bloque muestra un panel de confirmación "Reservar {cancha} el {fecha} de {HH:mm} a {HH:mm}" con botones "Confirmar reserva" y "Cancelar"; al confirmar llama `createReservation`, muestra confirmación con cancha, fecha y hora (FR-020) y recarga la grilla; ante `SLOT_TAKEN`, `SLOT_IN_PAST` u `OUTSIDE_BOOKING_WINDOW` muestra el mensaje, limpia la selección y recarga la grilla (Edge Case "Grilla desactualizada"); ante 401 no hace nada más (la sesión expirada la gestiona `auth:expired`); cualquier otro error se muestra con `ErrorMessage`
- [X] T041 [US2] Registrar en `frontend/src/App.tsx` la ruta pública `/canchas` (`CourtsPage`) y la protegida `/canchas/:courtId` (`CourtAvailabilityPage` dentro de `RequireAuth`), y el enlace "Canchas" en la navegación

**Checkpoint**: US1 + US2 funcionan: tests `rules`, `courts`, `reservations`, `concurrency`, `SlotGrid`, `DatePicker` en verde; pasos 1–2 y 7–13 del quickstart OK.

---

## Phase 5: User Story 3 - Ver y gestionar "Mis Reservas" (Priority: P2)

**Goal**: El usuario ve "Próximas" e "Historial" y puede cancelar una reserva futura tras confirmar.

**Independent Test**: Con un usuario con una reserva futura y una pasada (insertadas con `insertReservation`), abrir el panel, verificar ambas listas, cancelar la futura confirmando y comprobar que el bloque vuelve a "Disponible" (pasos 14–17 del [quickstart](./quickstart.md#validación-manual-navegador)).

### Tests for User Story 3 ⚠️

- [X] T042 [P] [US3] Escribir `backend/tests/myReservations.test.ts`: `GET /api/reservations/me` sin cookie → 401; separa `upcoming` (inicio > now, ascendente, `cancellable: true`) e `history` (inicio ≤ now incl. en curso, descendente, `cancellable: false`); no incluye reservas de otro usuario; usuario sin reservas → ambas listas vacías. `DELETE /api/reservations/:id`: propia futura → 204 y el bloque vuelve a `available` para otro usuario; ajena o inexistente → 404 `RESERVATION_NOT_FOUND` sin borrar nada; ya iniciada (reloj 14:20, bloque 14:00) → 409 `RESERVATION_STARTED`; cancelar una de dos contiguas deja la otra y permite reservar de nuevo el bloque contiguo; tras cancelar la activa se puede reservar otro bloque en otra cancha
- [X] T043 [P] [US3] Escribir `frontend/tests/ConfirmDialog.test.tsx`: renderiza título y mensaje, "Sí, cancelar" llama `onConfirm`, "No, volver" llama `onCancel`, no se muestra si `open` es `false`

### Implementation for User Story 3

- [X] T044 [US3] Añadir a `backend/src/reservations.ts` `GET /me` protegido: `SELECT r.id, r.date, r.start_hour, c.id, c.name FROM reservations r JOIN courts c ON c.id = r.court_id WHERE r.user_id = ?`, clasificar con `slotStart(date, startHour) > now` en `upcoming`/`history`, ordenar y mapear a `{ id, court: { id, name }, date, startTime, endTime, cancellable }` según el [contrato](./contracts/api.md#get-apireservationsme-)
- [X] T045 [US3] Añadir a `backend/src/reservations.ts` `DELETE /:id` protegido: `SELECT ... WHERE id = ? AND user_id = ?` (si no hay fila → 404 `RESERVATION_NOT_FOUND`, sin distinguir ajena de inexistente); `slotStart <= now` → 409 `RESERVATION_STARTED`; `DELETE FROM reservations WHERE id = ? AND user_id = ?`; 204
- [X] T046 [US3] Añadir a `frontend/src/api.ts` `getMyReservations()` y `cancelReservation(id)`
- [X] T047 [P] [US3] Crear `frontend/src/components/ConfirmDialog.tsx`: modal accesible (`role="dialog"`, `aria-modal`) con props `open`, `title`, `message`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`; estilos Tailwind
- [X] T048 [US3] Crear `frontend/src/pages/MyReservationsPage.tsx`: secciones "Próximas" e "Historial", cada ítem con nombre de la cancha, fecha y `startTime–endTime` (24 h); botón "Cancelar" solo si `cancellable`; abre `ConfirmDialog` ("¿Cancelar la reserva de {cancha} el {fecha} de {hora}?"); al confirmar llama `cancelReservation` y recarga la lista; al desistir no cambia nada; si ambas listas están vacías muestra "Aún no tienes reservas"; errores con `ErrorMessage`
- [X] T049 [US3] Registrar en `frontend/src/App.tsx` la ruta protegida `/mis-reservas` y el enlace "Mis Reservas" en la navegación (solo con sesión)

**Checkpoint**: Las tres historias funcionan de forma independiente; pasos 14–17 del quickstart OK.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificaciones transversales de la constitución y criterios de éxito.

- [X] T050 [P] Escribir `frontend/tests/api.test.ts` (mock de `fetch`): un 409 con cuerpo `{ error }` produce `ApiError` con ese `code`/`message`; un error de red o un 500 sin cuerpo produce el mensaje genérico de `INTERNAL_ERROR`; un 401 dispara el evento `auth:expired`
- [X] T051 [P] Añadir a `backend/tests/courts.test.ts` una prueba de rendimiento básica (SC-005): con 5 canchas × 14 días × 20 reservas insertadas, `GET /availability` responde en < 200 ms
- [X] T052 Revisar todos los mensajes visibles (`backend/src/errors.ts`, `frontend/src/**/*.tsx`) y comprobar que están en español, sin detalles técnicos y que coinciden literalmente con spec.md (SC-008, FR-026); confirmar que ninguna respuesta de la API incluye `password_hash`, `token_hash`, nombres de tablas ni *stack traces*
- [X] T053 Ejecutar `npm run typecheck`, `npm test` y `npm run build` en `backend/` y `frontend/`; corregir cualquier fallo
- [X] T054 Ejecutar la validación manual completa y los `curl` de [quickstart.md](./quickstart.md) y marcar cada paso; si algún resultado contradice spec.md, detenerse y reportar (Principio VI)

---

## Phase 7: Revisión post-implementación (Cross-Cutting)

**Purpose**: Trazar a spec.md los cambios surgidos de las dos pasadas de `/code-review` (constitución, "Flujo SDD").

- [X] T055 Añadir a `backend/src/rules.ts` la función pura `consecutiveRunLength(sameCourt, candidate): number`, que cuenta la racha de bloques consecutivos del usuario en la misma cancha (incluidas reservas finalizadas) comparando instantes con `slotStart`, de modo que cruza la medianoche; pruebas en `backend/tests/rules.test.ts` (FR-019, caso borde "Encadenar horas")
- [X] T056 En `makeCreateReservation` (`backend/src/reservations.ts`), tras `checkActiveRule`, rechazar con 409 `MAX_CONSECUTIVE_REACHED` si `consecutiveRunLength > 2`, cargando las reservas del usuario desde ayer (Medellín); pruebas en `backend/tests/reservations.test.ts` ("no permite encadenar una tercera hora…" y "sí permite reservar después…") (FR-019)
- [X] T057 En `readSidCookie` (`backend/src/auth.ts`), tratar como ausente una cookie `sid` con codificación inválida para responder 401 en vez de 500; prueba en `backend/tests/auth.test.ts` (FR-027, Principio V)
- [X] T058 En `backend/src/auth.ts`: `scrypt` asíncrono; hash ficticio calculado una vez por proceso al cargar el módulo; el registro comprueba el correo antes de calcular el hash. Pruebas en `backend/tests/authCost.test.ts` (FR-005, FR-006, SC-005)
- [X] T059 Crear `requireAuth` una sola vez en `createApp` (`backend/src/app.ts`) y pasarlo a `authRouter`, `courtsRouter` y `reservationsRouter` (Principios III y IV)
- [X] T060 En `frontend/src/pages/CourtAvailabilityPage.tsx`: ignorar respuestas obsoletas al cambiar de fecha, vaciar la grilla al cambiar de fecha o si la carga falla, y calcular la ventana del calendario en el navegador (`clientBookingWindow` en `frontend/src/api.ts`) hasta recibir la del servidor. Pruebas en `frontend/tests/CourtAvailabilityPage.test.tsx` (FR-010, FR-016, caso borde "Grilla desactualizada")
- [X] T061 En `frontend/src/pages/MyReservationsPage.tsx`, si la cancelación responde 401, no actualizar el estado ni recargar la lista (la redirección la hace `auth:expired`) (FR-007)

**Checkpoint**: 61 pruebas en backend y 16 en frontend en verde; `/code-review` sin hallazgos de corrección pendientes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; BLOQUEA todas las historias.
- **US1 (Phase 3)** y **US2 (Phase 4)**: dependen solo de Foundational. Ambas son P1; US1 primero (MVP).
- **US3 (Phase 5)**: depende de Foundational; su backend se prueba de forma independiente (reservas insertadas con helpers).
- **Polish (Phase 6)**: depende de las historias que se quieran entregar.
- **Revisión post-implementación (Phase 7)**: depende de la Phase 6; recoge las correcciones de `/code-review`.

### User Story Dependencies

- **US1**: independiente.
- **US2**: backend independiente (las pruebas crean sesiones con `createUserWithSession`); la UI usa `RequireAuth`/`useAuth` de US1 (T022, T025) para navegar con sesión.
- **US3**: backend independiente; comparte `backend/src/reservations.ts` con US2 (T044/T045 después de T034) y la UI usa `RequireAuth` de US1.

### Within Each User Story

- Tests primero y deben FALLAR antes de implementar.
- `rules.ts`/funciones puras → routers → montaje en `app.ts` → `api.ts` → componentes → páginas → rutas en `App.tsx`.
- Tareas que tocan el mismo archivo (`app.ts`, `App.tsx`, `api.ts`, `auth.ts`, `rules.ts`, `reservations.ts`) son secuenciales.

### Parallel Opportunities

- Setup: T003, T004, T005 en paralelo tras T001/T002.
- Foundational: T007, T009, T010, T014, T015, T016 en paralelo (archivos distintos); T008 tras T006; T011 tras T010; T012 tras T008, T010 y T011; T013 tras T012.
- US1: T018 en paralelo con T022, T023, T024.
- US2: T026–T031 en paralelo; T037 y T038 en paralelo entre sí y con el backend (T032–T035).
- US3: T042 y T043 en paralelo; T047 en paralelo con T044–T046.
- Con dos personas: tras Phase 2, una toma US1 y otra el backend de US2.

---

## Parallel Example: User Story 2

```bash
# Todas las pruebas de US2 a la vez:
Task: "Escribir backend/tests/rules.test.ts (checkActiveRule)"
Task: "Escribir backend/tests/courts.test.ts"
Task: "Escribir backend/tests/reservations.test.ts"
Task: "Escribir backend/tests/concurrency.test.ts"
Task: "Escribir frontend/tests/SlotGrid.test.tsx"
Task: "Escribir frontend/tests/DatePicker.test.tsx"

# Componentes de UI en paralelo con el backend:
Task: "Crear frontend/src/components/DatePicker.tsx"
Task: "Crear frontend/src/components/SlotGrid.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup → Phase 2: Foundational.
2. Phase 3: US1 (registro, login, logout, sesión de 7 días).
3. **STOP and VALIDATE**: `auth.test.ts` en verde + pasos 3–6 del quickstart.

> El valor de negocio completo (reservar) llega con US2; MVP funcional recomendado para demo = **US1 + US2**.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. + US1 → validar → demo (cuentas y sesión).
3. + US2 → validar (incluida la prueba de concurrencia SC-003) → demo (reservas).
4. + US3 → validar → demo (Mis Reservas y cancelación).
5. Phase 6 → verificación final de constitución y criterios de éxito.

---

## Notes

- [P] = archivos distintos y sin dependencias pendientes.
- Cada tarea es trazable a spec.md (FR/US/SC) según la constitución.
- Commit tras cada tarea o grupo lógico.
- Si una tarea exige algo no documentado en spec.md o contradice la constitución: detenerse, advertir y pedir actualizar spec.md antes de escribir código.
