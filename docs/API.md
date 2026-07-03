# API Pública - HermesBridge (FFI)

## Funciones

### Gestión de Sesión
```rust
fn unlock(password: &str) -> Result<SessionHandle, CryptoError>
fn lock(session: SessionHandle) -> Result<(), CryptoError>
```

### Mensajería
```rust
fn seal_message(session: &SessionHandle, plaintext: &[u8], recipient: &str) -> Result<Vec<u8>, CryptoError>
fn open_message(session: &SessionHandle, ciphertext: &[u8]) -> Result<Vec<u8>, CryptoError>
```

### Backups
```rust
fn backup(session: &SessionHandle) -> Result<Vec<u8>, CryptoError>
fn restore(session: &SessionHandle, backup_data: &[u8]) -> Result<(), CryptoError>
```

### Garantías del FFI
- JavaScript nunca deriva secretos
- JavaScript nunca calcula Root Keys
- JavaScript nunca ejecuta Double Ratchet
- Rust devuelve únicamente datos autorizados
- Zeroize en todas las estructuras sensibles
- Errores criptográficos → Fail-Closed
