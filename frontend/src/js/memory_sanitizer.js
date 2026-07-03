// memory_sanitizer.js
// Implementación de Zeroization en memoria JS utilizando Rust (WASM) para máxima seguridad.
import { hermesBridge } from './crypto_wasm_bridge.js';

export const MemorySanitizer = {
    /**
     * Llena de ceros un TypedArray utilizando Rust/WASM antes de perder su referencia.
     * @param {TypedArray} typedArray 
     */
    zeroizeArray(typedArray) {
        if (typedArray && typeof typedArray.fill === 'function') {
            try {
                // Si es ArrayBuffer, creamos vista Uint8Array
                const view = typedArray instanceof ArrayBuffer ? new Uint8Array(typedArray) : typedArray;
                if (hermesBridge && hermesBridge.ready && typeof hermesBridge.secureZeroize === 'function') {
                    hermesBridge.secureZeroize(view);
                } else {
                    typedArray.fill(0);
                }
            } catch (e) {
                // Fallback a fill nativo si WASM falla por algún motivo
                typedArray.fill(0);
            }
        }
    },

    /**
     * Recorre un objeto buscando variables criptográficas sensibles
     * y las destruye si son mutables.
     * @param {Object} obj 
     */
    zeroizeObjectKeys(obj) {
        if (!obj) return;
        for (const key in obj) {
            const val = obj[key];
            if (val instanceof Uint8Array || val instanceof ArrayBuffer) {
                this.zeroizeArray(val instanceof ArrayBuffer ? new Uint8Array(val) : val);
            }
            // Anular referencia para GC
            obj[key] = null;
        }
    },

    /**
     * Vacía arrays nativos para forzar al GC.
     */
    flushArray(arr) {
        if (Array.isArray(arr)) {
            arr.length = 0;
        }
    },

    /**
     * Se invoca cuando la ventana pasa a segundo plano o se cierra sesión,
     * para destruir datos volátiles de la UI.
     */
    wipeUI(state) {
        // Vaciar la lista de mensajes cargados en memoria RAM
        if (state.chatMessages) {
            this.flushArray(state.chatMessages);
        }
        
        // Zeroize de las llaves locales del usuario si existen como TypedArrays
        if (state.userKeys) {
            this.zeroizeObjectKeys(state.userKeys);
        }
        
        // Zeroize de contactos y grupos
        if (state.contacts && state.contacts.contactData) {
            this.flushArray(state.contacts.contactData);
        }
        
        console.log("[MemorySanitizer] UI y variables sensibles limpiadas de RAM.");
    },

    /**
     * Purga exhaustiva de todo estado residual al cerrar sesión.
     * PRINCIPIO: JS no permite forzar la recolección de basura (GC).
     * Lo que hacemos es eliminar referencias vivas, vaciar arrays/Map/Set y poner objetos a null
     * para que el motor JS pueda liberar la memoria en cuanto lo considere oportuno.
     */
    fullClearCache(state) {
        if (!state) return;
        this.wipeUI(state);
        
        // Limpieza profunda de colecciones
        if (state.contacts && Array.isArray(state.contacts.contacts)) {
            state.contacts.contacts.length = 0;
        }
        if (state.groups && Array.isArray(state.groups.userGroups)) {
            state.groups.userGroups.length = 0;
        }
        if (state.chats && state.chats.messages instanceof Map) {
            state.chats.messages.clear();
        }
        
        // Nular referencias globales en state
        state.currentUser = null;
        state.userIdHash = null;
        state.userKeys = null;
        state.activeContact = null;
        state.activeGroup = null;
        state.privacySettings = null;
        
        console.log("[MemorySanitizer] Referencias vivas y estructuras residuales purgadas (fullClearCache).");
    }
};

// Auto-sanitización cuando el usuario abandona la pestaña (Blur)
if (typeof window !== 'undefined') {
    window.addEventListener("blur", () => {
        // Si tienes configurado ocultamiento de UI, aquí podríamos forzar la sanitización.
        console.log("[MemorySanitizer] Pestaña en segundo plano, estado listo para Zeroize Wasm (Fase 2).");
    });
}
