# Project Rules
 testea todo antes de confirmar cambios 
- **Memory Handling & Zeroization**: As a strict security convention, any processing, viewing, or handling of sensitive RAM data (such as cryptographic keys, decrypted passwords, and master keys) should be done using Rust (via WASM) wherever possible. This minimizes the attack surface by avoiding pure JavaScript for sensitive memory operations.

- **Arquitectura y Aislamiento FFI (Rust/WASM)**: El frontend JavaScript debe desempeñarse exclusivamente como capa de UI, renderizado, eventos y llamadas FFI. Toda lógica sensible (derivación de claves, avance del Double Ratchet, firmas, secretos compartidos y almacenamiento criptográfico) está estrictamente confinada al núcleo Rust/WASM.

- **Superficie de API FFI de Alto Nivel**: Se prohíbe exponer funciones primitivas intermedias (`encrypt`, `decrypt`, `derive_key`, `advance_chain`). Las llamadas FFI se restringen a operaciones transaccionales completas (`unlock_vault`, `lock_vault`, `seal_message`, `open_message`, `create_group`, `backup_now`, `restore_backup`).

- **Diseño Modular y Separación de Responsabilidades**: El código de Rust evita monolitos (`HermesCrypto`) segregando responsabilidades en gestores dedicados (`HermesCore`, `SessionManager`, `VaultEngine`, `IdentityManager`, `RatchetManager`, `GroupManager`, `BackupManager`, `StorageEngine`, `CryptoEngine`). `StorageEngine` es puramente agnóstico de criptografía (solo lee/escribe bytes).

- **Evidencia y Rigor Técnico**: Prohibido el uso de marketing técnico o afirmaciones absolutas ("100% seguro", "inmune", "grado militar"). Toda justificación o conclusión se basa en evidencia verificable del código, pruebas automatizadas o análisis estricto de riesgos. Antes de modificar cualquier archivo, se debe justificar el cambio respondiendo a las 7 preguntas metodológicas de auditoría.

- **Gestión de Base de Datos**: Nunca borrar o eliminar la base de datos completa (`DROP DATABASE`). Si se solicita limpiar o reiniciar la base de datos, se debe únicamente **despoblar** (vaciar el contenido de las tablas usando `TRUNCATE` o `DELETE`) y **solo** si no estamos en un entorno de producción.
