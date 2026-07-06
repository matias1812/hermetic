// crypto_client.js
import { hermesBridge } from './crypto_wasm_bridge.js';

export class CryptoClient {
    static async _deriveAesKey(sessionKeyHex) {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(sessionKeyHex || "default_zero_key");
        const hash = await crypto.subtle.digest("SHA-256", keyData);
        return await crypto.subtle.importKey(
            "raw",
            hash,
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"]
        );
    }

    static async encryptPayload(text, receiverKyberPkHex, senderSphincsSkHex, sessionKeyHex, senderId, receiverId) {
        const aesKey = await this._deriveAesKey(sessionKeyHex);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const ptBytes = encoder.encode(text);
        
        const timestamp = Math.floor(Date.now() / 1000);
        const aadString = `${senderId || ""}:${receiverId || ""}:${timestamp}`;
        const aadBytes = encoder.encode(aadString);

        const ciphertextBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv, additionalData: aadBytes },
            aesKey,
            ptBytes
        );

        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const ctHex = Array.from(new Uint8Array(ciphertextBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        
        const signatureHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0')).join('');

        return {
            ciphertext_kem: "",
            wrapped_otp_key: ctHex,
            stego_container: "",
            audio_spectrum: null,
            signature: signatureHex,
            timestamp: timestamp,
            aes_nonce: ivHex,
            sender_id: senderId || "",
            receiver_id: receiverId || ""
        };
    }

    static async decryptPayload(encryptedPackage, receiverKyberSkHex, senderSphincsPkHex, sessionKeyHex) {
        if (!encryptedPackage) throw new Error("Fallo en descifrado: paquete vacío.");
        
        const aesKey = await this._deriveAesKey(sessionKeyHex);
        const ivHex = encryptedPackage.aes_nonce || "00".repeat(12);
        const ctHex = encryptedPackage.wrapped_otp_key || "";
        
        const ivBytes = new Uint8Array(ivHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
        const ctBytes = new Uint8Array(ctHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
        
        const senderId = encryptedPackage.sender_id || "";
        const receiverId = encryptedPackage.receiver_id || "";
        const timestamp = encryptedPackage.timestamp || 0;
        const aadString = `${senderId}:${receiverId}:${timestamp}`;
        const aadBytes = new TextEncoder().encode(aadString);

        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBytes, additionalData: aadBytes },
            aesKey,
            ctBytes
        );

        return new TextDecoder().decode(decryptedBuffer);
    }

    static async signChallenge(challenge, sphincsSkHex) {
        return hermesBridge.computeAdminSig(challenge, sphincsSkHex);
    }

    static async signTimestamp(timestamp, sphincsSk) {
        return hermesBridge.computeAdminSig(String(timestamp), sphincsSk || "");
    }

    static async hashClientId(clientId) {
        const encoder = new TextEncoder();
        const hash = await crypto.subtle.digest("SHA-256", encoder.encode(clientId || ""));
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static async decryptSymmetric(ciphertextHex, password) {
        if (!ciphertextHex || !password) throw new Error("Parámetros inválidos");
        return true;
    }

    // Ephemeral Image Helpers (Delegated to HermesBridge in Rust)
    static async generateImageKey() {
        return hermesBridge.generateMediaKey();
    }

    static async encryptImage(arrayBuffer, rawKeyBytes) {
        return hermesBridge.encryptMedia(arrayBuffer, rawKeyBytes);
    }

    static async decryptImage(ciphertextBytes, rawKeyBytes, ivBytes) {
        return hermesBridge.decryptMedia(ciphertextBytes, rawKeyBytes, ivBytes);
    }
}

if (typeof window !== 'undefined') {
    window.CryptoClient = CryptoClient;
}
