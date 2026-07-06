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
        
        const remotePk = pkBytes instanceof ArrayBuffer ? new Uint8Array(pkBytes) : (pkBytes instanceof Uint8Array ? pkBytes : new Uint8Array(pkBytes));
        const localSk = skBytes ? (skBytes instanceof ArrayBuffer ? new Uint8Array(skBytes) : (skBytes instanceof Uint8Array ? skBytes : new Uint8Array(skBytes))) : null;
        
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
        const headerCombined = [...message.header.iv, ...message.header.ciphertext];
        const encMsg = {
            header: headerCombined,
            ciphertext: message.ciphertext,
            nonce: message.iv,
            message_number: message.message_number || 0
        };
        const inputBytes = new TextEncoder().encode(JSON.stringify(encMsg));
        const plaintextStr = hermesBridge.openMessage(this.contactId, inputBytes);
        if (typeof plaintextStr !== 'string') {
            throw new Error("Decryption failed in HermesCore");
        }
        return plaintextStr;
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
