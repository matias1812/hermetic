// frontend/src/js/store/hermes_store.js
import { persistenceManager } from '../persistence_manager.js';
import { autoBackupTrigger } from '../auto_backup_trigger.js';

export class HermesStore {
    /**
     * ÚNICA FUENTE DE VERDAD.
     * 
     * REGLAS:
     * 1. Todo cambio → Store → IndexedDB → UI
     * 2. Nunca: UI → Servidor → UI → Memoria
     * 3. IndexedDB es la fuente de verdad local
     * 4. El servidor es solo relay ciego
     */
    
    constructor() {
        this.state = {
            user: null,
            contacts: [],
            groups: [],
            conversations: {},
            messages: {},
            media: {},
            keys: {},
            ratchets: {},
            notifications: [],
            settings: {},
            backup: { lastBackup: null, status: 'unknown' },
            outbox: []
        };
        
        this.db = persistenceManager;
        this.listeners = new Map();
    }
    
    async initialize() {
        await this.db.initialize();
        // Cargar TODO desde IndexedDB
        const [contacts, groups, keys, settings, outbox] = await Promise.all([
            this.db.loadAllContacts(),
            this.db.loadAllGroups(),
            this.db.loadAllKeys(),
            this.db.loadAll('settings'),
            this.db.loadAllOutboxMessages()
        ]);
        
        this.state.contacts = contacts;
        this.state.groups = groups;
        this.state.keys = keys.reduce((acc, k) => ({ ...acc, [k.id]: k }), {});
        this.state.settings = settings[0] || {};
        this.state.outbox = outbox || [];
        
        // Notificar a la UI
        this.notify('store:initialized', this.state);
    }
    
    async dispatch(action, data) {
        return await this.db.withLock('hermes_store_dispatch', 'exclusive', async () => {
            const prevState = { ...this.state };
            
            switch (action) {
                case 'CONTACT_ADDED':
                    this.state.contacts.push(data);
                    await this.db.saveContact(data);
                    break;
                    
                case 'CONTACT_REMOVED':
                    this.state.contacts = this.state.contacts.filter(c => c.id !== data.id && c.alias !== data.id);
                    await this.db.delete('contacts', data.id);
                    break;
                    
                case 'GROUP_CREATED':
                    this.state.groups.push(data);
                    await this.db.saveGroup(data);
                    break;
                    
                case 'GROUP_UPDATED':
                    this.state.groups = this.state.groups.map(g => g.id === data.id ? data : g);
                    await this.db.saveGroup(data);
                    break;
                    
                case 'GROUP_LEFT':
                    this.state.groups = this.state.groups.filter(g => g.id !== data.id);
                    await this.db.delete('groups', data.id);
                    break;
                    
                case 'MESSAGE_SENT':
                case 'MESSAGE_RECEIVED':
                    if (!this.state.messages[data.conversationId]) {
                        this.state.messages[data.conversationId] = [];
                    }
                    this.state.messages[data.conversationId].push(data);
                    await this.db.saveMessage(data);
                    break;
                    
                case 'KEY_GENERATED':
                case 'KEY_ROTATED':
                    this.state.keys[data.id] = data;
                    await this.db.saveKey(data);
                    break;
                    
                case 'RATCHET_UPDATED':
                    this.state.ratchets[data.conversationId] = data;
                    await this.db.saveRatchetState(data);
                    break;
                    
                case 'OUTBOX_ADDED':
                    this.state.outbox.push(data);
                    await this.db.saveOutboxMessage(data);
                    break;
                    
                case 'OUTBOX_REMOVED':
                    this.state.outbox = this.state.outbox.filter(m => m.id !== data.id);
                    await this.db.removeOutboxMessage(data.id);
                    break;
                    
                case 'BACKUP_CREATED':
                    this.state.backup = { lastBackup: Date.now(), status: 'ok' };
                    await this.db.save('settings', { id: 'backup', ...this.state.backup });
                    break;
                    
                case 'SESSION_RESTORED':
                    this.state.user = data;
                    break;
            }
            
            // Notificar cambios a observadores
            this.notify(action, { prevState, newState: this.state, data });
            
            // Disparar auto-backup en mutaciones críticas
            if (['CONTACT_ADDED', 'CONTACT_REMOVED', 'GROUP_CREATED', 'GROUP_LEFT', 'KEY_ROTATED'].includes(action)) {
                autoBackupTrigger.triggerBackup(action.toLowerCase());
            }
        });
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
