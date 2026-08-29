/* @ts-self-types="./hermes_crypto_wasm.d.ts" */

export class HermesCore {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HermesCoreFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hermescore_free(ptr, 0);
    }
    /**
     * Receptor: Procesa saludo inicial X3DH e inicializa transaccionalmente la sesión Double Ratchet en WASM
     * @param {string} contact_id
     * @param {string} handshake_json
     * @returns {boolean}
     */
    accept_session_handshake(contact_id, handshake_json) {
        const ptr0 = passStringToWasm0(contact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(handshake_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_accept_session_handshake(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * Backup de bóveda
     * @returns {Uint8Array}
     */
    backup() {
        const ret = wasm.hermescore_backup(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Cierra sesión y zeroiza la RAM de WASM.
     */
    close_session() {
        wasm.hermescore_close_session(this.__wbg_ptr);
    }
    /**
     * Firma localmente el desafío del WebSocket con la llave privada Ed25519
     * @param {string} challenge
     * @param {string} sk_hex
     * @returns {string}
     */
    compute_admin_sig(challenge, sk_hex) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(challenge, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(sk_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.hermescore_compute_admin_sig(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Crear llave de grupo (FAIL-CLOSED: retorna error explícito hasta integración formal)
     * @param {string} _group_id
     * @param {Array<any>} _member_ids
     * @returns {Uint8Array}
     */
    create_group(_group_id, _member_ids) {
        const ptr0 = passStringToWasm0(_group_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_create_group(this.__wbg_ptr, ptr0, len0, _member_ids);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Inicia el Double Ratchet para un contacto
     * @param {string} contact_id
     * @param {boolean} is_alice
     * @param {Uint8Array} remote_pub_key
     * @param {Uint8Array | null} [shared_secret_opt]
     * @param {Uint8Array | null} [local_sk_opt]
     * @param {Uint8Array | null} [local_pub_opt]
     * @returns {boolean}
     */
    create_session(contact_id, is_alice, remote_pub_key, shared_secret_opt, local_sk_opt, local_pub_opt) {
        const ptr0 = passStringToWasm0(contact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(remote_pub_key, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(shared_secret_opt) ? 0 : passArray8ToWasm0(shared_secret_opt, wasm.__wbindgen_malloc);
        var len2 = WASM_VECTOR_LEN;
        var ptr3 = isLikeNone(local_sk_opt) ? 0 : passArray8ToWasm0(local_sk_opt, wasm.__wbindgen_malloc);
        var len3 = WASM_VECTOR_LEN;
        var ptr4 = isLikeNone(local_pub_opt) ? 0 : passArray8ToWasm0(local_pub_opt, wasm.__wbindgen_malloc);
        var len4 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_create_session(this.__wbg_ptr, ptr0, len0, is_alice, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        return ret !== 0;
    }
    /**
     * Emisor: Ejecuta X3DH e inicializa transaccionalmente la sesión Double Ratchet en WASM
     * @param {string} contact_id
     * @param {string} bundle_json
     * @returns {string}
     */
    create_session_from_bundle(contact_id, bundle_json) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(contact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(bundle_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.hermescore_create_session_from_bundle(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Descifrar datos de la bóveda (backup).
     * Si opt_password se provee, deriva la VaultKey desde el salt del backup.
     * Si es nulo, asume que la bóveda está desbloqueada y usa la VaultKey en memoria.
     * @param {Uint8Array} payload
     * @param {string | null} [opt_password]
     * @returns {Uint8Array}
     */
    decrypt_backup(payload, opt_password) {
        const ptr0 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(opt_password) ? 0 : passStringToWasm0(opt_password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_decrypt_backup(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Descifra una imagen efímera de grupo recuperada del endpoint de custodia
     * temporal del servidor (EphemeralImageStore/ImageEncryptor -- ver BACKLOG.md:
     * excepción consciente y acotada al modelo zero-knowledge general, solo para
     * imágenes efímeras de GRUPO). AES-256-GCM plano, clave/nonce/ciphertext en hex.
     * @param {string} key_hex
     * @param {string} nonce_hex
     * @param {string} ciphertext_hex
     * @returns {Uint8Array}
     */
    decrypt_group_ephemeral_image(key_hex, nonce_hex, ciphertext_hex) {
        const ptr0 = passStringToWasm0(key_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(nonce_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(ciphertext_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_decrypt_group_ephemeral_image(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v4;
    }
    /**
     * Descifrar mensaje de grupo (FAIL-CLOSED)
     * @param {string} _group_id
     * @param {Uint8Array} _ciphertext
     * @returns {string}
     */
    decrypt_group_message(_group_id, _ciphertext) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(_group_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(_ciphertext, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.hermescore_decrypt_group_message(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Descifra un chunk de la base de datos local (IndexedDB) con la vault_key real.
     * @param {Uint8Array} payload
     * @returns {string}
     */
    decrypt_local_database_chunk(payload) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.hermescore_decrypt_local_database_chunk(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Descifra un mensaje 1:1
     * @param {string} contact_id
     * @param {Uint8Array} ciphertext_json
     * @returns {string}
     */
    decrypt_message(contact_id, ciphertext_json) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(contact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(ciphertext_json, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.hermescore_decrypt_message(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Descifra el payload del backup local utilizando la frase de recuperación
     * @param {string} mnemonic
     * @param {string} user_id_hash
     * @param {Uint8Array} data
     * @returns {Uint8Array}
     */
    decrypt_with_recovery_key(mnemonic, user_id_hash, data) {
        const ptr0 = passStringToWasm0(mnemonic, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(user_id_hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_decrypt_with_recovery_key(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v4;
    }
    /**
     * Deriva la clave raíz del backup desde la frase mnemónica, separada por
     * cuenta (user_id_hash entra al salt de HKDF) — antes el salt era fijo y
     * el mismo mnemónico derivaba la misma clave para cualquier cuenta del
     * sistema, sin separación de dominio entre usuarios.
     * @param {string} mnemonic
     * @param {string} user_id_hash
     * @returns {Uint8Array}
     */
    derive_recovery_key(mnemonic, user_id_hash) {
        const ptr0 = passStringToWasm0(mnemonic, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(user_id_hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_derive_recovery_key(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Deriva un "proof" a partir de la misma frase mnemónica, seguro de
     * compartir con el servidor (relay ciego) para autenticar la
     * recuperación de un dispositivo perdido SIN sesión previa. Usa el mismo
     * HKDF que derive_recovery_key pero con un `info` distinto — por
     * construcción de HKDF-Expand, conocer este proof no revela nada sobre
     * la clave de cifrado del backup (son salidas independientes de la
     * misma clave maestra intermedia).
     * @param {string} mnemonic
     * @param {string} user_id_hash
     * @returns {Uint8Array}
     */
    derive_recovery_proof(mnemonic, user_id_hash) {
        const ptr0 = passStringToWasm0(mnemonic, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(user_id_hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_derive_recovery_proof(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Genera un hash criptográfico (SHA-256 o SHA-512)
     * @param {string} algorithm
     * @param {Uint8Array} data
     * @returns {Uint8Array}
     */
    digest(algorithm, data) {
        const ptr0 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_digest(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Cifrar datos de la bóveda (backup) utilizando la llave maestra en memoria
     * @param {Uint8Array} plaintext
     * @returns {Uint8Array}
     */
    encrypt_backup(plaintext) {
        const ptr0 = passArray8ToWasm0(plaintext, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_encrypt_backup(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Cifrar mensaje de grupo (FAIL-CLOSED: prohíbe simulación de cifrado devolviendo texto en claro)
     * @param {string} _group_id
     * @param {string} _plaintext
     * @returns {Uint8Array}
     */
    encrypt_group_message(_group_id, _plaintext) {
        const ptr0 = passStringToWasm0(_group_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(_plaintext, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_encrypt_group_message(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Cifra un chunk de la base de datos local (IndexedDB) con la vault_key real del
     * usuario (derivada con Argon2id en unlock_vault), nunca una clave pública fija.
     * @param {string} plaintext_json
     * @returns {Uint8Array}
     */
    encrypt_local_database_chunk(plaintext_json) {
        const ptr0 = passStringToWasm0(plaintext_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_encrypt_local_database_chunk(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Cifra un mensaje 1:1
     * @param {string} contact_id
     * @param {string} plaintext
     * @returns {Uint8Array}
     */
    encrypt_message(contact_id, plaintext) {
        const ptr0 = passStringToWasm0(contact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(plaintext, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_encrypt_message(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Cifra el payload del backup local de manera hermética con XChaCha20Poly1305
     * @param {string} mnemonic
     * @param {string} user_id_hash
     * @param {Uint8Array} data
     * @returns {Uint8Array}
     */
    encrypt_with_recovery_key(mnemonic, user_id_hash, data) {
        const ptr0 = passStringToWasm0(mnemonic, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(user_id_hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_encrypt_with_recovery_key(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v4;
    }
    /**
     * Exporta el estado serializado en JSON de la sesión Double Ratchet de un contacto.
     * @param {string} contact_id
     * @returns {string}
     */
    export_ratchet_state(contact_id) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(contact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.hermescore_export_ratchet_state(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Genera las llaves de Identidad localmente en WASM (ML-KEM-1024 y Ed25519 -- los
     * campos siguen usando los prefijos kyber_ y sphincs_ por convención histórica del
     * resto del código, no porque uses esos algoritmos; ver kyber_manager.py y
     * sphincs_manager.py para la misma convención del lado servidor/nativo).
     * @returns {string}
     */
    generate_identity_keys() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.hermescore_generate_identity_keys(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Genera una frase mnemónica BIP39 real de 12 palabras: 128 bits de
     * entropía + 4 bits de checksum (SHA-256) = 132 bits, empacados en 12
     * grupos de 11 bits que indexan la wordlist estándar de 2048 palabras.
     * @returns {string}
     */
    generate_mnemonic() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.hermescore_generate_mnemonic(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Generar o regenerar el paquete de pre-claves X3DH para publicar en el servidor
     * @param {string | null} [opk_id_opt]
     * @returns {string}
     */
    generate_prekey_bundle(opk_id_opt) {
        let deferred3_0;
        let deferred3_1;
        try {
            var ptr0 = isLikeNone(opk_id_opt) ? 0 : passStringToWasm0(opk_id_opt, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len0 = WASM_VECTOR_LEN;
            const ret = wasm.hermescore_generate_prekey_bundle(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Genera un salt aleatorio de 16 bytes para la bóveda local (Argon2id)
     * @returns {string}
     */
    generate_vault_salt() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.hermescore_generate_vault_salt(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Importa un estado serializado en JSON de la sesión Double Ratchet de un contacto.
     * @param {string} contact_id
     * @param {string} state_json
     * @returns {boolean}
     */
    import_ratchet_state(contact_id, state_json) {
        const ptr0 = passStringToWasm0(contact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(state_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_import_ratchet_state(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    constructor() {
        const ret = wasm.hermescore_new();
        this.__wbg_ptr = ret;
        HermesCoreFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Abre un mensaje sellado con `seal_for_contact` usando la clave de decapsulación
     * local (la semilla ML-KEM de 64 bytes devuelta por generate_identity_keys).
     * @param {string} local_kyber_sk_hex
     * @param {string} sealed_json
     * @returns {Uint8Array}
     */
    open_from_contact(local_kyber_sk_hex, sealed_json) {
        const ptr0 = passStringToWasm0(local_kyber_sk_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(sealed_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_open_from_contact(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Restaurar bóveda
     * @param {Uint8Array} _blob
     * @param {string} _password
     * @returns {boolean}
     */
    restore(_blob, _password) {
        const ptr0 = passArray8ToWasm0(_blob, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(_password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_restore(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * Rotar llave de grupo (FAIL-CLOSED)
     * @param {string} _group_id
     * @returns {Uint8Array}
     */
    rotate_group_key(_group_id) {
        const ptr0 = passStringToWasm0(_group_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_rotate_group_key(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Sella `plaintext` para que solo el titular de `recipient_kyber_pk_hex` pueda abrirlo.
     * ML-KEM-1024 (encapsulate) -> HKDF-SHA512 -> AES-256-GCM, tal como documenta
     * docs/ARCHITECTURE.md. Operación transaccional completa (AGENTS.md): no expone
     * encapsulate/derive_key como primitivas sueltas hacia JS.
     * @param {string} recipient_kyber_pk_hex
     * @param {Uint8Array} plaintext
     * @returns {string}
     */
    seal_for_contact(recipient_kyber_pk_hex, plaintext) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(recipient_kyber_pk_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(plaintext, wasm.__wbindgen_malloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.hermescore_seal_for_contact(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Desbloquea la bóveda (deriva llave maestra desde contraseña con Argon2id)
     * @param {string} password
     * @param {string} salt_hex
     * @returns {boolean}
     */
    unlock_vault(password, salt_hex) {
        const ptr0 = passStringToWasm0(password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(salt_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_unlock_vault(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * Verifica Safety Number
     * @param {string} _contact_id
     * @param {string} _fingerprint
     * @returns {boolean}
     */
    verify_identity(_contact_id, _fingerprint) {
        const ptr0 = passStringToWasm0(_contact_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(_fingerprint, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescore_verify_identity(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
}
if (Symbol.dispose) HermesCore.prototype[Symbol.dispose] = HermesCore.prototype.free;

export class HermesCrypto {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HermesCryptoFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hermescrypto_free(ptr, 0);
    }
    /**
     * Comparación en tiempo constante usando `constant_time_eq` (crate auditada).
     *
     * CRÍTICO: No usar `==` para comparar MACs, tokens o claves —
     * siempre usar esta función.
     * @param {Uint8Array} a
     * @param {Uint8Array} b
     * @returns {boolean}
     */
    constant_time_compare(a, b) {
        const ptr0 = passArray8ToWasm0(a, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(b, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescrypto_constant_time_compare(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
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
     * @param {Uint8Array} a
     * @param {Uint8Array} b
     * @returns {Uint8Array}
     */
    constant_time_xor(a, b) {
        const ptr0 = passArray8ToWasm0(a, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(b, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermescrypto_constant_time_xor(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
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
     * @param {Uint8Array} ciphertext_with_nonce
     * @returns {Uint8Array | undefined}
     */
    decrypt_aead(ciphertext_with_nonce) {
        const ptr0 = passArray8ToWasm0(ciphertext_with_nonce, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hermescrypto_decrypt_aead(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
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
     * @param {Uint8Array} plaintext
     * @returns {Uint8Array}
     */
    encrypt_aead(plaintext) {
        const ptr0 = passArray8ToWasm0(plaintext, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hermescrypto_encrypt_aead(this.__wbg_ptr, ptr0, len0);
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Retorna el tamaño de clave XChaCha20 en bytes (siempre 32).
     * @returns {number}
     */
    static key_size_bytes() {
        const ret = wasm.hermescrypto_key_size_bytes();
        return ret >>> 0;
    }
    /**
     * Constructor: genera clave aleatoria via OsRng.
     * La clave nunca sale de esta estructura — solo se usa internamente.
     */
    constructor() {
        const ret = wasm.hermescrypto_new();
        this.__wbg_ptr = ret;
        HermesCryptoFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Rota la clave AES principal.
     * Genera una nueva clave y zeroiza la anterior para proveer PFS real
     * incluso si la sesión no avanza el ratchet.
     */
    rotate_key() {
        wasm.hermescrypto_rotate_key(this.__wbg_ptr);
    }
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
     * @param {Uint8Array} data
     * @returns {boolean}
     */
    secure_zeroize(data) {
        var ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.hermescrypto_secure_zeroize(this.__wbg_ptr, ptr0, len0, data);
        return ret !== 0;
    }
}
if (Symbol.dispose) HermesCrypto.prototype[Symbol.dispose] = HermesCrypto.prototype.free;

/**
 * Wrapper exportado a WASM del motor unificado Hermes Core.
 * Constituye el único punto de entrada para que JavaScript o clientes nativos
 * interactúen con la persistencia y criptografía del dominio.
 */
export class HermesEngineWasm {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HermesEngineWasmFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hermesenginewasm_free(ptr, 0);
    }
    /**
     * @param {any} encrypted_package
     * @param {string} session_key_hex
     * @returns {string}
     */
    decrypt_legacy_payload(encrypted_package, session_key_hex) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(session_key_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.hermesenginewasm_decrypt_legacy_payload(this.__wbg_ptr, encrypted_package, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {string} text
     * @param {string} session_key_hex
     * @param {string} sender_id
     * @param {string} receiver_id
     * @returns {any}
     */
    encrypt_legacy_payload(text, session_key_hex, sender_id, receiver_id) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(session_key_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(sender_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(receiver_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.hermesenginewasm_encrypt_legacy_payload(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {boolean}
     */
    health_check() {
        const ret = wasm.hermesenginewasm_health_check(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} session_id
     * @param {Uint8Array} shared_secret
     * @param {Uint8Array} remote_pub
     */
    init_conversation(session_id, shared_secret, remote_pub) {
        const ptr0 = passStringToWasm0(session_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(shared_secret, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(remote_pub, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.hermesenginewasm_init_conversation(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    constructor() {
        const ret = wasm.hermesenginewasm_new();
        this.__wbg_ptr = ret;
        HermesEngineWasmFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} msg_id
     * @returns {Uint8Array | undefined}
     */
    read_message(msg_id) {
        const ptr0 = passStringToWasm0(msg_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hermesenginewasm_read_message(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * @param {string} session_id
     * @param {Uint8Array} envelope_bytes
     * @returns {Uint8Array}
     */
    receive_message(session_id, envelope_bytes) {
        const ptr0 = passStringToWasm0(session_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(envelope_bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermesenginewasm_receive_message(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * @param {string} session_id
     * @param {Uint8Array} plaintext
     * @returns {Uint8Array}
     */
    send_message(session_id, plaintext) {
        const ptr0 = passStringToWasm0(session_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(plaintext, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.hermesenginewasm_send_message(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
}
if (Symbol.dispose) HermesEngineWasm.prototype[Symbol.dispose] = HermesEngineWasm.prototype.free;

/**
 * Envoltura independiente para Double Ratchet en WASM.
 * Permite instanciar y usar un trinquete directamente en JavaScript (p.ej. desde double_ratchet.js).
 */
export class WasmDoubleRatchet {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmDoubleRatchetFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmdoubleratchet_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} envelope_bytes
     * @param {Uint8Array} aad
     * @returns {Uint8Array}
     */
    decrypt(envelope_bytes, aad) {
        const ptr0 = passArray8ToWasm0(envelope_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(aad, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdoubleratchet_decrypt(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * @param {Uint8Array} plaintext
     * @param {Uint8Array} aad
     * @returns {Uint8Array}
     */
    encrypt(plaintext, aad) {
        const ptr0 = passArray8ToWasm0(plaintext, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(aad, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdoubleratchet_encrypt(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * @param {Uint8Array} shared_secret
     * @param {Uint8Array} remote_pub
     */
    constructor(shared_secret, remote_pub) {
        const ptr0 = passArray8ToWasm0(shared_secret, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(remote_pub, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmdoubleratchet_new(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmDoubleRatchetFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmDoubleRatchet.prototype[Symbol.dispose] = WasmDoubleRatchet.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_4db0cbe2cc60dbee: function(arg0, arg1, arg2) {
            new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_is_function_1ff95bcc5517c252: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_a27215656b807791: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_ea5e6cc2e4141dfe: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_c05833b95a3cf397: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_number_get_394265ed1e1b84ee: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_b0ca35b86a603356: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_a6e5c5dce5018821: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_getRandomValues_cc7f052a444bb2ce: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_get_78f252d074a84d0b: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_length_1f0964f4a5e2c6d8: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_da52cf8fe3429cb2: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_with_length_e6785c33c8e4cce8: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_now_86c0d4ba3fa605b8: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_4770620bbe4688a0: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_set_8535240470bf2500: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_static_accessor_GLOBAL_4ef717fb391d88b7: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_8d1badc68b5a74f4: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_146583524fe1469b: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_f2829a2234d7819e: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_3ed232c8a6baee09: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./hermes_crypto_wasm_bg.js": import0,
    };
}

const HermesCoreFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_hermescore_free(ptr, 1));
const HermesCryptoFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_hermescrypto_free(ptr, 1));
const HermesEngineWasmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_hermesenginewasm_free(ptr, 1));
const WasmDoubleRatchetFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmdoubleratchet_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('hermes_crypto_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
