# Quickstart & Validación: Sistema de Reservas de Canchas de Pádel

Guía para levantar el proyecto y verificar de punta a punta que cumple la spec.
Detalles de endpoints en [contracts/api.md](./contracts/api.md); esquema en [data-model.md](./data-model.md).

## Prerrequisitos

- Node.js 20 LTS o superior (`node -v`) y npm 10+.
- En Windows, `better-sqlite3` usa binarios precompilados; si `npm install` intenta compilar,
  instalar "Desktop development with C++" de Visual Studio Build Tools.

## Puesta en marcha

```bash
# 1. Backend (crea /db/padel.db, aplica schema.sql y seed.sql al arrancar)
cd backend
npm install
npm run dev          # http://localhost:3000

# 2. Frontend (otra terminal; proxy /api → :3000)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Reiniciar la base: detener el backend y borrar `db/padel.db` (se recrea con las 5 canchas).

## Pruebas automatizadas

```bash
cd backend  && npm test     # unitarias (time, regla FR-019) + integración API + concurrencia
cd frontend && npm test     # componentes (grilla, calendario, modal, errores)
cd backend  && npm run typecheck && cd ../frontend && npm run typecheck
```

**Resultado esperado**: todas las suites en verde. La prueba de concurrencia
(`backend/tests/concurrency.test.ts`) debe reportar exactamente **1 × 201** y **9+ × 409 `SLOT_TAKEN`** (SC-003).

## Validación manual (navegador)

Abrir http://localhost:5173. Usar fecha/hora de Medellín como referencia.

| # | Paso | Resultado esperado | Ref. |
|---|------|--------------------|------|
| 1 | Sin sesión, abrir `/canchas` | Se ven las 5 canchas por nombre | FR-009 |
| 2 | Sin sesión, pulsar una cancha | Invita a iniciar sesión o registrarse; no se ve la grilla | US1-5 |
| 3 | Registrarse con `ana@example.com` / `corta` | "La contraseña debe tener al menos 8 caracteres." | FR-003 |
| 4 | Registrarse con `ana@example.com` / `secreta123` | Cuenta creada y sesión activa | US1-1 |
| 5 | Cerrar sesión y registrarse otra vez con `ANA@example.com` | "Este correo ya está registrado" | US1-2 |
| 6 | Iniciar sesión con contraseña errónea | "Correo o contraseña incorrectos" | US1-4 |
| 7 | Iniciar sesión bien, abrir Cancha Belén | Calendario: solo hoy..hoy+13 habilitados; grilla de 24 bloques `00:00–01:00`…`23:00–24:00` | US2-2, FR-010 |
| 8 | En la fecha de hoy | Bloques cuyo inicio ya pasó aparecen no seleccionables | US2-5 |
| 9 | Elegir mañana 14:00–15:00 y confirmar | Confirmación con cancha, fecha y hora; bloque "Reservado" | US2-3, FR-020 |
| 10 | Intentar 18:00 en Cancha Laureles | "Ya tienes una reserva activa. Solo puedes agregar…" | US2-6 |
| 11 | Reservar 15:00–16:00 en Cancha Belén | Éxito: 2 horas seguidas | US2-7 |
| 12 | Intentar 16:00–17:00 en Cancha Belén | "Ya alcanzaste el máximo de 2 horas seguidas" | US2-8 |
| 13 | En otra ventana privada, registrar `beto@example.com`, ver Cancha Belén mañana | 14:00 y 15:00 "Reservado", sin datos de Ana | FR-013 |
| 14 | Como Ana, "Mis Reservas" | Secciones "Próximas" e "Historial"; cada ítem con cancha, fecha, hora 24 h | US3-1 |
| 15 | Cancelar 15:00 y desistir en el diálogo | Sin cambios | US3-3 |
| 16 | Cancelar 15:00 y confirmar | Desaparece de "Próximas"; Beto lo ve "Disponible" al recargar | US3-2, SC-006 |
| 17 | Como Beto, usuario nuevo, abrir "Mis Reservas" | "Aún no tienes reservas" | US3-6 |

## Validación por API (casos que evitan la UI)

```bash
# Login y cookie
curl -i -c c.txt -H "Content-Type: application/json" \
  -d '{"email":"ana@example.com","password":"secreta123"}' http://localhost:3000/api/auth/login

# Sin cookie → 401 UNAUTHENTICATED
curl -i http://localhost:3000/api/courts/1/availability?date=2026-11-10

# Fecha pasada → 400 SLOT_IN_PAST ; fecha a +20 días → 400 OUTSIDE_BOOKING_WINDOW
curl -i -b c.txt -H "Content-Type: application/json" \
  -d '{"courtId":1,"date":"2020-01-01","startHour":10}' http://localhost:3000/api/reservations

# Bloque parcial → 400 INVALID_SLOT
curl -i -b c.txt -H "Content-Type: application/json" \
  -d '{"courtId":1,"date":"2026-11-10","startHour":10.5}' http://localhost:3000/api/reservations

# Cancelar reserva ajena (id de otro usuario) → 404 RESERVATION_NOT_FOUND
curl -i -b c.txt -X DELETE http://localhost:3000/api/reservations/<id-de-beto>
```

Esperado: ningún cuerpo de respuesta contiene *stack traces*, nombres de tablas ni texto en inglés (SC-008).

## Casos borde a verificar con pruebas (reloj inyectado)

Cubiertos en `backend/tests/` fijando `now`:
- 14:20 → bloque 14:00 no reservable ni cancelable (`RESERVATION_STARTED`).
- 23:00 de un día + 00:00 del siguiente en la misma cancha → contiguos (permitido).
- Reserva activa que termina → pasa a historial y el usuario puede volver a reservar.
- Sesión con `expires_at` vencido → 401 y no se crea la reserva.
- Día hoy+13 permitido; hoy+14 rechazado; a medianoche de Medellín la ventana avanza.
