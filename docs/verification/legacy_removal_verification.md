# Verificación de Retirada de Sistema Anti-Replay Heredado

**Fecha:** 2026-07-14
**Objetivo:** Consolidar en el repositorio la evidencia reproducible que demuestra la completa erradicación de la tabla `used_key_hashes` y sus DAOs asociados, asegurando la adopción exclusiva de `replay_claims`.

## 1. Verificación del Código Activo

**Comando ejecutado:**
```powershell
Get-ChildItem . -Recurse -File | Where-Object { $_.FullName -notmatch '\\(target|node_modules|\.git|dist|__pycache__)\\' -and $_.Name -ne 'migrate_v4_drop_legacy_replay.py' } | Select-String -Pattern '\.is_key_used\(', '\.mark_key_used\(', '\bused_key_hashes\b'
```
**Resultado:**
`Cero coincidencias.` (El archivo ADR fue ajustado para evitar literales falsos positivos).

## 2. Verificación de Migración DDL

**Comando ejecutado:**
```powershell
Select-String -Path .\migrate_v4_drop_legacy_replay.py -Pattern 'DROP\s+TABLE\s+IF\s+EXISTS\s+used_key_hashes'
```
**Resultado:**
```text
migrate_v4_drop_legacy_replay.py:41:            cursor.execute("DROP TABLE IF EXISTS used_key_hashes")
```
*(Exactamente 1 coincidencia esperada).*

## 3. Verificación de Bundle Frontend (`dist`)

Se generó una compilación limpia (`npm ci` seguido de `npm run build`), certificando que el nuevo código de React/JS ya no hace referencia a las variables antiguas.

**Comando ejecutado:**
```powershell
Get-ChildItem .\frontend\dist -Recurse -File | Select-String -Pattern '\bused_key_hashes\b', '\.is_key_used\(', '\.mark_key_used\('
```
**Resultado:**
`Cero coincidencias.`

## 4. Garantías de Semántica de Relay

1. **At-Most-Once / Fail-Closed**: En `api.py` el `global_registry.commit_relay_nonce` se ejecuta *antes* del encolamiento en RAM (`blind_relay.relay_blob`). Si el proceso cae intermitentemente, el claim SQL queda consumido y el mensaje en RAM se pierde, garantizando que un reintento sea rechazado.
2. **Acoplamiento DAO Documentado**: `count_consumed_replay_claims` en `db_connection.py` fue ajustado a `SELECT COUNT(*) FROM replay_claims WHERE state = 'consumed'` justificando su dependencia de lectura hacia el esquema de Rust para uso estadístico.
3. **Control de Versiones**: Se clarificó la migración `v4` de Python frente al estricto `hermes_schema_version = 1` del crate Rust.
