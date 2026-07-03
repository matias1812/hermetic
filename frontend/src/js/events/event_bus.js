// frontend/src/js/events/event_bus.js
import { autoBackupTrigger } from '../auto_backup_trigger.js';

export class EventBus {
    /**
     * Bus de Eventos centralizado desacoplado.
     * Convive al 100% con document.dispatchEvent para compatibilidad total hacia atrás.
     */
    
    constructor() {
        this.listeners = new Map();
        this.setupAutoBackupSubscriptions();
    }
    
    emit(event, data = {}) {
        // 1. Notificar a suscriptores internos de EventBus
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => {
            try {
                cb(data);
            } catch (err) {
                console.error(`[EventBus] Error en listener de ${event}:`, err);
            }
        });
        
        // 2. COMPATIBILIDAD: Emitir evento DOM nativo
        try {
            document.dispatchEvent(new CustomEvent(event, { detail: data }));
        } catch (err) {}
    }
    
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        
        // También escuchar en document para capturar emisiones externas antiguas
        document.addEventListener(event, (e) => {
            try {
                callback(e.detail);
            } catch (err) {}
        });
    }
    
    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const filtered = this.listeners.get(event).filter(cb => cb !== callback);
        this.listeners.set(event, filtered);
    }
    
    setupAutoBackupSubscriptions() {
        // Auto-backup intercepta mutaciones críticas vía EventBus
        const backupEvents = [
            'CONTACT_ADDED',
            'CONTACT_REMOVED',
            'GROUP_CREATED',
            'GROUP_JOINED',
            'GROUP_LEFT',
            'KEY_ROTATED'
        ];
        
        backupEvents.forEach(evt => {
            if (!this.listeners.has(evt)) {
                this.listeners.set(evt, []);
            }
            this.listeners.get(evt).push((data) => {
                autoBackupTrigger.triggerBackup(evt.toLowerCase());
            });
        });
    }
}

export const eventBus = new EventBus();
