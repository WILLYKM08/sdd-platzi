<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.0.1 (PATCH, 2026-11-07)
Principios modificados:
  - I. Catálogo Cerrado de Canchas — aclaración: `24:00` se admite únicamente como
    hora de fin del último bloque del día (las horas de inicio siguen en 00:00–23:59).
Secciones añadidas/eliminadas: ninguna
Plantillas revisadas:
  - ✅ .specify/templates/*.md — sin cambios requeridos (aclaración de redacción).
  - ✅ specs/001-padel-court-booking/* — ya usan "23:00–24:00"; ahora conformes.
TODOs diferidos: ninguno. Resuelto el TODO de 1.0.0 sobre duración de bloques y
horario de operación: spec.md los fija (bloques de 1 h, 00:00–24:00).

Historial — 1.0.0 (ratificación):
Version change: (template sin ratificar) → 1.0.0
Principios definidos (antes eran placeholders):
  - [PRINCIPLE_1_NAME] → I. Catálogo Cerrado de Canchas
  - [PRINCIPLE_2_NAME] → II. Prevención de Doble Reserva (NO NEGOCIABLE)
  - [PRINCIPLE_3_NAME] → III. Autenticación Obligatoria
  - [PRINCIPLE_4_NAME] → IV. Simplicidad y Estructura Plana
  - [PRINCIPLE_5_NAME] → V. Errores Amigables y HTTP Semántico
  - (nuevo)            → VI. Cero Código Sombra y spec.md como Fuente de la Verdad
Secciones añadidas:
  - Stack Tecnológico (antes [SECTION_2_NAME])
  - Estilo de Código y Flujo de Trabajo SDD (antes [SECTION_3_NAME])
  - Governance (completada)
Secciones eliminadas: ninguna
Plantillas revisadas:
  - ✅ .specify/templates/plan-template.md — "Constitution Check" es genérico y se
       deriva de este archivo; sin cambios requeridos.
  - ✅ .specify/templates/spec-template.md — sin secciones obligatorias nuevas.
  - ✅ .specify/templates/tasks-template.md — sin nuevos tipos de tarea requeridos.
  - ✅ .specify/templates/commands/*.md — no existe el directorio; nada que revisar.
  - ✅ CLAUDE.md — solo remite al plan actual; sin referencias a principios.
TODOs diferidos (1.0.0, resuelto en 1.0.1):
  - La duración de los bloques de reserva y el horario de operación debían
    fijarse en spec.md (ver Principio I).
-->

# Sistema de Reservas de Pádel Constitution

## Core Principles

### I. Catálogo Cerrado de Canchas

- El sistema MUST manejar exclusivamente 5 canchas fijas: **Cancha Laureles**,
  **Cancha El Poblado**, **Cancha Belén**, **Cancha Robledo** y **Cancha Envigado**.
- MUST NOT existir flujo, endpoint ni UI para crear, editar o eliminar canchas.
  El catálogo se siembra (seed) en la base de datos y es inmutable.
- Todas las horas de reserva MUST expresarse y mostrarse en formato de 24 horas
  (`HH:mm`). Las horas de inicio van de 00:00 a 23:59; `24:00` se admite
  únicamente como hora de fin del último bloque del día. La duración de los
  bloques y el horario de operación se definen en `spec.md`; el código MUST NOT
  asumir valores no documentados.

**Razón**: un dominio cerrado elimina complejidad administrativa innecesaria y
hace las reglas verificables.

### II. Prevención de Doble Reserva (NO NEGOCIABLE)

- Ninguna reserva MUST escribirse en la base de datos sin validar antes que la
  cancha seleccionada está libre en el rango horario solicitado.
- Dos reservas de la misma cancha colisionan si sus intervalos `[inicio, fin)`
  se solapan.
- La verificación de disponibilidad y la inserción MUST ejecutarse dentro de una
  misma transacción de SQLite, de modo que dos peticiones concurrentes no puedan
  producir una doble reserva.
- Una colisión MUST responder HTTP **409 Conflict**.

**Razón**: es la regla crítica del negocio; una doble reserva rompe la confianza
del usuario y la integridad del sistema.

### III. Autenticación Obligatoria

- Todo flujo de reserva (consultar las propias reservas, crear o cancelar)
  MUST exigir un usuario con sesión activa, validada en el backend.
- Peticiones sin sesión válida MUST responder HTTP **401 Unauthorized**.
- La validación en el frontend es solo de conveniencia; nunca sustituye la del
  backend.

**Razón**: cada reserva debe estar asociada a un usuario identificable.

### IV. Simplicidad y Estructura Plana

- El repositorio MUST usar una estructura simple de tres carpetas: `/frontend`,
  `/backend` y `/db`.
- Están prohibidos Clean Architecture, capas de repositorio/servicio
  innecesarias, inyección de dependencias y patrones complejos.
- Se prefieren funciones puras y componentes funcionales con Hooks; las clases
  solo se permiten cuando una librería lo exija.

**Razón**: el proyecto es pequeño; la sobreingeniería aumenta el costo sin
aportar valor.

### V. Errores Amigables y HTTP Semántico

- La UI MUST NOT mostrar nunca errores crudos ni *stack traces*. Todo error técnico
  MUST traducirse a un mensaje amigable en español
  (ej.: "La cancha ya fue reservada en este horario").
- El backend MUST retornar códigos HTTP semánticos: **400** petición inválida,
  **401** no autenticado, **409** conflicto de reserva; otros códigos estándar
  (404, 500) cuando correspondan, sin filtrar detalles internos en el cuerpo.

**Razón**: los usuarios necesitan mensajes accionables y el frontend necesita
códigos predecibles para traducirlos.

### VI. Cero Código Sombra y `spec.md` como Fuente de la Verdad

- Se construye estrictamente lo documentado en `spec.md`. Están prohibidas las
  funcionalidades "por si acaso" (pasarelas de pago, perfiles complejos,
  notificaciones, paneles de administración, etc.).
- Si una instrucción del usuario contradice esta constitución, o se detecta una
  falla lógica o ambigüedad en la especificación, el agente de IA MUST
  detenerse, advertir del problema y solicitar la actualización de `spec.md`
  antes de modificar código fuente.

**Razón**: en SDD la especificación gobierna el código, no al revés.

## Stack Tecnológico

- **Lenguaje**: TypeScript en todo el stack (frontend y backend).
- **Frontend / UI**: React con componentes funcionales y Hooks; estilos con
  Tailwind CSS.
- **Backend**: Node.js con Express.
- **Base de datos**: SQLite local en el archivo `padel.db` (ubicado en `/db`).
  Acceso mediante `better-sqlite3` y sentencias SQL puras. Están prohibidos los
  ORMs pesados (Prisma, TypeORM, Sequelize, etc.).
- Cualquier dependencia adicional MUST justificarse en `plan.md`.

## Estilo de Código y Flujo de Trabajo SDD

- **Nomenclatura**: `camelCase` para funciones y variables; `PascalCase` para
  interfaces, tipos y componentes de React.
- **Flujo**: constitución → `spec.md` → `plan.md` → `tasks.md` → implementación.
  Ningún código se escribe sin una tarea trazable a `spec.md`.
- **Constitution Check**: cada `plan.md` MUST verificar explícitamente los
  Principios I–VI y el Stack Tecnológico antes de la Fase 0 y después del
  diseño (Fase 1). Las violaciones MUST registrarse en "Complexity Tracking"
  con justificación, o el plan se rechaza.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica, instrucción o
  preferencia de implementación del proyecto.
- **Enmiendas**: se realizan únicamente mediante `/speckit-constitution`,
  documentando el cambio en el Sync Impact Report y propagándolo a las
  plantillas dependientes en `.specify/templates/`.
- **Versionado** (SemVer):
  - MAJOR: eliminación o redefinición incompatible de un principio.
  - MINOR: nuevo principio o sección, o ampliación material de una regla.
  - PATCH: aclaraciones, redacción o correcciones tipográficas.
- **Cumplimiento**: toda revisión de plan, tareas o código MUST verificar el
  cumplimiento de esta constitución. La complejidad adicional MUST justificarse.
- Para guía de ejecución en tiempo de desarrollo, consultar `CLAUDE.md` y el
  `plan.md` vigente.

**Version**: 1.0.1 | **Ratified**: 2026-11-07 | **Last Amended**: 2026-11-07
