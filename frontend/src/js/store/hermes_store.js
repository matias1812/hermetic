// frontend/src/js/store/hermes_store.js
import { state } from '../state.js';

export class HermesStore {
    /**
     * Cola de outbox (reintento de envíos offline). sync_manager.js la usa vía
     * window.hermesStore / window.state.store (ninguno de los dos se asignaba
     * antes — el outbox estaba muerto en producción). Persiste sobre el
     * storage real (hermes_kv_store, namespaced por usuario), no sobre una
     * IndexedDB paralela.
     */

    constructor() {
        this.state = {
            outbox: []
        };
        this.listeners = new Map();
    }

    async initialize() {
        this.state.outbox = await state.storage.load('outbox') || [];
        this.notify('store:initialized', this.state);
    }

    async dispatch(action, data) {
        switch (action) {
            case 'OUTBOX_ADDED':
                this.state.outbox.push(data);
                await state.storage.save('outbox', this.state.outbox);
                break;

            case 'OUTBOX_REMOVED':
                this.state.outbox = this.state.outbox.filter(m => m.id !== data.id);
                await state.storage.save('outbox', this.state.outbox);
                break;
        }

        this.notify(action, { newState: this.state, data });
    }

    subscribe(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    notify(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => cb(data));
    }
}

export const hermesStore = new HermesStore();

if (typeof window !== 'undefined') {
    window.hermesStore = hermesStore;
    state.store = hermesStore;
}
