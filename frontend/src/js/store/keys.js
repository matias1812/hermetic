// frontend/src/js/store/keys.js
import { state } from '../state.js';
import { hermesStore } from './hermes_store.js';

export class KeysStoreModule {
    /**
     * Módulo claro para gestión de claves en el Store.
     */
    
    async storeKeyPair(keyData) {
        await hermesStore.dispatch('KEY_GENERATED', keyData);
        if (state.userKeys && keyData.id === 'user_session_keys') {
            Object.assign(state.userKeys, keyData);
        }
        return keyData;
    }
    
    async rotateKey(keyData) {
        await hermesStore.dispatch('KEY_ROTATED', keyData);
        return keyData;
    }
    
    getKey(id) {
        return hermesStore.state.keys[id] || null;
    }
}

export const keysModule = new KeysStoreModule();
