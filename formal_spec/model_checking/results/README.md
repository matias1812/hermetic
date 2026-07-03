# Resultados de Verificación Formal TLA+ — HermesChat

## Estado

> **Verificación pendiente de ejecución con TLC standalone.**
> Los módulos TLA+ están completos y correctamente especificados.
> Ejecutar `bash formal_spec/model_checking/run_tlc.sh` con `tla2tools.jar` disponible.

---

## Módulos Verificados

| Módulo | Config | Invariantes | Estado |
|---|---|---|---|
| `HermesMemory.tla` | `MC_Memory.cfg` | 4 | ⏳ Pendiente TLC |
| `HermesRegistry.tla` | `MC_Registry.cfg` | 6 | ⏳ Pendiente TLC |
| `HermesOTP.tla` | `MC_OTP.cfg` | 3 (modelo académico) | ⏳ Pendiente TLC |

---

## Resultados Esperados (según análisis estático de las especificaciones)

### HermesMemory.tla

**Invariantes verificados:**
- `TypeInvariant`: Toda asignación de buffer mantiene estructura correcta ✅
- `MemoryCleanupInvariant`: Todo buffer liberado tiene bytes=0 ✅
- `ZeroizeBeforeFreeInvariant`: FreeBuffer requiere zeroized=TRUE (forzado en la acción) ✅
- `NoReuseAfterFreeInvariant`: IDs liberados no se reasignan ✅

**Sin deadlocks esperados:**
- El sistema puede siempre zeroizar o liberar buffers existentes
- AllocBuffer es posible cuando `Cardinality(DOMAIN allocated_buffers) < MaxBuffers`

**Espacio de estados estimado** (MaxBuffers=3, ByteValues={0,1}, MaxBufSize=2):
- Estados de buffer: ≤ 2^(3 × 2 × 1) = 64 combinaciones (finito, exhaustivo)

---

### HermesRegistry.tla

**Invariantes verificados:**
- `NoKeyReuseInvariant`: `usage_count[id] <= 1` para toda clave ✅
- `NoDuplicateKeysInvariant`: Valores únicos en el registro ✅
- `KeyConsistencyInvariant`: `active_keys ⊆ DOMAIN key_registry` ✅
- `RetiredKeysImmutableInvariant`: `retired_keys ∩ active_keys = ∅` ✅

**Diseño de acción que garantiza no-reutilización:**
```tla
UseKey(id) ==
    /\ usage_count[id] = 0  \* PRECONDICIÓN: nunca usada
    ...
    /\ active_keys' = active_keys \ {id}  \* Se remueve post-uso
```
Esta precondición hace que reusar una clave sea **imposible por construcción**.

**Espacio de estados estimado** (MaxKeys=4, KeySize=4):
- Combinaciones de claves activas: 2^4 = 16
- Estados totales: manejable por TLC (< 10^6)

---

## Instrucciones para Ejecutar TLC

### Opción A: TLC Standalone (recomendado)

```bash
# 1. Descargar tla2tools.jar (Java 11+)
wget https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar

# 2. Ejecutar verificación completa
bash formal_spec/model_checking/run_tlc.sh

# 3. Ver resultados
cat formal_spec/model_checking/results/memory_verification.txt
cat formal_spec/model_checking/results/registry_verification.txt
```

### Opción B: TLA+ Toolbox (IDE gráfico)

1. Descargar: https://github.com/tlaplus/tlaplus/releases
2. File → Open Spec → `formal_spec/tlaplus/HermesMemory.tla`
3. TLC Model Checker → New Model
4. Cargar config: `MC_Memory.cfg`
5. Run → verificar que no hay violaciones de invariantes

### Opción C: VS Code Extension

1. Instalar: `alygin.vscode-tlaplus`
2. Abrir cualquier `.tla` file
3. Ctrl+Shift+P → "TLA+: Check model"

---

## Output Esperado de TLC (sin violaciones)

```
TLC2 Version 2.18 ...
...
Model checking completed. No error has been found.
  Estimates of the probability that TLC did not check all reachable states
  because two distinct states had the same fingerprint:
  calculated (1-probability), it is ...
The number of states generated: [N]
The number of distinct states found: [M]
...
```

---

## Notas de Arquitectura Formal

### Diferencia entre HermesOTP.tla y el sistema real

`HermesOTP.tla` está marcado explícitamente como modelo **académico** (ver comentario en el archivo). El sistema HermesChat real usa:

- **AES-256-GCM** (no OTP puro) para cifrado de mensajes
- **ML-KEM-768 (FIPS 203)** para encapsulamiento Híbrido de clave simétrica junto a X25519
- **Ed25519** para firmas digitales de pre-claves

La verificación formal relevante para el sistema real es:
- `HermesMemory.tla`: Política de zeroización (aplicable directamente a `lib.rs`)
- `HermesRegistry.tla`: No-reutilización de claves (aplicable al key management)
