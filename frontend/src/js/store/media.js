// frontend/src/js/store/media.js
import { state } from '../state.js';
import { hermesStore } from './hermes_store.js';

export class MediaStoreModule {
    /**
     * Módulo claro para gestión de medios e imágenes en el Store.
     */
    
    async storeMedia(id, blob, isEphemeral = false) {
        if (state.mediaStorage) {
            await state.mediaStorage.saveImage(id, blob, isEphemeral);
        }
        hermesStore.state.media[id] = { id, size: blob.size, isEphemeral, storedAt: Date.now() };
        return id;
    }
    
    async getMedia(id) {
        if (state.mediaStorage) {
            return await state.mediaStorage.loadImage(id);
        }
        return null;
    }
    
    async removeMedia(id) {
        if (state.mediaStorage) {
            state.mediaStorage.deleteImage(id);
        }
        delete hermesStore.state.media[id];
    }
}

export const mediaModule = new MediaStoreModule();
