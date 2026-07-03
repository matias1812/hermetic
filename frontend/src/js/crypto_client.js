// crypto_client.js
import { hermesBridge } from './crypto_wasm_bridge.js';
export class CryptoClient {
    static async encryptPayload(text, receiverKyberPkHex, senderSphincsSkHex, sessionKeyHex, senderId, receiverId) {
        const encoder = new TextEncoder();
        const ptBytes = encoder.encode(text);
        const ptHex = Array.from(ptBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        const res = await fetch("/api/encrypt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                plaintext_hex: ptHex,
                receiver_kyber_pk_hex: receiverKyberPkHex,
                sender_sphincs_sk_hex: senderSphincsSkHex,
                session_key_hex: sessionKeyHex,
                sender_id: senderId,
                receiver_id: receiverId
            })
        });

        if (!res.ok) throw new Error("Fallo en cifrado.");
        return await res.json();
    }

    static async decryptPayload(encryptedPackage, receiverKyberSkHex, senderSphincsPkHex, sessionKeyHex) {
        const res = await fetch("/api/decrypt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                encrypted_package: encryptedPackage,
                receiver_kyber_sk_hex: receiverKyberSkHex,
                sender_sphincs_pk_hex: senderSphincsPkHex,
                session_key_hex: sessionKeyHex
            })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Fallo en descifrado.");
        }
        const data = await res.json();
        return data.plaintext;
    }

    static async signChallenge(challenge, sphincsSkHex) {
        return hermesBridge.computeAdminSig(challenge, sphincsSkHex);
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
