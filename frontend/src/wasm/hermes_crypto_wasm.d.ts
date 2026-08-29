/* tslint:disable */
/* eslint-disable */

export class HermesCore {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Receptor: Procesa saludo inicial X3DH e inicializa transaccionalmente la sesión Double Ratchet en WASM
     */
    accept_session_handshake(contact_id: string, handshake_json: string): boolean;
    /**
     * Backup de bóveda
     */
    backup(): Uint8Array;
    /**
     * Cierra sesión y zeroiza la RAM de WASM.
     */
    close_session(): void;
    /**
     * Firma localmente el desafío del WebSocket con la llave privada Ed25519
     */
    compute_admin_sig(challenge: string, sk_hex: string): string;
    /**
     * Crear llave de grupo (FAIL-CLOSED: retorna error explícito hasta integración formal)
     */
    create_group(_group_id: string, _member_ids: Array<any>): Uint8Array;
    /**
     * Inicia el Double Ratchet para un contacto
     */
    create_session(contact_id: string, is_alice: boolean, remote_pub_key: Uint8Array, shared_secret_opt?: Uint8Array | null, local_sk_opt?: Uint8Array | null, local_pub_opt?: Uint8Array | null): boolean;
    /**
     * Emisor: Ejecuta X3DH e inicializa transaccionalmente la sesión Double Ratchet en WASM
     */
    create_session_from_bundle(contact_id: string, bundle_json: string): string;
    /**
     * Descifrar datos de la bóveda (backup).
     * Si opt_password se provee, deriva la VaultKey desde el salt del backup.
     * Si es nulo, asume que la bóveda está desbloqueada y usa la VaultKey en memoria.
     */
    decrypt_backup(payload: Uint8Array, opt_password?: string | null): Uint8Array;
    /**
     * Descifra una imagen efímera de grupo recuperada del endpoint de custodia
     * temporal del servidor (EphemeralImageStore/ImageEncryptor -- ver BACKLOG.md:
     * excepción consciente y acotada al modelo zero-knowledge general, solo para
     * imágenes efímeras de GRUPO). AES-256-GCM plano, clave/nonce/ciphertext en hex.
     */
    decrypt_group_ephemeral_image(key_hex: string, nonce_hex: string, ciphertext_hex: string): Uint8Array;
    /**
     * Descifrar mensaje de grupo (FAIL-CLOSED)
     */
    decrypt_group_message(_group_id: string, _ciphertext: Uint8Array): string;
    /**
     * Descifra un chunk de la base de datos local (IndexedDB) con la vault_key real.
     */
    decrypt_local_database_chunk(payload: Uint8Array): string;
    /**
     * Descifra un mensaje 1:1
     */
    decrypt_message(contact_id: string, ciphertext_json: Uint8Array): string;
    /**
     * Descifra el payload del backup local utilizando la frase de recuperación
     */
    decrypt_with_recovery_key(mnemonic: string, user_id_hash: string, data: Uint8Array): Uint8Array;
    /**
     * Deriva la clave raíz del backup desde la frase mnemónica, separada por
     * cuenta (user_id_hash entra al salt de HKDF) — antes el salt era fijo y
     * el mismo mnemónico derivaba la misma clave para cualquier cuenta del
     * sistema, sin separación de dominio entre usuarios.
     */
    derive_recovery_key(mnemonic: string, user_id_hash: string): Uint8Array;
    /**
     * Deriva un "proof" a partir de la misma frase mnemónica, seguro de
     * compartir con el servidor (relay ciego) para autenticar la
     * recuperación de un dispositivo perdido SIN sesión previa. Usa el mismo
     * HKDF que derive_recovery_key pero con un `info` distinto — por
     * construcción de HKDF-Expand, conocer este proof no revela nada sobre
     * la clave de cifrado del backup (son salidas independientes de la
     * misma clave maestra intermedia).
     */
    derive_recovery_proof(mnemonic: string, user_id_hash: string): Uint8Array;
    /**
     * Genera un hash criptográfico (SHA-256 o SHA-512)
     */
    digest(algorithm: string, data: Uint8Array): Uint8Array;
    /**
     * Cifrar datos de la bóveda (backup) utilizando la llave maestra en memoria
     */
    encrypt_backup(plaintext: Uint8Array): Uint8Array;
    /**
     * Cifrar mensaje de grupo (FAIL-CLOSED: prohíbe simulación de cifrado devolviendo texto en claro)
     */
    encrypt_group_message(_group_id: string, _plaintext: string): Uint8Array;
    /**
     * Cifra un chunk de la base de datos local (IndexedDB) con la vault_key real del
     * usuario (derivada con Argon2id en unlock_vault), nunca una clave pública fija.
     */
    encrypt_local_database_chunk(plaintext_json: string): Uint8Array;
    /**
     * Cifra un mensaje 1:1
     */
    encrypt_message(contact_id: string, plaintext: string): Uint8Array;
    /**
     * Cifra el payload del backup local de manera hermética con XChaCha20Poly1305
     */
    encrypt_with_recovery_key(mnemonic: string, user_id_hash: string, data: Uint8Array): Uint8Array;
    /**
     * Exporta el estado serializado en JSON de la sesión Double Ratchet de un contacto.
     */
    export_ratchet_state(contact_id: string): string;
    /**
     * Genera las llaves de Identidad localmente en WASM (ML-KEM-1024 y Ed25519 -- los
     * campos siguen usando los prefijos kyber_ y sphincs_ por convención histórica del
     * resto del código, no porque uses esos algoritmos; ver kyber_manager.py y
     * sphincs_manager.py para la misma convención del lado servidor/nativo).
     */
    generate_identity_keys(): string;
    /**
     * Genera una frase mnemónica BIP39 real de 12 palabras: 128 bits de
     * entropía + 4 bits de checksum (SHA-256) = 132 bits, empacados en 12
     * grupos de 11 bits que indexan la wordlist estándar de 2048 palabras.
     */
    generate_mnemonic(): string;
    /**
     * Generar o regenerar el paquete de pre-claves X3DH para publicar en el servidor
     */
    generate_prekey_bundle(opk_id_opt?: string | null): string;
    /**
     * Genera un salt aleatorio de 16 bytes para la bóveda local (Argon2id)
     */
    generate_vault_salt(): string;
    /**
     * Importa un estado serializado en JSON de la sesión Double Ratchet de un contacto.
     */
    import_ratchet_state(contact_id: string, state_json: string): boolean;
    constructor();
    /**
     * Abre un mensaje sellado con `seal_for_contact` usando la clave de decapsulación
     * local (la semilla ML-KEM de 64 bytes devuelta por generate_identity_keys).
     */
    open_from_contact(local_kyber_sk_hex: string, sealed_json: string): Uint8Array;
    /**
     * Restaurar bóveda
     */
    restore(_blob: Uint8Array, _password: string): boolean;
    /**
     * Rotar llave de grupo (FAIL-CLOSED)
     */
    rotate_group_key(_group_id: string): Uint8Array;
    /**
     * Sella `plaintext` para que solo el titular de `recipient_kyber_pk_hex` pueda abrirlo.
     * ML-KEM-1024 (encapsulate) -> HKDF-SHA512 -> AES-256-GCM, tal como documenta
     * docs/ARCHITECTURE.md. Operación transaccional completa (AGENTS.md): no expone
     * encapsulate/derive_key como primitivas sueltas hacia JS.
     */
    seal_for_contact(recipient_kyber_pk_hex: string, plaintext: Uint8Array): string;
    /**
     * Desbloquea la bóveda (deriva llave maestra desde contraseña con Argon2id)
     */
    unlock_vault(password: string, salt_hex: string): boolean;
    /**
     * Verifica Safety Number
     */
    verify_identity(_contact_id: string, _fingerprint: string): boolean;
}

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

