# Feature Specification: Sistema de Reservas de Canchas de Pádel

**Feature Branch**: `spec` (especificación); implementación en `implementacion` y revisiones en `revision`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Autenticación de usuarios con correo y contraseña; exploración de las 5 canchas fijas con calendario y grilla de 24 bloques de 1 hora (Disponible/Reservado); creación de reservas con re-validación anti-colisión, solo en bloques enteros y nunca en el pasado, máximo una reserva activa por usuario; panel 'Mis Reservas' con reservas futuras, historial y cancelación. Fuera de alcance: pagos, panel de administración, notificaciones externas, reservas de más de 1 hora en un clic, matchmaking."

## Clarifications

### Session 2026-11-07

- Q: ¿Cómo se concilia "1 reserva activa a la vez" con "2 horas = 2 reservas independientes"? → A: Opción C — 1 reserva activa, con excepción para un segundo bloque contiguo (inmediatamente anterior o posterior) en la misma cancha; máximo 2 horas seguidas.
- Q: ¿Hasta cuándo se puede cancelar una reserva? → A: Hasta la hora de inicio del bloque (sin plazo mínimo de anticipación).
- Q: ¿Qué ve un visitante sin sesión? → A: Solo la lista de las 5 canchas; la grilla de disponibilidad, reservar y "Mis Reservas" exigen iniciar sesión.
- Q: ¿Con cuánta anticipación máxima se puede reservar? → A: Hasta 14 días desde hoy (hoy + 13 días siguientes).
- Q: ¿Cuánto dura una sesión? → A: 7 días desde el inicio de sesión (o hasta que el usuario cierre sesión).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registro e inicio de sesión (Priority: P1)

Una persona que quiere jugar pádel crea una cuenta con su correo electrónico y una contraseña, y luego inicia sesión para acceder a la disponibilidad de las canchas. Al terminar puede cerrar su sesión.

**Why this priority**: Sin sesión activa no se puede ver la disponibilidad completa ni reservar; es la puerta de entrada a todo el valor del sistema y la base para asociar cada reserva a una persona.

**Independent Test**: Se prueba completamente registrando una cuenta nueva, cerrando sesión, iniciando sesión con las mismas credenciales y verificando que se accede a la vista de disponibilidad, mientras que sin sesión se bloquea.

**Acceptance Scenarios**:

1. **Given** un visitante sin cuenta, **When** se registra con un correo válido no usado y una contraseña que cumple el mínimo, **Then** la cuenta se crea y queda con sesión activa.
2. **Given** un correo ya registrado, **When** alguien intenta registrarse con ese mismo correo, **Then** el registro se rechaza con el mensaje "Este correo ya está registrado".
3. **Given** un usuario registrado, **When** inicia sesión con correo y contraseña correctos, **Then** obtiene una sesión activa y accede a la disponibilidad de canchas.
4. **Given** un usuario registrado, **When** inicia sesión con una contraseña incorrecta, **Then** se rechaza con un mensaje genérico ("Correo o contraseña incorrectos") que no revela cuál de los dos datos falló.
5. **Given** un visitante sin sesión, **When** intenta ver la grilla de disponibilidad, reservar o ver "Mis Reservas", **Then** se le pide iniciar sesión y no se le muestra esa información.
6. **Given** un usuario con sesión activa, **When** cierra sesión, **Then** deja de poder ver disponibilidad y reservar hasta volver a iniciar sesión.

---

### User Story 2 - Consultar disponibilidad y reservar un bloque (Priority: P1)

Un usuario con sesión elige una de las 5 canchas, selecciona una fecha en el calendario, ve la grilla de 24 bloques de 1 hora con su estado (Disponible / Reservado), elige un bloque disponible y confirma la reserva.

**Why this priority**: Es el propósito central del producto: asegurar un turno en una cancha sin conflictos.

**Independent Test**: Con un usuario autenticado sin reservas activas, se selecciona una cancha, una fecha futura y un bloque disponible; al confirmar, el bloque pasa a mostrarse como "Reservado" para cualquier usuario.

**Acceptance Scenarios**:

