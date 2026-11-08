# Implementation Plan: Sistema de Reservas de Canchas de Pádel

**Branch**: `plan` (planificación); implementación en `implementacion` y revisiones en `revision` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-padel-court-booking/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Aplicación web para reservar bloques de 1 hora en 5 canchas fijas de pádel de Medellín.
Incluye registro/inicio de sesión con correo y contraseña (sesión de 7 días), lista pública
de canchas, grilla de disponibilidad de 24 bloques por cancha y fecha (ventana de 14 días),
creación de reservas sin doble reserva —verificación + inserción en una transacción
`IMMEDIATE` de SQLite respaldada por `UNIQUE (court_id, date, start_hour)`—, regla de
1 reserva activa con excepción de un bloque contiguo en la misma cancha, y panel
"Mis Reservas" con Próximas/Historial y cancelación hasta la hora de inicio.

Enfoque técnico: SPA React + Tailwind (Vite) que consume una API REST JSON en Express +
`better-sqlite3` con SQL puro; sesiones en cookie HttpOnly respaldadas por tabla SQLite;
toda la lógica temporal en funciones puras con reloj inyectable (UTC−5 fijo).

## Technical Context

**Language/Version**: TypeScript 5.x en frontend y backend; Node.js ≥ 20.6 (LTS)

**Primary Dependencies**:
- Backend: `express` 4.x, `better-sqlite3` (SQL puro). Hash con `crypto.scrypt` nativo; cookies parseadas a mano (solo `sid`).
- Frontend: `react` 18, `react-dom`, `react-router-dom` 6, `tailwindcss`; build con `vite` + `@vitejs/plugin-react`.
- Dev: `tsx` (ejecutar TS en dev), `vitest`, `supertest`, `@testing-library/react`, `jsdom`, `@types/*`.

**Storage**: SQLite en `/db/padel.db` (WAL, `foreign_keys=ON`, `busy_timeout=5000`); esquema `/db/schema.sql`, semilla `/db/seed.sql`

**Testing**: Vitest + Supertest (backend: unitarias, integración, concurrencia); Vitest + React Testing Library + jsdom (frontend)

**Target Platform**: Navegadores web modernos (escritorio y móvil); servidor Node.js local (Windows/Linux)

**Project Type**: Aplicación web (SPA frontend + API REST backend)

**Performance Goals**: grilla de disponibilidad < 2 s en el p95 (SC-005; objetivo interno de API < 200 ms con la ventana llena de reservas, verificado en T051); reserva completa en ≤ 5 interacciones tras iniciar sesión (SC-002)

**Constraints**: 0 dobles reservas ante ≥ 10 confirmaciones simultáneas (SC-003); todo mensaje al usuario en español y sin detalles técnicos (SC-008); horas en formato 24 h; zona horaria America/Bogota (UTC−5 fijo)

