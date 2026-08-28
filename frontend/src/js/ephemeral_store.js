// frontend/src/js/ephemeral_store.js

/**
 * Mensajes/imágenes/audios efímeros: viven SOLO en memoria, nunca tocan
 * disco. Antes pasaban por chats.addMessage() (state.chats, persistido
 * cifrado en hermes_messages) apenas se recibían/enviaban, quedando ahí
 * indefinidamente si la pestaña se cerraba antes de "verlos" — dejaban
 * rastro exactamente en el caso que un mensaje de una sola vista debería
 * evitar. Cerrar o refrescar la pestaña ahora sí los borra de verdad, sin
 * necesitar ningún borrado explícito de storage.
 */
class EphemeralStore {
    constructor() {
        this.byTarget = new Map(); // targetId (contactId o groupId) -> Map(msgId -> msg)
    }

    add(targetId, msg) {
        if (!msg.timestamp_ms) msg.timestamp_ms = Date.now();
        if (!this.byTarget.has(targetId)) this.byTarget.set(targetId, new Map());
        this.byTarget.get(targetId).set(msg.id, msg);
    }

    get(targetId) {
        const m = this.byTarget.get(targetId);
        return m ? Array.from(m.values()) : [];
    }

    find(targetId, msgId) {
        return this.byTarget.get(targetId)?.get(msgId);
    }

    remove(targetId, msgId) {
        this.byTarget.get(targetId)?.delete(msgId);
    }
}

export const ephemeralStore = new EphemeralStore();

const EPHEMERAL_TYPES = new Set(['ephemeral_image', 'ephemeral_audio', 'ephemeral_text']);
export function isEphemeralType(type) {
    return EPHEMERAL_TYPES.has(type);
}