1. **Given** un usuario con sesión, **When** abre la exploración de canchas, **Then** ve exactamente las 5 canchas: Cancha Laureles, Cancha El Poblado, Cancha Belén, Cancha Robledo y Cancha Envigado.
2. **Given** un usuario que eligió una cancha y una fecha, **When** se muestra la grilla, **Then** aparecen 24 bloques consecutivos de 1 hora (00:00–01:00 hasta 23:00–24:00) en formato de 24 horas, cada uno marcado como "Disponible" o "Reservado".
3. **Given** un bloque "Disponible" en el futuro y un usuario sin reserva activa, **When** lo selecciona y confirma, **Then** la reserva queda registrada a su nombre y el bloque aparece como "Reservado".
4. **Given** dos usuarios que ven el mismo bloque como "Disponible", **When** ambos confirman casi al mismo tiempo, **Then** solo uno obtiene la reserva y el otro recibe el mensaje "La cancha ya fue reservada en este horario", y su grilla se actualiza.
5. **Given** una fecha pasada o un bloque cuya hora de inicio ya transcurrió en el día actual, **When** el usuario intenta reservarlo, **Then** el sistema no lo permite y lo muestra como no seleccionable.
6. **Given** un usuario con una reserva activa en Cancha Belén de 14:00 a 15:00, **When** intenta reservar en otra cancha o en un bloque no contiguo, **Then** se rechaza con el mensaje "Ya tienes una reserva activa. Solo puedes agregar la hora inmediatamente anterior o posterior en la misma cancha".
7. **Given** un usuario con una reserva activa en Cancha Belén de 14:00 a 15:00, **When** reserva el bloque disponible 15:00–16:00 (o 13:00–14:00) en Cancha Belén, **Then** la segunda reserva se confirma y el usuario queda con 2 horas seguidas.
8. **Given** un usuario con 2 reservas contiguas activas, **When** intenta reservar un tercer bloque, **Then** se rechaza con el mensaje "Ya alcanzaste el máximo de 2 horas seguidas".

---

### User Story 3 - Ver y gestionar "Mis Reservas" (Priority: P2)

Un usuario con sesión abre su panel "Mis Reservas", donde ve su reserva futura y el historial de reservas pasadas, y puede cancelar una reserva futura tras confirmar la acción.

**Why this priority**: Da control al usuario sobre sus turnos y libera canchas que no se van a usar; depende de que existan reservas (Historia 2).

**Independent Test**: Con un usuario que tiene una reserva futura y al menos una pasada, se abre el panel, se verifican ambas listas con cancha, fecha y hora, se cancela la reserva futura confirmando, y se comprueba que el bloque vuelve a estar "Disponible".

**Acceptance Scenarios**:

1. **Given** un usuario con reservas futuras y pasadas, **When** abre "Mis Reservas", **Then** ve dos secciones separadas, "Próximas" e "Historial", y cada ítem muestra nombre de la cancha, fecha y hora (formato 24 h).
2. **Given** un usuario con una reserva futura, **When** selecciona "Cancelar" y confirma en el diálogo de confirmación, **Then** la reserva se elimina de "Próximas" y el bloque vuelve a figurar como "Disponible" para todos.
3. **Given** un usuario que selecciona "Cancelar", **When** desiste en el diálogo de confirmación, **Then** la reserva permanece sin cambios.
4. **Given** una reserva del historial (ya iniciada o transcurrida), **When** el usuario la consulta, **Then** no se ofrece la opción de cancelarla.
5. **Given** un usuario A, **When** intenta ver o cancelar una reserva de un usuario B (por cualquier medio), **Then** la acción se rechaza y no se revela información de la reserva ajena.
6. **Given** un usuario sin reservas, **When** abre "Mis Reservas", **Then** ve un mensaje indicando que aún no tiene reservas.

---

### Edge Cases

