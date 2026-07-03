// frontend/src/js/ephemeral_sync.js
import { state } from './state.js';

export class EphemeralSyncManager {
    /**
     * Sincronizador de destrucción de contenido efímero.
     * 
     * GARANTÍAS:
     * - Emisor y receptor ven la destrucción al mismo tiempo
     * - El timer comienza cuando el RECEPTOR abre la imagen
     * - Si el receptor nunca la abre, se destruye por TTL máximo (5 min)
     * - Notificación de destrucción via WebSocket
     */
    
    constructor() {
        this.ephemeralRegistry = new Map();
        this.EPHEMERAL_MAX_TTL = 300000; // 5 minutos máximo
    }
    
    async sendEphemeralImage(imageBlob, recipientId, durationSeconds) {
        const imageId = crypto.randomUUID();
        const expiryTimestamp = Date.now() + (durationSeconds * 1000);
        
        // 1. Registrar localmente (emisor)
        this.ephemeralRegistry.set(imageId, {
            id: imageId,
            senderId: state.storage.getUserId(),
            recipientId: recipientId,
            duration: durationSeconds,
            expiry: expiryTimestamp,
            status: 'sent',
            viewedByRecipient: false
        });
        
        // Guardar imagen en IndexedDB efímero
        if (state.mediaStorage) {
            await state.mediaStorage.saveImage(imageId, imageBlob, true);
        }
        
        // 2. Iniciar timer de destrucción de seguridad para el EMISOR
        this.scheduleDestruction(imageId, durationSeconds);
        
        return {
            imageId,
            duration: durationSeconds,
            expiryTimestamp
        };
    }
    
    async receiveEphemeralImage(data) {
        const { image_id, sender_id, duration, expiry_timestamp } = data;
        
        // Registrar localmente (receptor)
        this.ephemeralRegistry.set(image_id, {
            id: image_id,
            senderId: sender_id,
            recipientId: state.storage.getUserId(),
            duration: duration,
            expiry: expiry_timestamp || (Date.now() + duration * 1000),
            status: 'received',
            viewedByRecipient: false
        });
        
        return image_id;
    }
    
    async markAsViewed(imageId) {
        const entry = this.ephemeralRegistry.get(imageId);
        if (!entry) return;
        
        // 1. Marcar como vista
        entry.viewedByRecipient = true;
        entry.viewedAt = Date.now();
        
        // 2. Iniciar timer de destrucción para el RECEPTOR
        const remainingTime = Math.max(0, entry.expiry - Date.now());
        this.scheduleDestruction(imageId, remainingTime / 1000);
        
        // 3. Notificar al emisor que la imagen fue vista vía WebSocket
        await this.notifySenderViewed(imageId);
    }
    
    async notifySenderViewed(imageId) {
        if (state.sync && state.sync.ws && state.sync.ws.readyState === WebSocket.OPEN) {
            state.sync.ws.send(JSON.stringify({
                type: 'ephemeral_viewed',
                image_id: imageId,
                viewed_by: state.storage.getUserId(),
                viewed_at: Date.now()
            }));
        }
    }
    
    async handleSenderNotification(data) {
        const { image_id } = data;
        const entry = this.ephemeralRegistry.get(image_id);
        
        if (entry && entry.senderId === state.storage.getUserId()) {
            entry.viewedByRecipient = true;
            const bubble = document.querySelector(`[data-ephemeral-id="${image_id}"]`);
            if (bubble) {
                bubble.classList.add('border-terminalGreen');
            }
        }
    }
    
    scheduleDestruction(imageId, durationSeconds) {
        const delayMs = durationSeconds * 1000;
        setTimeout(() => {
            this.destroyImage(imageId);
        }, delayMs);
    }
    
    destroyImage(imageId) {
        const entry = this.ephemeralRegistry.get(imageId);
        if (!entry) return;
        
        // 1. Eliminar blob de IndexedDB
        if (state.mediaStorage) {
            state.mediaStorage.deleteImage(imageId);
        }
        
        // 2. Eliminar burbuja del DOM con animación
        const bubble = document.querySelector(`[data-ephemeral-id="${imageId}"]`);
        if (bubble) {
            bubble.classList.add('opacity-0', 'transition-opacity', 'duration-500');
            setTimeout(() => bubble.remove(), 500);
        }
        
        // 3. Limpiar registro
        this.ephemeralRegistry.delete(imageId);
        
        // 4. Si es el emisor, notificar destrucción total vía WebSocket
        if (entry.senderId === state.storage.getUserId()) {
            this.notifyDestructionComplete(imageId);
        }
    }
    
    notifyDestructionComplete(imageId) {
        if (state.sync && state.sync.ws && state.sync.ws.readyState === WebSocket.OPEN) {
            state.sync.ws.send(JSON.stringify({
                type: 'ephemeral_destroyed',
                image_id: imageId
            }));
        }
    }
}

export const ephemeralSync = new EphemeralSyncManager();
