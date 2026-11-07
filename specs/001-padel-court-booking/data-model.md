# Data Model: Sistema de Reservas de Canchas de Pádel

**Fase 1** · Fecha: 2026-11-07 · Spec: [spec.md](./spec.md) · Research: [research.md](./research.md)

Base de datos: SQLite en `/db/padel.db`. Esquema en `/db/schema.sql`, semilla en `/db/seed.sql`.
Todas las fechas/horas de negocio están en hora local de Medellín (UTC−5 fijo).
Las marcas técnicas (`created_at`, `expires_at`) se guardan en ISO-8601 UTC.

## Diagrama

```text
users 1 ──── * reservations * ──── 1 courts
  1
  │
  * sessions
```

---

## 1. `users` — Usuario

| Columna         | Tipo    | Restricciones                                   | Notas |
|-----------------|---------|-------------------------------------------------|-------|
| `id`            | INTEGER | PRIMARY KEY AUTOINCREMENT                       | |
| `email`         | TEXT    | NOT NULL, UNIQUE COLLATE NOCASE                 | Se guarda normalizado (`trim().toLowerCase()`). FR-002 |
| `password_hash` | TEXT    | NOT NULL                                        | `scrypt$<salt>$<hash>`. Nunca se expone. FR-006 |
| `created_at`    | TEXT    | NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) | Fecha de registro |

**Validación (en el backend, antes de insertar)**:
- `email`: obligatorio, ≤ 254 caracteres, formato `algo@dominio.tld` (regex simple). → 400 `INVALID_EMAIL`
- `password`: obligatoria, ≥ 8 caracteres (≤ 128 para acotar el costo de hash). → 400 `PASSWORD_TOO_SHORT`
- Correo ya existente (sin distinguir mayúsculas). → 409 `EMAIL_TAKEN` "Este correo ya está registrado"

## 2. `sessions` — Sesión

| Columna       | Tipo    | Restricciones                                   | Notas |
|---------------|---------|-------------------------------------------------|-------|
| `token_hash`  | TEXT    | PRIMARY KEY                                     | SHA-256 (hex) del token de la cookie `sid` |
| `user_id`     | INTEGER | NOT NULL REFERENCES users(id) ON DELETE CASCADE | |
| `created_at`  | TEXT    | NOT NULL                                        | ISO UTC |
| `expires_at`  | TEXT    | NOT NULL                                        | `created_at + 7 días` (absoluto, sin renovación). FR-004 |

Índice: `idx_sessions_user (user_id)`.

**Ciclo de vida**: `login`/`register` → INSERT · petición con `expires_at <= now` → se borra la fila y se responde 401 · `logout` → DELETE.

## 3. `courts` — Cancha (catálogo inmutable)

| Columna | Tipo    | Restricciones          |
|---------|---------|------------------------|
| `id`    | INTEGER | PRIMARY KEY            |
| `name`  | TEXT    | NOT NULL UNIQUE        |

**Semilla** (`/db/seed.sql`, `INSERT OR IGNORE`, idempotente):

| id | name |
|----|------|
| 1 | Cancha Laureles |
| 2 | Cancha El Poblado |
| 3 | Cancha Belén |
| 4 | Cancha Robledo |
| 5 | Cancha Envigado |

No existe ningún INSERT/UPDATE/DELETE sobre `courts` en el código de la aplicación (Principio I, FR-009).

## 4. `reservations` — Reserva

| Columna      | Tipo    | Restricciones                                         | Notas |
|--------------|---------|-------------------------------------------------------|-------|
| `id`         | INTEGER | PRIMARY KEY AUTOINCREMENT                             | |
| `user_id`    | INTEGER | NOT NULL REFERENCES users(id) ON DELETE CASCADE       | |
| `court_id`   | INTEGER | NOT NULL REFERENCES courts(id)                        | |
| `date`       | TEXT    | NOT NULL, `CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')` | Fecha local de inicio |
| `start_hour` | INTEGER | NOT NULL, `CHECK (start_hour BETWEEN 0 AND 23)`       | Hora en punto. Fin = `start_hour + 1` (FR-015) |
| `created_at` | TEXT    | NOT NULL DEFAULT (strftime(...,'now'))                | |

