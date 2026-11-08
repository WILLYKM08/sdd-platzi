# Research: Sistema de Reservas de Canchas de Pádel

**Fase 0** · Fecha: 2026-11-07 · Spec: [spec.md](./spec.md)

El stack está fijado por la constitución (TypeScript, React + Tailwind, Node.js + Express,
SQLite con `better-sqlite3`). Esta investigación resuelve las decisiones técnicas que
la constitución y la spec dejan abiertas. No quedan ítems "NEEDS CLARIFICATION".

---

## R1. Gestión de sesión (FR-004, FR-007, Principio III)

- **Decision**: Sesiones del lado del servidor en una tabla `sessions` de SQLite. Al iniciar
  sesión se genera un token aleatorio (`crypto.randomBytes(32)`, base64url), se guarda **solo
  su hash SHA-256** en la tabla con `expires_at = ahora + 7 días`, y el token viaja en una
  cookie `sid` con `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` (y `Secure` en
  producción). Cerrar sesión borra la fila. Un middleware `requireAuth` valida la cookie en
  cada petición protegida y responde **401** si falta, no existe o expiró.
- **Rationale**: Permite revocación real al cerrar sesión (FR-004), expiración absoluta de
  7 días verificable en el backend, cero estado en el cliente y reutiliza la misma base de
  datos. Guardar el hash evita que una filtración de `padel.db` permita secuestrar sesiones.
- **Alternatives considered**:
  - *JWT*: no se puede revocar al cerrar sesión sin una lista negra (que vuelve a ser una
    tabla); más complejo sin beneficio.
  - *`express-session`*: requiere un *store* adicional para SQLite; dependencia innecesaria.
  - *Token en `localStorage`*: expuesto a XSS; la cookie `HttpOnly` es más segura.

## R2. Hash de contraseñas (FR-006)

- **Decision**: `crypto.scrypt` nativo de Node (N=16384, r=8, p=1, keylen 64) con *salt*
  aleatorio de 16 bytes por usuario; se almacena `scrypt$<salt>$<hash>` y se compara con
  `crypto.timingSafeEqual`.
- **Rationale**: Algoritmo resistente a fuerza bruta incluido en Node; **cero dependencias**
  (constitución: toda dependencia debe justificarse).
- **Alternatives considered**: `bcrypt` (módulo nativo, problemas de compilación en Windows),
  `argon2` (también nativo). Ambos aportan poco frente a `scrypt` para este alcance.
- **Login sin enumeración (FR-005)**: si el correo no existe se ejecuta igualmente un
  `scrypt` contra un hash ficticio, para que el tiempo de respuesta no revele si existe.

## R3. Prevención de doble reserva bajo concurrencia (FR-016, FR-017, SC-003, Principio II)

- **Decision**: Dos capas:
  1. **Transacción `IMMEDIATE`** de `better-sqlite3` (`db.transaction(fn).immediate(...)`)
     que dentro de una sola transacción: (a) busca una reserva que se solape con
     `[inicio, fin)` en la misma cancha, (b) aplica la regla de reserva activa (FR-019) y
     (c) inserta. `BEGIN IMMEDIATE` toma el bloqueo de escritura al inicio, así ninguna otra
     conexión puede intercalar una escritura entre la verificación y la inserción.
  2. **Restricción `UNIQUE (court_id, date, start_hour)`** en la tabla `reservations` como
     red de seguridad: si por cualquier camino se intentara un duplicado, SQLite lo rechaza
     (`SQLITE_CONSTRAINT_UNIQUE`) y se traduce a **409**.
- **Rationale**: Cumple literalmente el Principio II (verificación + inserción en la misma
  transacción SQLite) y además lo garantiza a nivel de esquema. Como todos los bloques son de
  1 hora exacta en hora en punto, "intervalos `[inicio, fin)` solapados" equivale a
  "misma cancha + misma fecha + misma hora de inicio", por lo que la restricción `UNIQUE`
  es exacta.
- **Configuración**: `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`,
  `PRAGMA busy_timeout = 5000` (por si se abre más de una conexión, p. ej. en pruebas).
- **Encapsulado**: la verificación + regla activa + inserción viven en una única función
  `createReservationTx(db, userId, slot, now)` exportada desde `backend/src/reservations.ts`.
  La ruta `POST /api/reservations` la llama, y la prueba de concurrencia la ejecuta desde
  varios `worker_threads` con conexiones independientes (`openDb(path, { init: false })`)
  para verificar el bloqueo real entre conexiones (SC-003), no solo peticiones serializadas
  en un único proceso.
- **Alternatives considered**: bloqueos en memoria (mutex) en Node — no protege frente a
  varios procesos; *optimistic locking* con columna de versión — innecesario con `UNIQUE`.

## R4. Zona horaria y cálculo de "ahora" (Supuestos, FR-012, FR-018, FR-025)

- **Decision**: Toda la lógica temporal vive en un módulo puro `backend/src/time.ts`.
  Medellín es UTC−5 fijo, sin horario de verano: un bloque `(date, startHour)` empieza en el
  instante UTC `Date.UTC(y, m-1, d, startHour + 5)` y termina 1 h después. "Hoy" en Medellín
  se obtiene con `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })`.
  Las funciones reciben `now: Date` como parámetro (inyectado desde la ruta) para poder
  probarlas de forma determinista.
