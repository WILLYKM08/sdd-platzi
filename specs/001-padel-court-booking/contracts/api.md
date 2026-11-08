# API Contract: Sistema de Reservas de Canchas de Pádel

**Fase 1** · Base URL: `/api` · Formato: JSON (`Content-Type: application/json`)
Autenticación: cookie `sid` (HttpOnly, SameSite=Lax, 7 días). Ver [research.md R1](../research.md#r1-gestión-de-sesión-fr-004-fr-007-principio-iii).

**Convenciones**
- Fechas `YYYY-MM-DD`, horas `HH:mm` en formato 24 h, todo en hora de Medellín (UTC−5).
- Todo error usa el cuerpo:
  ```json
  { "error": { "code": "SLOT_TAKEN", "message": "La cancha ya fue reservada en este horario" } }
  ```
  `message` está en español y es apto para mostrarse directamente (FR-026). Nunca contiene detalles técnicos.
- 🔒 = requiere sesión; sin sesión válida (ausente, inexistente o expirada) → **401 `UNAUTHENTICATED`**.
- Peticiones con cuerpo JSON mal formado → 400 `INVALID_REQUEST`.

---

## Autenticación

### `POST /api/auth/register`
Crea la cuenta e inicia sesión (FR-001..003, Escenario US1-1).

Request
```json
{ "email": "ana@example.com", "password": "secreta123" }
```
| Respuesta | Cuándo |
|-----------|--------|
| **201** `{ "user": { "id": 1, "email": "ana@example.com" } }` + `Set-Cookie: sid=…` | Éxito |
| 400 `INVALID_EMAIL` | Correo vacío o con formato inválido |
| 400 `PASSWORD_TOO_SHORT` | Contraseña < 8 caracteres |
| 400 `PASSWORD_TOO_LONG` | Contraseña > 128 caracteres |
| 409 `EMAIL_TAKEN` | Correo ya registrado (sin distinguir mayúsculas) |

### `POST /api/auth/login`
Request: igual que `register`.

| Respuesta | Cuándo |
|-----------|--------|
| **200** `{ "user": { "id": 1, "email": "ana@example.com" } }` + `Set-Cookie: sid=…` | Credenciales válidas |
| 401 `INVALID_CREDENTIALS` | Correo inexistente **o** contraseña incorrecta (mismo mensaje, FR-005) |
| 429 `TOO_MANY_ATTEMPTS` | Más de 10 intentos fallidos con ese correo, o más de 50 desde la misma dirección de origen, en 15 minutos (FR-028). Se rechaza antes de verificar la contraseña. |
| 400 `INVALID_REQUEST` | Faltan campos |

### `POST /api/auth/logout` 🔒
| Respuesta | Cuándo |
|-----------|--------|
| **204** + `Set-Cookie: sid=; Max-Age=0` | Sesión eliminada |

### `GET /api/auth/me` 🔒
Permite al frontend saber si hay sesión al cargar.
| Respuesta | Cuándo |
|-----------|--------|
| **200** `{ "user": { "id": 1, "email": "ana@example.com" } }` | Sesión válida |
| 401 `UNAUTHENTICATED` | Sin sesión |

---

## Canchas y disponibilidad

### `GET /api/courts` (público)
Lista de las 5 canchas; visible sin sesión (FR-009).
```json
{ "courts": [
  { "id": 1, "name": "Cancha Laureles" },
  { "id": 2, "name": "Cancha El Poblado" },
  { "id": 3, "name": "Cancha Belén" },
  { "id": 4, "name": "Cancha Robledo" },
  { "id": 5, "name": "Cancha Envigado" }
] }
```

### `GET /api/courts/:courtId/availability?date=YYYY-MM-DD` 🔒
Grilla de 24 bloques (FR-010..013).

**200**
```json
{
  "court": { "id": 3, "name": "Cancha Belén" },
  "date": "2026-11-10",
  "bookingWindow": { "from": "2026-11-07", "to": "2026-11-20" },
  "slots": [
    { "startHour": 0,  "label": "00:00–01:00", "status": "available", "selectable": true },
    { "startHour": 14, "label": "14:00–15:00", "status": "reserved",  "selectable": false },
    { "startHour": 23, "label": "23:00–24:00", "status": "available", "selectable": true }
  ]
}
```
- `slots` tiene siempre exactamente 24 elementos, `startHour` 0..23 en orden.
- `status`: `"available"` | `"reserved"`. Nunca incluye datos del titular (FR-013).
- `selectable`: `false` si está reservado, si su inicio ya pasó o si la fecha está fuera de la ventana.
- `bookingWindow`: hoy (Medellín) y hoy + 13 días; el frontend lo usa para `min`/`max` del calendario.

| Error | Cuándo |
|-------|--------|
| 400 `INVALID_DATE` | `date` ausente, mal formada o inexistente (p. ej. `2026-02-30`) |
| 404 `COURT_NOT_FOUND` | `courtId` no es 1..5 |

> Una fecha válida fuera de la ventana **no** es error: devuelve la grilla con todos los `selectable: false` (consulta de solo lectura).

---

## Reservas

### `POST /api/reservations` 🔒
Crea una reserva de un bloque de 1 hora (FR-014..020). Toda la validación + inserción ocurre en una transacción `IMMEDIATE` ([data-model.md](../data-model.md#reglas-de-validación-al-crear-una-reserva-en-orden-dentro-de-una-transacción-immediate)).

Request
```json
{ "courtId": 3, "date": "2026-11-10", "startHour": 14 }
```
`startHour` es entero 0..23 → no existen bloques parciales ni multi-hora (FR-015).

**201**
```json
{ "reservation": {
  "id": 42, "court": { "id": 3, "name": "Cancha Belén" },
  "date": "2026-11-10", "startTime": "14:00", "endTime": "15:00"
} }
```

| Error | Cuándo |
|-------|--------|
| 400 `INVALID_SLOT` | `date`/`startHour` ausentes o inválidos |
| 404 `COURT_NOT_FOUND` | Cancha inexistente |
| 400 `SLOT_IN_PAST` | Inicio del bloque ≤ ahora (incluye bloque en curso) |
| 400 `OUTSIDE_BOOKING_WINDOW` | Fecha fuera de hoy..hoy+13 |
| 409 `SLOT_TAKEN` | Bloque ya reservado (incluida carrera concurrente) |
| 409 `ACTIVE_RESERVATION_EXISTS` | Tiene 1 activa y el bloque no es contiguo en la misma cancha |
| 409 `MAX_CONSECUTIVE_REACHED` | Ya tiene 2 reservas activas, o el bloque formaría más de 2 horas seguidas en la misma cancha (contando reservas ya finalizadas) |

### `GET /api/reservations/me` 🔒
Panel "Mis Reservas" (FR-021, FR-022). Solo reservas del usuario de la sesión (FR-008).

**200**
```json
{
  "upcoming": [
    { "id": 42, "court": { "id": 3, "name": "Cancha Belén" }, "date": "2026-11-10",
      "startTime": "14:00", "endTime": "15:00", "cancellable": true }
  ],
  "history": [
    { "id": 17, "court": { "id": 1, "name": "Cancha Laureles" }, "date": "2026-11-01",
      "startTime": "09:00", "endTime": "10:00", "cancellable": false }
  ]
}
```
- `upcoming`: inicio > ahora, orden ascendente. `history`: inicio ≤ ahora, orden descendente.
- Listas vacías → el frontend muestra "Aún no tienes reservas".

### `DELETE /api/reservations/:id` 🔒
Cancela una reserva propia futura (FR-023..025). La confirmación es responsabilidad de la UI.

| Respuesta | Cuándo |
|-----------|--------|
| **204** | Cancelada; el bloque queda libre de inmediato |
| 404 `RESERVATION_NOT_FOUND` | No existe **o pertenece a otro usuario** (no revela existencia, FR-008) |
| 409 `RESERVATION_STARTED` | Su inicio ya llegó |

---

## Catálogo de errores

| HTTP | `code` | `message` (español, se muestra al usuario) |
|------|--------|---------------------------------------------|
| 400 | `INVALID_REQUEST` | La solicitud no es válida. Revisa los datos e inténtalo de nuevo. |
| 400 | `INVALID_EMAIL` | Ingresa un correo electrónico válido. |
| 400 | `PASSWORD_TOO_SHORT` | La contraseña debe tener al menos 8 caracteres. |
| 400 | `PASSWORD_TOO_LONG` | La contraseña no puede tener más de 128 caracteres. |
| 400 | `INVALID_DATE` | La fecha seleccionada no es válida. |
| 400 | `INVALID_SLOT` | El horario seleccionado no es válido. |
| 400 | `SLOT_IN_PAST` | No puedes reservar un horario que ya pasó. |
| 400 | `OUTSIDE_BOOKING_WINDOW` | Solo puedes reservar desde hoy y hasta 14 días en adelante |
| 401 | `UNAUTHENTICATED` | Tu sesión expiró o no has iniciado sesión. Inicia sesión para continuar. |
| 401 | `INVALID_CREDENTIALS` | Correo o contraseña incorrectos |
| 404 | `COURT_NOT_FOUND` | La cancha seleccionada no existe. |
| 404 | `RESERVATION_NOT_FOUND` | No encontramos esa reserva. |
| 404 | `NOT_FOUND` | El recurso solicitado no existe. |
| 409 | `EMAIL_TAKEN` | Este correo ya está registrado |
| 409 | `SLOT_TAKEN` | La cancha ya fue reservada en este horario |
| 409 | `ACTIVE_RESERVATION_EXISTS` | Ya tienes una reserva activa. Solo puedes agregar la hora inmediatamente anterior o posterior en la misma cancha |
| 409 | `MAX_CONSECUTIVE_REACHED` | Ya alcanzaste el máximo de 2 horas seguidas |
| 409 | `RESERVATION_STARTED` | Esta reserva ya comenzó y no puede cancelarse |
| 429 | `TOO_MANY_ATTEMPTS` | Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo. |
| 500 | `INTERNAL_ERROR` | Ocurrió un problema inesperado. Inténtalo de nuevo en unos minutos. |

Los mensajes de la spec se usan literalmente (sin punto final cuando la spec no lo trae).

## Comportamiento del frontend ante errores

- 401 en cualquier llamada protegida → limpiar el usuario en memoria y redirigir a `/login` con aviso.
- 409 `SLOT_TAKEN` al reservar → mostrar el mensaje y **recargar la grilla** (Escenario US2-4).
- Error de red o respuesta sin cuerpo `error` → mensaje genérico de `INTERNAL_ERROR`.