**Restricciones e índices**:
- `UNIQUE (court_id, date, start_hour)` — **anti doble reserva a nivel de esquema** (FR-017, Principio II).
- `idx_reservations_user (user_id, date, start_hour)` — "Mis Reservas" y regla de reserva activa.
- La consulta de grilla usa el índice único (`court_id, date`).

No se almacena la hora de fin: se deriva (`start_hour + 1`), lo que hace imposible guardar
bloques parciales o de varias horas.

**Cancelación**: DELETE físico de la fila (Supuestos: las canceladas no aparecen en el historial).

## 5. Bloque horario (derivado, no almacenado)

Calculado por `GET /api/courts/:courtId/availability?date=` para `startHour = 0..23`:

| Campo        | Derivación |
|--------------|------------|
| `startHour`  | 0..23 |
| `label`      | `HH:00–HH+1:00` (el último es `23:00–24:00`) |
| `status`     | `"reserved"` si existe fila en `reservations` para (cancha, fecha, hora); si no `"available"` |
| `selectable` | `status = "available"` **y** inicio del bloque > ahora **y** fecha dentro de la ventana |

Nunca incluye `user_id` ni datos del titular (FR-013).

## Estados derivados de una reserva (por tiempo, sin columna de estado)

Sea `inicio = instante(date, start_hour)` y `fin = inicio + 1 h`, `ahora` en Medellín.

```text
            inicio                fin
──────────────┼────────────────────┼──────────────▶ tiempo
  PRÓXIMA     │     EN CURSO       │  FINALIZADA
 (cancelable) │ (no cancelable)    │
 activa ✔     │ activa ✔           │ activa ✘
 lista:Próximas│ lista: Historial  │ lista: Historial
```

| Estado      | Condición               | Lista "Mis Reservas" | Cuenta como activa (FR-019) | Cancelable (FR-025) |
|-------------|-------------------------|----------------------|-----------------------------|---------------------|
| Próxima     | `ahora < inicio`        | Próximas             | Sí                          | Sí                  |
| En curso    | `inicio ≤ ahora < fin`  | Historial            | Sí                          | No (409 `RESERVATION_STARTED`) |
| Finalizada  | `fin ≤ ahora`           | Historial            | No                          | No                  |
| Cancelada   | fila eliminada          | —                    | No                          | —                   |

## Reglas de validación al crear una reserva (en orden, dentro de una transacción `IMMEDIATE`)

1. Sesión válida → si no, 401 `UNAUTHENTICATED`.
2. `courtId` ∈ {1..5} → si no, 404 `COURT_NOT_FOUND`; `date` con formato válido y existente,
   `startHour` entero 0..23 → si no, 400 `INVALID_SLOT`.
3. `inicio > ahora` → si no, 400 `SLOT_IN_PAST` (FR-018).
4. `hoy ≤ date ≤ hoy + 13` → si no, 400 `OUTSIDE_BOOKING_WINDOW` (FR-010, FR-018).
5. No existe reserva para (cancha, fecha, hora) → si no, 409 `SLOT_TAKEN` (FR-016/017).
6. Regla de reserva activa (FR-019), con `activas = reservas del usuario con fin > ahora`:
   - 0 → OK.
   - 1 → OK solo si misma cancha y `|inicio_nuevo − inicio_existente| = 1 h` (cruza medianoche);
     si no, 409 `ACTIVE_RESERVATION_EXISTS`.
   - ≥ 2 → 409 `MAX_CONSECUTIVE_REACHED`.
7. INSERT. Si aun así salta `SQLITE_CONSTRAINT_UNIQUE` → 409 `SLOT_TAKEN`.