**Scale/Scope**: 1 club, 5 canchas, ventana de 14 días (≤ 1 680 bloques reservables), decenas a cientos de usuarios; 5 vistas de UI y 9 endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / Sección | Verificación | Pre‑Fase 0 | Post‑Fase 1 |
|---|---|---|---|
| **I. Catálogo Cerrado** | 5 canchas sembradas con `INSERT OR IGNORE` en `seed.sql`; solo existe `GET /api/courts` (sin POST/PUT/DELETE); horas `HH:mm` 24 h; duración (1 h) y horario (00–24) tomados de spec.md | ✅ | ✅ ([data-model §3](./data-model.md#3-courts--cancha-catálogo-inmutable), [contracts](./contracts/api.md)) |
| **II. Doble Reserva (NO NEGOCIABLE)** | Verificación de solape `[inicio, fin)` + regla activa + INSERT dentro de `db.transaction(...).immediate()`; `UNIQUE (court_id, date, start_hour)` como red de seguridad; colisión → **409** `SLOT_TAKEN`; prueba de ≥ 10 peticiones simultáneas | ✅ | ✅ ([research R3](./research.md#r3-prevención-de-doble-reserva-bajo-concurrencia-fr-016-fr-017-sc-003-principio-ii)) |
| **III. Autenticación Obligatoria** | Middleware `requireAuth` en backend para disponibilidad, crear, listar y cancelar; sin sesión → **401**; `RequireAuth` del frontend es solo conveniencia | ✅ | ✅ (🔒 en [contracts](./contracts/api.md)) |
| **IV. Simplicidad y Estructura Plana** | Solo `/frontend`, `/backend`, `/db`; rutas Express que llaman SQL directo; sin repositorios/servicios/DI; funciones puras (`time.ts`, `rules.ts`) y componentes funcionales con Hooks; sin clases | ✅ | ✅ (ver Project Structure) |
| **V. Errores Amigables y HTTP Semántico** | 400/401/404/409/500 con cuerpo `{error:{code,message}}` en español; *error handler* final sin filtrar detalles; frontend nunca muestra errores crudos | ✅ | ✅ ([catálogo de errores](./contracts/api.md#catálogo-de-errores)) |
| **VI. Cero Código Sombra** | Nada fuera de spec: sin pagos, admin, notificaciones, recuperación de contraseña, perfiles ni *rate limiting*; la grilla no marca "mis" bloques (no pedido) | ✅ | ✅ |
| **Stack Tecnológico** | TS + React/Hooks + Tailwind + Express + `better-sqlite3` con SQL puro, sin ORM; dependencias adicionales justificadas abajo | ✅ | ✅ |
| **Estilo de código** | `camelCase` funciones/variables, `PascalCase` tipos/interfaces/componentes; columnas SQL en `snake_case` mapeadas a `camelCase` en la respuesta | ✅ | ✅ |

**Resultado**: GATE superado antes y después del diseño. Sin violaciones → *Complexity Tracking* vacío.

### Justificación de dependencias adicionales (exigido por la constitución)

| Dependencia | Por qué es necesaria | Alternativa descartada |
|---|---|---|
| `react-router-dom` | 5 vistas con rutas protegidas, enlaces y botón "atrás" | Navegación por estado manual: frágil y más código |
| `vite` + `@vitejs/plugin-react` | Servidor de desarrollo, build de TS/JSX y proxy `/api` (cookie same-origin) | CRA (obsoleto); webpack manual (más configuración) |
| `tsx` | Ejecutar el backend TS en desarrollo sin paso de build | `ts-node` (más lento y configuración ESM más compleja) |
| `vitest`, `supertest`, `@testing-library/react`, `jsdom` | Pruebas requeridas por SC-003/SC-004 y escenarios de aceptación | Jest (requiere transformador TS adicional) |
| `@types/*` | Tipado de Express, better-sqlite3, supertest, Node | — |

Sin dependencias para hash (`crypto.scrypt`), cookies (parseo manual de `sid`), fechas (offset fijo UTC−5) ni calendario (`<input type="date">`). Ver [research.md](./research.md).

## Project Structure

### Documentation (this feature)

```text
specs/001-padel-court-booking/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas (R1–R8)
├── data-model.md        # Fase 1: esquema SQLite, estados derivados, orden de validaciones
├── quickstart.md        # Fase 1: puesta en marcha y validación de punta a punta
├── contracts/
│   └── api.md           # Fase 1: contrato REST + catálogo de errores
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea /speckit-plan)
```

### Source Code (repository root)

```text
db/
├── schema.sql           # CREATE TABLE users, sessions, courts, reservations (+ índices, UNIQUE)
├── seed.sql             # 5 canchas fijas (INSERT OR IGNORE)
└── padel.db             # generado en runtime (en .gitignore)

backend/
├── package.json
├── tsconfig.json
├── tsconfig.build.json  # compila solo src/ → dist/
├── vitest.config.ts
├── src/
│   ├── index.ts         # arranque: abre DB y escucha en :3000
│   ├── app.ts           # crea la app Express (rutas + error handler); exportada para tests
│   ├── db.ts            # openDb(path, { init }): PRAGMAs y, si init, aplica schema.sql + seed.sql
│   ├── time.ts          # funciones puras: hoy Medellín, instante de bloque, ventana, etiquetas HH:mm
│   ├── rules.ts         # funciones puras: regla de reserva activa (FR-019), validaciones de entrada
│   ├── errors.ts        # catálogo code → {status, message}, appError y sendError
│   ├── auth.ts          # rutas /api/auth/* + middleware requireAuth + hash scrypt
│   ├── courts.ts        # rutas GET /api/courts y /availability
│   └── reservations.ts  # rutas POST/GET/DELETE /api/reservations + makeCreateReservation (transacción IMMEDIATE)
└── tests/
    ├── helpers.ts               # makeTestApp, createUserWithSession, insertReservation
    ├── time.test.ts
    ├── rules.test.ts
    ├── auth.test.ts
    ├── authCost.test.ts         # costo de hash en registro/login (T058)
    ├── security.test.ts         # límite de login, cookie Secure, cabeceras, higiene de sesiones (T062–T066)
    ├── courts.test.ts
    ├── reservations.test.ts
    ├── myReservations.test.ts
    ├── concurrency.test.ts
    └── concurrencyWorker.ts     # hilo de worker_threads para la prueba multiconexión (SC-003)

frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts       # proxy /api → http://localhost:3000 + config de Vitest (jsdom)
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── src/
│   ├── index.css        # directivas de Tailwind
│   ├── main.tsx
│   ├── App.tsx          # rutas + RequireAuth
│   ├── api.ts           # fetch con credentials, tipos de respuesta, traducción de errores
│   ├── useAuth.tsx      # contexto de sesión (GET /api/auth/me, login, logout)
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── CourtsPage.tsx
│   │   ├── CourtAvailabilityPage.tsx
│   │   └── MyReservationsPage.tsx
│   └── components/
│       ├── SlotGrid.tsx
│       ├── DatePicker.tsx
│       ├── ConfirmDialog.tsx
│       └── ErrorMessage.tsx
└── tests/
    ├── SlotGrid.test.tsx
    ├── DatePicker.test.tsx
    ├── ConfirmDialog.test.tsx
    ├── CourtAvailabilityPage.test.tsx   # respuestas obsoletas y cargas fallidas (T060)
    └── api.test.ts
```

**Structure Decision**: Aplicación web en las tres carpetas planas que exige el Principio IV
(`/frontend`, `/backend`, `/db`). El backend organiza el código por recurso (`auth`, `courts`,
`reservations`) con SQL directo en las rutas y lógica de negocio en funciones puras (`time.ts`,
`rules.ts`); no hay capas de repositorio ni servicios. `app.ts` se separa de `index.ts` solo
para poder probar la app con Supertest sobre una base temporal (ruta de DB por variable
`DB_PATH`).

## Decisiones clave de diseño

- **Anti doble reserva**: transacción `IMMEDIATE` + `UNIQUE`, encapsulada en `makeCreateReservation` (reutilizada por la ruta y por la prueba multiconexión); orden de validaciones en [data-model.md](./data-model.md#reglas-de-validación-al-crear-una-reserva-en-orden-dentro-de-una-transacción-immediate).
- **Tiempo**: `now` se obtiene una vez por petición y se pasa a funciones puras; tests usan reloj fijo.
- **Privacidad**: la grilla solo expone `status`/`selectable`; acceso a reserva ajena → 404.
- **Sesión**: token aleatorio en cookie HttpOnly/SameSite=Lax, hash SHA-256 en BD, expiración absoluta de 7 días.
- **Errores**: el backend envía el mensaje final en español; el frontend lo muestra tal cual o usa el genérico.

## Complexity Tracking

> Sin violaciones de la constitución; no se requiere justificación.