- **Bloque en curso**: si son las 14:20, el bloque 14:00–15:00 ya no es reservable (su inicio transcurrió) ni cancelable; se considera pasado/iniciado.
- **Cambio de día**: el bloque 23:00–24:00 termina a la medianoche; pertenece a la fecha en que inicia.
- **Grilla desactualizada**: si el usuario tiene la grilla abierta mucho tiempo y el bloque ya fue tomado o ya transcurrió, la confirmación se re-valida y se rechaza con un mensaje claro; la grilla se refresca.
- **Reserva activa que termina**: cuando la hora de fin de la reserva activa de un usuario pasa, esa reserva se mueve al historial y el usuario puede volver a reservar, salvo que la nueva reserva forme más de 2 horas seguidas con sus reservas en la misma cancha (FR-019).
- **Encadenar horas**: si un usuario reservó 10:00 y 11:00 en una cancha, a las 11:05 (con la de 10:00 ya finalizada) no puede reservar 12:00 en esa cancha, porque formaría 3 horas seguidas; se rechaza con "Ya alcanzaste el máximo de 2 horas seguidas".
- **Cancelación y nueva reserva**: tras cancelar su reserva activa, el usuario puede reservar otro bloque de inmediato.
- **Cancelar una de dos horas contiguas**: si el usuario cancela una de sus 2 reservas contiguas, la otra se mantiene y vuelve a aplicar la regla de 1 reserva activa (con su posible bloque contiguo).
- **Contigüidad a medianoche**: el bloque 23:00–24:00 de un día y el 00:00–01:00 del día siguiente en la misma cancha se consideran contiguos.
- **Bloque contiguo ocupado**: si la hora contigua ya está reservada por otro usuario, el intento se rechaza con el mensaje de colisión estándar.
- **Cancelación tardía**: si el usuario intenta cancelar justo cuando el bloque ya inició, se rechaza con "Esta reserva ya comenzó y no puede cancelarse".
- **Sesión expirada**: si la sesión expira durante el flujo de reserva, la confirmación se rechaza y se pide iniciar sesión de nuevo, sin crear la reserva.
- **Datos de registro inválidos**: correo con formato inválido (incluido uno de más de 254 caracteres), contraseña por debajo del mínimo o por encima del máximo se rechazan con mensajes específicos en español.
- **Fechas fuera de la ventana**: las fechas pasadas y las posteriores a hoy + 13 días aparecen deshabilitadas en el calendario; un intento directo de reservar en ellas se rechaza con "Solo puedes reservar desde hoy y hasta 14 días en adelante".
- **Ventana móvil**: la ventana avanza cada día a medianoche (hora de Medellín); el día 14 se habilita al cambiar de fecha.
- **Recargar la página**: al recargar o volver a abrir la disponibilidad de una cancha, la fecha seleccionada vuelve a ser hoy; la fecha elegida no se conserva.
- **Intentos de inicio de sesión repetidos**: tras 10 intentos fallidos con el mismo correo en 15 minutos, el undécimo se rechaza con "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo." aunque la contraseña sea correcta; pasada la ventana, se puede volver a intentar.
- **Errores inesperados**: ante cualquier fallo técnico, el usuario ve un mensaje amigable en español, nunca detalles técnicos.

## Requirements *(mandatory)*

### Functional Requirements

**Autenticación**

- **FR-001**: El sistema MUST permitir registrarse con un correo electrónico y una contraseña.
- **FR-002**: El sistema MUST validar que el correo tenga formato válido y que no esté ya registrado (sin distinguir mayúsculas/minúsculas).
- **FR-003**: El sistema MUST exigir una contraseña de al menos 8 y como máximo 128 caracteres.
- **FR-004**: El sistema MUST permitir iniciar sesión con correo y contraseña, y cerrar sesión. Una sesión MUST expirar 7 días después del inicio de sesión, o antes si el usuario cierra sesión; tras expirar, el usuario debe iniciar sesión de nuevo.
- **FR-005**: Ante credenciales inválidas, el sistema MUST mostrar un mensaje genérico que no revele si el correo existe.
- **FR-006**: El sistema MUST almacenar las contraseñas de forma que no puedan leerse en texto plano.
- **FR-007**: Ver la grilla de disponibilidad, crear, consultar y cancelar reservas MUST requerir una sesión activa; sin ella, el sistema MUST rechazar la acción y solicitar inicio de sesión.
- **FR-008**: Un usuario MUST poder ver y cancelar únicamente sus propias reservas.
- **FR-028**: El sistema MUST limitar los intentos fallidos de inicio de sesión: como máximo 10 por correo y 50 por dirección de origen en una ventana de 15 minutos. Al superar el límite, MUST rechazar los nuevos intentos, incluso con la contraseña correcta, con el mensaje "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo." hasta que termine la ventana. Un inicio de sesión exitoso reinicia el contador de ese correo.

