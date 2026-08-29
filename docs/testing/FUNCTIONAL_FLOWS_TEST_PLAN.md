# Test Plan: Functional Flows (Production)

Alcance: flujos de usuario final contra el deploy real (`https://hermetic-eight.vercel.app` → `https://hermetic.onrender.com`), basado en el estado real de `ROADMAP.md` (releído fresco, no de memoria). No reemplaza la suite automatizada (`tests/`, `frontend/src/js/tests/*.test.js`) — cubre lo que solo se puede verificar con una sesión de navegador real.

## 1. Execution Matrix

| Área | Estado hoy | Evidencia |
|---|---|---|
| Registro + frase de recuperación | ⚠️ Funciona, con bug conocido (ver §2.1) | Consola del navegador, cuenta `testaudit_2609` |
| Restaurar backup — Nube | ✅ Verificado end-to-end en producción | Ver §2.3 |
| Restaurar backup — Local | ⬜ No probado | — |
| Contactos / Grupos / Mensajería | ⬜ No probado esta sesión | — |
| Responsividad / móvil | ⬜ Nunca testeado | — |
| Multi-pestaña / cierre a mitad de envío | ⬜ Conocido no cubierto (ROADMAP v1.1) | — |

## 2. Cuenta, Backups y Recuperación

| Caso | Pasos | Resultado esperado | Estado |
|---|---|---|---|
| 2.1 Registro + frase obligatoria | Crear identidad nueva (alias + contraseña ≥12 chars) → modal "Guarda esta frase" → confirmar 2 palabras al azar | Cuenta creada, `/api/register` 200, frase de 12 palabras (BIP-39) mostrada, no se puede continuar sin confirmar 2 palabras correctas | ⚠️ **Bug conocido**: el auto-backup inmediato post-registro puede fallar con 401 (`recovery_system_complete.js::uploadBlob`, log `[Recovery] El servidor rechazó el backup: 401`) — 6 intentos casi simultáneos con el mismo timestamp observados en consola, consistente con `startAutoBackup()` registrando el listener `hermes:contacts_updated`/`groups_updated` más de una vez. Verificar con `/api/backup/fetch` (con sesión) que al menos un backup quedó guardado antes de dar el registro por completo — si `backups` viene vacío, la cuenta NO es recuperable todavía pese al mensaje de éxito. |
| 2.2 Login normal | Alias + contraseña local correcta | Entra al chat directo, sin re-pedir la frase | — |
| 2.3 Restaurar backup — Nube (perdí el dispositivo) | Borrar `localStorage`+IndexedDB (simula dispositivo nuevo) → Login → "Restaurar backup (Nube/Local)" → alias → "nube" → 12 palabras → nueva contraseña local | "Frase válida", backup descifrado y aplicado, transición a `doLoginTransition()` | ✅ Verificado en producción real (cuenta `testaudit_2609`, `hermetic-eight.vercel.app`) — recupera con **solo la frase**, nunca pide ni depende de Google Drive ni de ningún archivo local. Nota: después de "Nueva contraseña local" la UI volvió a la pantalla de login en vez de entrar directo al chat — revisar si es esperado (¿requiere loguearse de nuevo a mano?) o es otro bug menor. |
| 2.4 Restaurar backup — Local | Con un `.hermes` descargado previamente (botón "Nuevo Backup" en Configuración → Gestión de backups) → Login → "Restaurar backup" → "local" → seleccionar archivo → contraseña del archivo | Backup descifrado y aplicado igual que 2.3 | ⬜ No probado |
| 2.5 Backup automático periódico | Dejar la sesión abierta >5 min, o disparar `hermes:contacts_updated`/`groups_updated` (agregar un contacto) | Nuevo backup subido (`autoBackup()`), `localStorage.hermes_recovery_blob_id` actualizado | ⬜ No probado — verificar también que dos backups casi simultáneos no pisen datos (vector clock) |
| 2.6 Deshabilitar cuenta / Cerrar todas las sesiones | Configuración → botones "Deshabilitar cuenta" / "Cerrar todas las sesiones" | Confirmar comportamiento real (¿pide confirmación? ¿revoca JTI de todas las sesiones activas?) | ⬜ No probado |

## 3. Contactos y Grupos