- **Rationale**: Independiente de la zona horaria del servidor; funciones puras (Principio IV)
  y fácilmente testeables (bloque en curso, medianoche, día 14).
- **Almacenamiento**: `date TEXT 'YYYY-MM-DD'` + `start_hour INTEGER 0..23` (hora local de
  Medellín). El bloque 23:00–24:00 pertenece a la fecha en que inicia (Edge Case "Cambio de día").
- **Alternatives considered**: librerías de fechas (`date-fns-tz`, `luxon`) — dependencias
  innecesarias para un offset fijo; guardar epoch UTC — dificulta la consulta por fecha local
  y el índice único.

## R5. Regla de reserva activa con excepción contigua (FR-019)

- **Decision**: Función pura `checkActiveRule(activeReservations, newBlock)`; "activa" =
  `fin > ahora` (incluye la en curso, según Supuestos):
  - 0 activas → permitido.
  - 1 activa → permitido **solo si** es la misma cancha y el nuevo bloque empieza
    exactamente 1 h antes o 1 h después (comparando instantes absolutos, por lo que
    23:00 de un día y 00:00 del siguiente son contiguos). Si no →
    409 `ACTIVE_RESERVATION_EXISTS`.
  - 2 activas → 409 `MAX_CONSECUTIVE_REACHED`.
  - Además, `consecutiveRunLength(sameCourt, candidate)` cuenta la racha de bloques
    consecutivos del usuario en esa cancha (incluidas reservas finalizadas) que formaría
    el nuevo bloque; si supera 2 → 409 `MAX_CONSECUTIVE_REACHED`. Evita encadenar
    10:00, 11:00 y 12:00 una vez finalizada la de 10:00.
- **Orden de validaciones en `POST /api/reservations`**: autenticación (401) → formato (400)
  → hora pasada / fuera de ventana (400) → colisión de cancha (409 `SLOT_TAKEN`) → regla de
  reserva activa (409). La colisión se evalúa antes que la regla porque la spec exige el
  mensaje de colisión estándar cuando el bloque contiguo ya está ocupado.
- **Rationale**: Regla aislada en una función pura → pruebas unitarias exhaustivas.

## R6. Códigos HTTP y mensajes (FR-026, Principio V)

- **Decision**: Cuerpo de error uniforme `{ "error": { "code": "SLOT_TAKEN", "message": "La cancha ya fue reservada en este horario" } }`.
  El backend envía el mensaje en español ya listo para mostrar; el frontend lo muestra tal
  cual y, ante errores de red o códigos inesperados, muestra un mensaje genérico. Un
  *error handler* final de Express captura todo lo no previsto, lo registra en consola del
  servidor y responde 500 con mensaje genérico, sin detalles internos.
- **Mapeo**: 400 validación/reglas de tiempo, 401 sin sesión, 404 recurso inexistente o
  ajeno (FR-008: no revelar existencia), 409 colisión y regla de reserva activa, 500
  inesperado. La cancelación de una reserva ya iniciada responde 409
  `RESERVATION_STARTED` (conflicto con el estado actual de la reserva).
- **Catálogo completo**: ver [contracts/api.md](./contracts/api.md#catálogo-de-errores).

## R7. Frontend: navegación, calendario y grilla

- **Decision**:
  - **Vite** como herramienta de build/dev de React + TypeScript (con proxy `/api` →
    `http://localhost:3000` para que la cookie sea *same-origin*).
  - **React Router** (`react-router-dom`) para 5 vistas: `/login`, `/registro`, `/canchas`,
    `/canchas/:courtId`, `/mis-reservas`, con un componente `RequireAuth`.
  - **Calendario**: `<input type="date">` nativo con `min` = hoy y `max` = hoy + 13 días
    (Medellín) → las fechas fuera de ventana quedan deshabilitadas sin dependencias extra.
  - **Grilla**: componente propio con 24 botones; el estado y si es seleccionable vienen del
    backend (`status`, `selectable`), así la UI no depende del reloj del cliente.
  - **Confirmación de cancelación**: modal propio (no `window.confirm`) para mantener los
    textos en español y el estilo Tailwind.
  - Cliente HTTP: `fetch` con `credentials: 'include'` en un único módulo `api.ts`.
- **Rationale**: Mínimo de dependencias; cada una justificada en `plan.md`.
- **Alternatives considered**: librerías de calendario (`react-datepicker`) — innecesarias;
  navegación por estado sin router — se vuelve frágil con rutas protegidas y botón "atrás".

## R8. Estrategia de pruebas (SC-003, SC-004)

- **Decision**:
  - **Backend**: Vitest + Supertest contra la app Express con una base SQLite temporal por
    archivo de prueba. Pruebas unitarias de `time.ts` y de la regla FR-019; pruebas de
    integración de todos los endpoints; prueba de concurrencia que dispara ≥ 10
    `POST /api/reservations` simultáneos (usuarios distintos, mismo bloque) y verifica
    exactamente 1 × 201 y el resto 409.
  - **Frontend**: Vitest + React Testing Library + jsdom para grilla, calendario, modal de
    cancelación y traducción de errores.
- **Rationale**: Un único runner (Vitest) en todo el stack, compatible con TypeScript sin
  configuración extra.
- **Alternatives considered**: Jest (requiere `ts-jest`/Babel), Playwright E2E (útil pero
  fuera del mínimo; la validación manual de punta a punta se cubre en `quickstart.md`).