**Canchas y disponibilidad**

- **FR-009**: El sistema MUST mostrar exactamente 5 canchas fijas: Cancha Laureles, Cancha El Poblado, Cancha Belén, Cancha Robledo y Cancha Envigado. No existirá forma de crear, editar o eliminar canchas. La lista de canchas (solo nombres) es visible también para visitantes sin sesión; al intentar ver la disponibilidad de una cancha sin sesión, el sistema MUST invitar a iniciar sesión o registrarse.
- **FR-010**: El usuario MUST poder elegir una cancha y una fecha mediante un calendario. Solo se pueden seleccionar fechas dentro de la ventana de reserva: el día de hoy y los 13 días siguientes (14 días en total); las fechas fuera de esa ventana MUST mostrarse deshabilitadas.
- **FR-011**: Para la cancha y fecha elegidas, el sistema MUST mostrar 24 bloques de 1 hora (de 00:00 a 24:00) en formato de 24 horas (`HH:mm`).
- **FR-012**: Cada bloque MUST indicar claramente su estado: "Disponible" o "Reservado". Los bloques cuyo inicio ya transcurrió MUST mostrarse como no seleccionables.
- **FR-013**: La grilla MUST NOT revelar la identidad del usuario que tiene un bloque reservado.

**Creación de reservas**

- **FR-014**: El usuario MUST poder seleccionar un bloque disponible y confirmar su reserva.
- **FR-015**: Cada reserva MUST cubrir exactamente un bloque entero de 1 hora que inicia en hora en punto (ej. 14:00–15:00). No se aceptan bloques parciales ni de varias horas.
- **FR-016**: Al confirmar, el sistema MUST re-validar que el bloque siga disponible; si fue tomado por otro usuario, MUST rechazar la reserva con el mensaje "La cancha ya fue reservada en este horario".
- **FR-017**: El sistema MUST garantizar que nunca existan dos reservas para la misma cancha en el mismo bloque, incluso ante confirmaciones simultáneas.
- **FR-018**: El sistema MUST rechazar reservas en fechas pasadas, en bloques cuya hora de inicio ya transcurrió o en fechas posteriores a la ventana de 14 días (FR-010), aunque la petición evite el calendario.
- **FR-019**: Un usuario MUST tener como máximo una reserva activa (no finalizada) a la vez, con una única excepción: puede tener una segunda reserva activa si es el bloque inmediatamente anterior o posterior a la primera, en la misma cancha (máximo 2 horas seguidas). Además, una reserva MUST rechazarse si, junto con las demás reservas del mismo usuario en la misma cancha (activas, en curso o ya finalizadas), formaría más de 2 bloques consecutivos. Cualquier otro intento de reserva adicional MUST rechazarse con un mensaje claro que explique la regla.
- **FR-020**: Tras una reserva exitosa, el sistema MUST mostrar una confirmación con cancha, fecha y hora, y el bloque MUST verse como "Reservado".

**Mis Reservas**

- **FR-021**: El sistema MUST ofrecer un panel "Mis Reservas" con dos listas: "Próximas" (reservas cuyo inicio no ha llegado) e "Historial" (reservas ya iniciadas o finalizadas).
- **FR-022**: Cada ítem MUST mostrar nombre de la cancha, fecha y hora del bloque.
- **FR-023**: El usuario MUST poder cancelar una reserva de "Próximas" tras confirmar la acción en un paso de confirmación explícito.
- **FR-024**: Al cancelar, el bloque MUST quedar disponible de inmediato para cualquier usuario y la reserva cancelada MUST dejar de contar como reserva activa.
- **FR-025**: El sistema MUST permitir cancelar una reserva en cualquier momento antes de su hora de inicio, sin plazo mínimo de anticipación, y MUST rechazar la cancelación de reservas que ya iniciaron o finalizaron.

**Errores**

