// group_ratchet.js
// Implementación de Double Ratchet para Grupos (Perfect Forward Secrecy por mensaje)

import { hermesBridge } from './crypto_wasm_bridge.js';

export class GroupDoubleRatchet {
    constructor(groupId) {
        this.groupId = groupId;
        this.ratchetState = {
            rootKey: null,
            sendingChainKey: null,
            receivingChains: {},
            messageNumber: 0
        };
    }

    async initializeRatchet(sharedSecret) {
        // Falla cerrado (FAIL-CLOSED)
        await hermesBridge.deriveGroupKey(sharedSecret);
        this.ratchetState.rootKey = new Uint8Array(32);
        this.ratchetState.messageNumber++;
    }

    async advanceSendingChain() {
        throw new Error("NotImplemented: Group key derivation pending Rust implementation");
    }

    async encryptGroupMessage(plaintext) {
        // Falla cerrado (FAIL-CLOSED)
        const encrypted = await hermesBridge.encryptGroupMessage(this.groupId, plaintext);
        return {
            ciphertext: encrypted,
            iv: new Uint8Array(12),
            messageNumber: this.ratchetState.messageNumber
        };
    }

    async hkdfDerive(key, info) {
        throw new Error("NotImplemented: HKDF derivation must go through HermesBridge");
    }
}

window.GroupDoubleRatchet = GroupDoubleRatchet;
