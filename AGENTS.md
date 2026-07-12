# Project Rules
- **testea todo antes de confirmar cambios** 
- **Memory Handling & Zeroization**: As a strict security convention, any processing, viewing, or handling of sensitive RAM data (such as cryptographic keys, decrypted passwords, and master keys) should be done using Rust (via WASM) wherever possible. This minimizes the attack surface by avoiding pure JavaScript for sensitive memory operations.

- **Arquitectura y Aislamiento FFI (Rust/WASM)**: El frontend JavaScript debe desempenarse exclusivamente como capa de UI, renderizado, eventos y llamadas FFI. Toda logica sensible (derivacion de claves, avance del Double Ratchet, firmas, secretos compartidos y almacenamiento criptografico) esta estrictamente confinada al nucleo Rust/WASM.

- **Superficie de API FFI de Alto Nivel**: Se prohibe exponer funciones primitivas intermedias (`encrypt`, `decrypt`, `derive_key`, `advance_chain`). Las llamadas FFI se restringen a operaciones transaccionales completas (`unlock_vault`, `lock_vault`, `seal_message`, `open_message`, `create_group`, `backup_now`, `restore_backup`).

- **Diseno Modular y Separacion de Responsabilidades**: El codigo de Rust evita monolitos (`HermesCrypto`) segregando responsabilidades en gestores dedicados (`HermesCore`, `SessionManager`, `VaultEngine`, `IdentityManager`, `RatchetManager`, `GroupManager`, `BackupManager`, `StorageEngine`, `CryptoEngine`). `StorageEngine` es puramente agnostico de criptografia (solo lee/escribe bytes).

- **Evidencia y Rigor Tecnico**: Prohibido el uso de marketing tecnico o afirmaciones absolutas ("100% seguro", "inmune", "grado militar"). Toda justificacion o conclusion se basa en evidencia verificable del codigo, pruebas automatizadas o analisis estricto de riesgos. Antes de modificar cualquier archivo, se debe justificar el cambio respondiendo a las 7 preguntas metodologicas de auditoria.

- **Gestion de Base de Datos**: Nunca borrar o eliminar la base de datos completa (`DROP DATABASE`). Si se solicita limpiar o reiniciar la base de datos, se debe unicamente **despoblar** (vaciar el contenido de las tablas usando `TRUNCATE` o `DELETE`) y **solo** si no estamos en un entorno de produccion.

# PROTOCOLO DE VALIDACION ESTRICTA - CERO CODIGO FANTASMA
1. Prohibido declarar "hecho" sin evidencia verificable.
2. Prohibido el codigo fantasma (referenciar cosas que no existen sin marcarlas como pendientes).
3. Milimetria en detalles tecnicos: justificar valores, nunca decidir opciones ambiguas en codigo.
4. Documentacion siempre al dia en el mismo turno.
5. Nada queda a medias sin reportarlo; no avanzar con bloqueadores.
6. Verificacion cruzada: siempre responder (a) Comando que lo demuestra, (b) Casos limite, (c) Documentacion afectada, (d) Supuestos.
7. Formato de reporte: Siempre incluir Estado real (Verificado, Implementado sin verificar, Pendiente, Doc actualizada, Doc pendiente).