- **FR-026**: Todos los mensajes de error mostrados al usuario MUST estar en español, ser comprensibles y no contener detalles técnicos.
- **FR-027**: El sistema MUST responder con estos códigos HTTP: 400 para datos inválidos y reglas de tiempo (bloque pasado, fuera de la ventana de 14 días); 401 sin sesión o con credenciales inválidas; 404 para canchas inexistentes o reservas inexistentes o ajenas; 409 para conflictos con el estado de las reservas: bloque ya reservado, regla de reserva activa (FR-019), máximo de 2 horas seguidas, cancelación de una reserva ya iniciada y correo ya registrado; 429 al superar el límite de intentos de inicio de sesión (FR-028).

### Key Entities

- **Usuario**: persona que usa el sistema. Atributos: correo electrónico (único), credencial de acceso protegida, fecha de registro. Tiene cero o más reservas.
- **Cancha**: una de las 5 canchas fijas. Atributos: nombre. Catálogo inmutable.
- **Reserva**: asignación de un bloque de 1 hora de una cancha a un usuario. Atributos: usuario, cancha, fecha, hora de inicio (en punto), hora de fin (inicio + 1 h), fecha de creación. Restricción: una única reserva por combinación cancha + fecha + hora de inicio; máximo una reserva activa por usuario, o dos si son bloques contiguos en la misma cancha.
- **Bloque horario** (concepto derivado, no almacenado): cada una de las 24 franjas de 1 hora de una fecha para una cancha; su estado se deriva de la existencia de una reserva y de la hora actual.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario nuevo puede registrarse y completar su primera reserva en menos de 3 minutos.
- **SC-002**: Un usuario ya registrado puede iniciar sesión y reservar un bloque disponible en menos de 1 minuto y en no más de 5 interacciones tras iniciar sesión.
- **SC-003**: 0 dobles reservas: en pruebas con al menos 10 confirmaciones simultáneas sobre el mismo bloque, exactamente una tiene éxito y el resto recibe el mensaje de conflicto.
- **SC-004**: El 100 % de los intentos de reservar en el pasado, de crear una reserva activa adicional no permitida por la regla de contigüidad (FR-019) o de acceder a reservas ajenas son rechazados.
- **SC-005**: La grilla de disponibilidad de una cancha y fecha se muestra en menos de 2 segundos en el 95 % de las consultas.
- **SC-006**: Tras cancelar, el bloque aparece como "Disponible" para otro usuario en su siguiente consulta (sin demoras perceptibles).
- **SC-007**: El 90 % de los usuarios de prueba identifican correctamente qué bloques están disponibles y reservados sin ayuda en su primer intento.
- **SC-008**: Ningún mensaje mostrado al usuario contiene detalles técnicos ni texto en otro idioma distinto del español.

## Assumptions

- **Zona horaria**: todas las fechas y horas se interpretan en la hora local de Medellín, Colombia (UTC−5, sin horario de verano); "pasado" y "ahora" se calculan con esa referencia.
- **Horario de operación**: las canchas pueden reservarse las 24 horas del día (00:00–24:00), según la grilla de 24 bloques descrita.
- **Reserva activa**: se considera activa toda reserva cuya hora de fin aún no ha llegado (incluye la que está en curso). Al terminar, pasa al historial y deja de contar para el límite de reservas activas de FR-019, pero sí cuenta para el máximo de 2 horas seguidas en la misma cancha.
- **Cancelación**: el plazo se define en FR-025. Las reservas canceladas se eliminan y no aparecen en el historial (el historial solo contiene reservas que llegaron a iniciarse).
- **Cuenta**: no se incluyen en esta iteración la recuperación de contraseña, verificación de correo ni edición de perfil (no hay notificaciones externas).
- **Fuera de alcance (Non-Goals)**: pasarela de pagos (el pago es presencial en el club); panel de administración de canchas; notificaciones externas (correo, SMS, WhatsApp); reservas de más de 1 hora continua en una sola acción (2 horas requieren 2 reservas contiguas en la misma cancha, según FR-019; más de 2 horas no es posible); matchmaking o torneos.
- **Dispositivos**: se asume uso desde navegador web con conexión a internet estable.
