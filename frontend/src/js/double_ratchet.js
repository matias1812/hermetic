// frontend/src/js/double_ratchet.js
import { hermesBridge } from './crypto_wasm_bridge.js';
import { MemorySanitizer } from './memory_sanitizer.js';

export class RealDoubleRatchet {
    /**
     * Double Ratchet 100% confinado en WASM (Rust) vía HermesBridge - Fase 4 ADR-005.
     * - Ninguna clave privada, clave de cadena ni estado criptográfico reside en JavaScript.
     * - Operaciones delegadas exclusivamente a hermesBridge.sealMessage/openMessage.
     */
    constructor(contactId = null) {
        this.contactId = contactId || ('ratchet_' + Math.random().toString(36).substring(2, 11));
        this.isWasmMode = false;
    }
    
    async init(skBytes, pkBytes, isAlice, sharedSecretOpt = null) {
        if (!hermesBridge.ready) {
            await hermesBridge.init();
        }
        
        const parseToUint8Array = (input) => {
            if (!input) return null;
            if (typeof input === 'string') {
                const cleanHex = input.replace(/[^0-9a-fA-F]/g, '');
                if (cleanHex.length % 2 === 0 && cleanHex.length > 0) {
                    return new Uint8Array(cleanHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                }
            }
            if (input instanceof ArrayBuffer) return new Uint8Array(input);
            if (input instanceof Uint8Array) return input;
            return new Uint8Array(input);
        };

        const remotePk = parseToUint8Array(pkBytes);
        const localSk = parseToUint8Array(skBytes);
        
        let sharedSecretBytes = null;
        if (sharedSecretOpt) {
            if (typeof sharedSecretOpt === 'string') {
                const cleanHex = sharedSecretOpt.replace(/[^0-9a-fA-F]/g, '');
                if (cleanHex.length === 64) {
                    sharedSecretBytes = new Uint8Array(cleanHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                }
            } else if (sharedSecretOpt instanceof ArrayBuffer) {
                sharedSecretBytes = new Uint8Array(sharedSecretOpt);
            } else if (sharedSecretOpt instanceof Uint8Array) {
                sharedSecretBytes = new Uint8Array(sharedSecretOpt);
            }
        }
        
        // Delegar absolutamente todo a Rust: no hay deriveDH en JS, Rust genera claves epímeras si es necesario.
        const ok = hermesBridge.createSession(this.contactId, isAlice, remotePk, sharedSecretBytes, localSk, null);
        if (!ok) {
            throw new Error("Failed to create DoubleRatchet session in HermesCore");
        }
        this.isWasmMode = true;

        if (localSk) MemorySanitizer.zeroizeArray(localSk);
        if (sharedSecretBytes) MemorySanitizer.zeroizeArray(sharedSecretBytes);
    }

    async encryptMessage(plaintext, aad = '') {
        if (!this.isWasmMode) throw new Error("DoubleRatchet not initialized");
        const rawBytes = hermesBridge.sealMessage(this.contactId, plaintext);
        if (!rawBytes || rawBytes.length === 0) {
            throw new Error("sealMessage returned empty output");
        }
        const encMsg = JSON.parse(new TextDecoder().decode(rawBytes));
        
        const headerIv = encMsg.header.slice(0, 24);
        const headerCipher = encMsg.header.slice(24);

        return {
            header: {
                ciphertext: headerCipher,
                iv: headerIv
            },
            ciphertext: encMsg.ciphertext,
            iv: encMsg.nonce,
            message_number: encMsg.message_number
        };
    }
    
    async decryptMessage(message, aad = '') {
        if (!this.isWasmMode) throw new Error("DoubleRatchet not initialized");
        const headerIvBytes = message.header.iv instanceof Uint8Array ? Array.from(message.header.iv) : (message.header.iv || []);
        const headerCipherBytes = message.header.ciphertext instanceof Uint8Array ? Array.from(message.header.ciphertext) : (message.header.ciphertext || []);
        const ctBytes = message.ciphertext instanceof Uint8Array ? Array.from(message.ciphertext) : (message.ciphertext || []);
        const nonceBytes = message.iv instanceof Uint8Array ? Array.from(message.iv) : (message.iv || []);

        const headerCombined = headerIvBytes.concat(headerCipherBytes);
        const encMsg = {
            header: headerCombined,
            ciphertext: ctBytes,
            nonce: nonceBytes,
            message_number: message.message_number || 0
        };
        const inputBytes = new TextEncoder().encode(JSON.stringify(encMsg));
        const plaintextStr = hermesBridge.openMessage(this.contactId, inputBytes);
        if (typeof plaintextStr !== 'string') {
            throw new Error("Decryption failed in HermesCore");
        }
        return plaintextStr;
    }

    async loadState(stateJson) {
        if (!hermesBridge.ready) {
            await hermesBridge.init();
        }
        const ok = hermesBridge.importRatchetState(this.contactId, stateJson);
        if (!ok) {
            throw new Error("Failed to import DoubleRatchet session in HermesCore");
        }
        this.isWasmMode = true;
    }

    async exportState() {
        if (!this.isWasmMode) throw new Error("DoubleRatchet not initialized");
        return hermesBridge.exportRatchetState(this.contactId);
    }

    exportPublicKey() {
        return null;
    }

    close() {
        this.isWasmMode = false;
    }
}

if (typeof window !== "undefined") {
    window.RealDoubleRatchet = RealDoubleRatchet;
}
