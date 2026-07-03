// frontend/src/js/store/contacts.js
import { state } from '../state.js';
import { hermesStore } from './hermes_store.js';

export class ContactsStoreModule {
    /**
     * Módulo claro para gestión de contactos en el Store.
     * Mantiene compatibilidad total con LocalContactManager (contact_manager.js).
     */
    
    async addContact(contactData) {
        // 1. Despachar al store central (persistencia + auto-backup)
        await hermesStore.dispatch('CONTACT_ADDED', contactData);
        
        // 2. Sincronizar con el gestor legacy en memoria si es necesario
        if (state.contacts && !state.contacts.contacts.some(c => c.id === contactData.id)) {
            state.contacts.contacts.push(contactData);
        }
        return contactData;
    }
    
    async removeContact(contactId) {
        await hermesStore.dispatch('CONTACT_REMOVED', { id: contactId });
        if (state.contacts) {
            state.contacts.contacts = state.contacts.contacts.filter(c => c.id !== contactId && c.alias !== contactId);
        }
    }
    
    getContacts() {
        return hermesStore.state.contacts.length > 0 
            ? hermesStore.state.contacts 
            : (state.contacts ? state.contacts.contacts : []);
    }
    
    getContactById(id) {
        return this.getContacts().find(c => c.id === id || c.alias === id);
    }
}

export const contactsModule = new ContactsStoreModule();
