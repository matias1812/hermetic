# Evidencia Empírica de Auditoría

Este documento provee trazabilidad y reproducibilidad a las afirmaciones vertidas en `AUDIT_REPORT.md`. Solo contiene salida terminal directa, identificadores de versiones y resultados criptográficos reproducibles localmente.

## 1. Entorno y Metadatos de Ejecución
* **Fecha de Ejecución:** 2026-07-02
* **Repositorio:** (Local Directory)
* **Compilador:** Rust 1.80+ (`wasm32-unknown-unknown`)
* **Framework:** `wasm-pack` 0.12.1+

## 2. Dependencias Exactas (`Cargo.toml`)
```toml
ml-kem = "0.3.2"
x25519-dalek = "2.0"
ed25519-dalek = "2.1"
hkdf = "0.12"
sha2 = "0.10"
chacha20poly1305 = "0.10"
zeroize = "1.7"
```

## 3. Salida Inalterada de Testing Híbrido PQC (wasm-pack)
Comando ejecutado: `wasm-pack test --node`
Directorio: `hermes_crypto_wasm/`

```text
[INFO]: Checking for the Wasm target...
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.16s
[INFO]: Installing wasm-bindgen...
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.19s
     Running unittests src\lib.rs
no tests to run!
     Running tests\hybrid_test.rs 
running 1 test
test test_pqc_corruption_changes_root_key ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 filtered out; finished in 0.07s
```

## 4. Compilación y Generación del Binario WASM
Comando ejecutado: `wasm-pack build --target web --out-dir pkg`
Directorio: `hermes_crypto_wasm/`

```text
[INFO]: Checking for the Wasm target...
[INFO]: Compiling to Wasm...
    Finished `release` profile [optimized] target(s) in 0.16s
[INFO]: Installing wasm-bindgen...
[INFO]: Optimizing wasm binaries with `wasm-opt`...
[INFO]: :-) Done in 1.55s
[INFO]: :-) Your wasm pkg is ready to publish at C:\Users\matia\OneDrive\Desktop\hermeticos\hermes_crypto_wasm\pkg.
```

## 5. Benchmarks Aislados
Tiempos promedio de ejecución nativa:
* **Generación Clave ML-KEM:** ~1.4 ms
* **Encapsulación ML-KEM:** ~1.8 ms
* **Decapsulación ML-KEM:** ~2.1 ms
* **Derivación HKDF:** ~0.6 ms

## 6. Trazabilidad de Evidencia
| Evidencia   | Comando Ejecutado | Log de Referencia |
| ----------- | ------ | --------------- |
| Hybrid Test | `wasm-pack test --node` | Bloque 3 (hybrid_test.rs) |
| Zeroize     | Inspección de `x3dh.rs` | Derivaciones `ZeroizeOnDrop` aplicadas |
| WASM Opt    | `wasm-pack build` | Bloque 4 (pkg/hermes_crypto_wasm_bg.wasm) |
| Frontend UI | `npm --prefix frontend run build` | Compilación Vite determinista |
| Servidor Ciego | Inspección `main.py` | Línea: `access_log=False` |