| Caso | Pasos | Resultado esperado | Estado |
|---|---|---|---|
| 3.1 Agregar contacto | Enviar solicitud por alias → aceptar del otro lado | Canal 1:1 E2E establecido, relación registrada (`/api/user/relationships`) | ⬜ |
| 3.2 Eliminar contacto | Quitar de la lista | Desaparece de "Contactos cifrados", historial local se conserva o borra según diseño | ⬜ |
| 3.3 Crear grupo | Botón `[+ NUEVO]` en Grupos Privados | Grupo creado, doble trinquete activo | ⬜ |
| 3.4 Agregar miembro a grupo | Invitar contacto existente | Clave de grupo **rotada** antes de invitar (no se entrega la clave vieja) | ⬜ |
| 3.5 Kickear miembro | Botón "✕" en la barra de miembros (`#group-members-bar`) | Miembro removido, clave rotada y redistribuida al resto | ⬜ |
| 3.6 Salir de grupo | Acción "Salir de grupo" | Si el que sale es admin, el receptor rota la clave automáticamente | ⬜ |

## 4. Mensajería

| Caso | Pasos | Resultado esperado | Estado |
|---|---|---|---|
| 4.1 Mensaje 1:1 | Enviar texto | Ticks: pending → sent → delivered → read | ⬜ |
| 4.2 Mensaje grupal | Enviar a un grupo con ≥2 miembros | `deliveredBy`/`readBy` se acumulan por miembro; estado agregado solo avanza cuando **todos** cubrieron ese estado | ⬜ |
| 4.3 Indicador de escritura | Empezar a tipear en 1:1 y en grupo | El otro lado ve "escribiendo..." | ⬜ |
| 4.4 Imagen efímera | Enviar imagen "ver una vez" | Se muestra una vez, nunca debe quedar en IndexedDB (`hermes_messages`) antes ni después de verla — confirmar con DevTools → Application → IndexedDB | ⬜ |
| 4.5 Audio efímero | Igual que 4.4 con audio | Igual garantía que 4.4 | ⬜ |
| 4.6 Búsqueda en conversación | Buscar texto dentro de un chat abierto | Resalta coincidencias, navega entre ellas | ⬜ |
| 4.7 Eliminar conversación | Acción "Eliminar" sobre un chat 1:1 | Historial local borrado, no afecta al otro participante | ⬜ |
| 4.8 Notificaciones Web Push | Mensaje nuevo con la pestaña en background | Notificación del navegador, deep-link al abrir | ⬜ |

## 5. Responsividad / Móvil (nunca testeado)

Usar emulación de Chrome DevTools (o `resize_window` en Claude-in-Chrome) con estos viewports:

| Viewport | Resolución | Foco |
|---|---|---|
| iPhone 12/13/14 | 390×844 | Layout de login/registro, modal de frase de recuperación (12 palabras no debe desbordar), lista de chats vs. panel de chat (¿colapsa a una sola columna?) |
| Android medio | 412×915 | Igual que arriba + teclado virtual no debe tapar el input de mensaje |
| Tablet | 768×1024 | Confirmar que no queda un layout de escritorio comprimido e inusable |

| Caso | Resultado esperado | Estado |
|---|---|---|
| 5.1 Pantalla de login/registro en móvil | Formularios usables, sin scroll horizontal | ⬜ |
| 5.2 Modal de 12 palabras en móvil | Las 12 palabras se leen completas sin cortarse | ⬜ |
| 5.3 Chat list + panel de chat en móvil | Navegación entre lista y chat individual (no ambos paneles fijos lado a lado si no entran) | ⬜ |
| 5.4 Modal de Gestión de Backups en móvil | Botones no se superponen, checkbox de "Backup automático" clickeable | ⬜ |
| 5.5 Envío de imagen/audio desde móvil | Selector de archivo/micrófono nativo del navegador móvil funciona | ⬜ |

## 6. Conocido No Cubierto (ROADMAP v1.1)

No forman parte de este plan todavía — están marcados `[ ]` en `ROADMAP.md` como trabajo futuro, no regresiones de v1.0:

- Cierre de navegador a mitad de envío (recuperación del outbox).
- Dos pestañas del mismo usuario emitiendo mensajes a la vez (resolución de conflictos en tiempo real, no solo en backup).
- Adjuntos de archivo genérico (hoy solo `accept="image/*"`).
