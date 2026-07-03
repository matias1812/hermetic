// group_crypto.js
import { state } from './state.js';
import { hermesBridge } from './crypto_wasm_bridge.js';

export class GroupCryptoManager {
    constructor() {
        this.groupKeys = {}; // Delegado internamente a Rust en un sistema real
    }

    async createGroupWithKey(name, description, memberIds) {
        // Rust maneja la generación de claves y exportación de forma segura.
        // Aquí usamos el bridge (que actualiza Rust internamente).
        const currentUserId = state.currentUser ? state.currentUser.alias : 'creator';
        
        // Falla cerrado (FAIL-CLOSED) si no está implementado
        hermesBridge.createGroup(crypto.randomUUID(), memberIds);
        
        return {
            name,
            description,
            creator_id: currentUserId,
            members: [currentUserId, ...memberIds],
            created_at: Date.now()
        };
    }

    async acceptGroupInvite(inviteData) {
        // En una implementación real en Rust, aquí le pasaríamos el handshake de grupo a WASM.
        return inviteData;
    }

    async encryptGroupMessage(groupId, plaintext) {
        // Falla cerrado (FAIL-CLOSED)
        const encrypted = await hermesBridge.encryptGroupMessage(groupId, plaintext);
        return {
            ciphertext: Array.from(encrypted).map(b => b.toString(16).padStart(2, '0')).join(''),
            iv: "000000000000000000000000",
            group_id: groupId
        };
    }

    async decryptGroupMessage(encryptedData) {
        // Falla cerrado (FAIL-CLOSED)
        const ciphertext = new Uint8Array(
            encryptedData.ciphertext.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
        );
        return await hermesBridge.decryptGroupMessage(encryptedData.group_id, ciphertext);
    }

    async encryptGroupBlob(groupId, blob) {
        throw new Error("NotImplemented: Media encryption must go through HermesBridge.encryptMedia()");
    }
}

export const groupCrypto = new GroupCryptoManager();
window.groupCrypto = groupCrypto;
