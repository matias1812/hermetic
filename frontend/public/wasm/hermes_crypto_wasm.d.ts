/* tslint:disable */
/* eslint-disable */

export class HermesCrypto {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Comparación en tiempo constante usando `constant_time_eq` (crate auditada).
     *
     * CRÍTICO: No usar `==` para comparar MACs, tokens o claves —
     * siempre usar esta función.
     */
    constant_time_compare(a: Uint8Array, b: Uint8Array): boolean;
    /**
     * XOR en tiempo constante (mejor esfuerzo, sin ramas explícitas).
     *
     * Esta implementación EVITA ramas condicionales sobre datos secretos.
     * Sin embargo, el tiempo constante ABSOLUTO no puede garantizarse porque:
     *   - LLVM puede reintroducir ramas durante la optimización
     *   - La microarquitectura de la CPU (branch predictor, speculative execution)
     *     puede introducir variaciones de tiempo observables
     *   - Para garantizar tiempo constante verificado, se requiere análisis
     *     con herramientas como `dudect` o `ctgrind`
     *
     * Para comparaciones de MAC/token/clave, prefer `constant_time_compare`
     * que usa la crate `constant_time_eq` (auditada).
     *
     * # Panics
     * Pánico si `a.len() != b.len()` — no opera con longitudes distintas.
     */
    constant_time_xor(a: Uint8Array, b: Uint8Array): Uint8Array;
    /**
     * Descifrado AES-256-GCM autenticado.
     *
     * Verifica el tag de autenticación antes de retornar plaintext.
     * Si el mensaje fue manipulado, retorna `None` — nunca retorna datos parciales.
     *
     * # Formato de entrada
     * `[nonce (12 bytes) || ciphertext || tag (16 bytes)]`
     *
     * # Retorna
     * - `Some(plaintext)` si el mensaje es auténtico e íntegro
     * - `None` si el tag falla (manipulación detectada) o formato inválido
     */
    decrypt_aead(ciphertext_with_nonce: Uint8Array): Uint8Array | undefined;
    /**
     * Cifrado AES-256-GCM autenticado con nonce aleatorio de 96 bits.
     *
     * Cada llamada genera un nonce único via `OsRng` (CSPRNG del sistema operativo).
     * Esto elimina el riesgo de reutilización de nonce al reiniciar instancias.
     *
     * Formato de salida: `[nonce (12 bytes) || ciphertext || tag (16 bytes)]`
     *
     * # Panics
     * - Si AES-GCM falla internamente (no debería con clave válida)
     * - Si OsRng falla (fallo del sistema operativo — extremadamente raro)
     *
     * # Seguridad
     * Con nonce de 96 bits aleatorio, la probabilidad de colisón después
     * de 2^32 mensajes es ~2^{-32} (birthday bound). Para uso práctico
     * (miles de mensajes por día) esto es seguro.
     */
    encrypt_aead(plaintext: Uint8Array): Uint8Array;
    /**
     * Retorna el tamaño de clave XChaCha20 en bytes (siempre 32).
     */
    static key_size_bytes(): number;
    /**
     * Constructor: genera clave aleatoria via OsRng.
     * La clave nunca sale de esta estructura — solo se usa internamente.
     */
    constructor();
    /**
     * Rota la clave AES principal.
     * Genera una nueva clave y zeroiza la anterior para proveer PFS real
     * incluso si la sesión no avanza el ratchet.
     */
    rotate_key(): void;
    /**
     * Zeroización verificable via SHA3-256.
     *
     * Zeroiza `data` usando la crate `zeroize` (auditada, resiste optimizaciones
     * del compilador y CPU via compilación barrera).
     *
     * Retorna `true` si la zeroización es verificable: hash cambió y todos los
     * bytes son 0.
     *
     * # Seguridad
     * El hash se calcula con SHA3-256 (no SHA-256) para evitar colisiones
     * en preimagen conocida.
     */
    secure_zeroize(data: Uint8Array): boolean;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_hermescrypto_free: (a: number, b: number) => void;
    readonly hermescrypto_constant_time_compare: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly hermescrypto_constant_time_xor: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly hermescrypto_decrypt_aead: (a: number, b: number, c: number) => [number, number];
    readonly hermescrypto_encrypt_aead: (a: number, b: number, c: number) => [number, number];
    readonly hermescrypto_key_size_bytes: () => number;
    readonly hermescrypto_new: () => number;
    readonly hermescrypto_rotate_key: (a: number) => void;
    readonly hermescrypto_secure_zeroize: (a: number, b: number, c: number, d: any) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