/**
 * Wrapper exportado a WASM del motor unificado Hermes Core.
 * Constituye el único punto de entrada para que JavaScript o clientes nativos
 * interactúen con la persistencia y criptografía del dominio.
 */
export class HermesEngineWasm {
    free(): void;
    [Symbol.dispose](): void;
    decrypt_legacy_payload(encrypted_package: any, session_key_hex: string): string;
    encrypt_legacy_payload(text: string, session_key_hex: string, sender_id: string, receiver_id: string): any;
    health_check(): boolean;
    init_conversation(session_id: string, shared_secret: Uint8Array, remote_pub: Uint8Array): void;
    constructor();
    read_message(msg_id: string): Uint8Array | undefined;
    receive_message(session_id: string, envelope_bytes: Uint8Array): Uint8Array;
    send_message(session_id: string, plaintext: Uint8Array): Uint8Array;
}

/**
 * Envoltura independiente para Double Ratchet en WASM.
 * Permite instanciar y usar un trinquete directamente en JavaScript (p.ej. desde double_ratchet.js).
 */
export class WasmDoubleRatchet {
    free(): void;
    [Symbol.dispose](): void;
    decrypt(envelope_bytes: Uint8Array, aad: Uint8Array): Uint8Array;
    encrypt(plaintext: Uint8Array, aad: Uint8Array): Uint8Array;
    constructor(shared_secret: Uint8Array, remote_pub: Uint8Array);
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_hermescore_free: (a: number, b: number) => void;
    readonly hermescore_accept_session_handshake: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly hermescore_backup: (a: number) => [number, number];
    readonly hermescore_close_session: (a: number) => void;
    readonly hermescore_compute_admin_sig: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_create_group: (a: number, b: number, c: number, d: any) => [number, number, number, number];
    readonly hermescore_create_session: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => number;
    readonly hermescore_create_session_from_bundle: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_decrypt_backup: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_decrypt_group_ephemeral_image: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly hermescore_decrypt_group_message: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_decrypt_local_database_chunk: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hermescore_decrypt_message: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_decrypt_with_recovery_key: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly hermescore_derive_recovery_key: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_derive_recovery_proof: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_digest: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_encrypt_backup: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hermescore_encrypt_group_message: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_encrypt_local_database_chunk: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hermescore_encrypt_message: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_encrypt_with_recovery_key: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly hermescore_export_ratchet_state: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hermescore_generate_identity_keys: (a: number) => [number, number, number, number];
    readonly hermescore_generate_mnemonic: (a: number) => [number, number, number, number];
    readonly hermescore_generate_prekey_bundle: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hermescore_generate_vault_salt: (a: number) => [number, number];
    readonly hermescore_import_ratchet_state: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly hermescore_new: () => number;
    readonly hermescore_open_from_contact: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_restore: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly hermescore_rotate_group_key: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hermescore_seal_for_contact: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermescore_unlock_vault: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly hermescore_verify_identity: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly __wbg_hermescrypto_free: (a: number, b: number) => void;
    readonly __wbg_hermesenginewasm_free: (a: number, b: number) => void;
    readonly __wbg_wasmdoubleratchet_free: (a: number, b: number) => void;
    readonly hermescrypto_constant_time_compare: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly hermescrypto_constant_time_xor: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly hermescrypto_decrypt_aead: (a: number, b: number, c: number) => [number, number];
    readonly hermescrypto_encrypt_aead: (a: number, b: number, c: number) => [number, number];
    readonly hermescrypto_key_size_bytes: () => number;
    readonly hermescrypto_new: () => number;
    readonly hermescrypto_rotate_key: (a: number) => void;
    readonly hermescrypto_secure_zeroize: (a: number, b: number, c: number, d: any) => number;
    readonly hermesenginewasm_decrypt_legacy_payload: (a: number, b: any, c: number, d: number) => [number, number, number, number];
    readonly hermesenginewasm_encrypt_legacy_payload: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly hermesenginewasm_health_check: (a: number) => number;
    readonly hermesenginewasm_init_conversation: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly hermesenginewasm_new: () => number;
    readonly hermesenginewasm_read_message: (a: number, b: number, c: number) => [number, number, number, number];
    readonly hermesenginewasm_receive_message: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly hermesenginewasm_send_message: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasmdoubleratchet_decrypt: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasmdoubleratchet_encrypt: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasmdoubleratchet_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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
