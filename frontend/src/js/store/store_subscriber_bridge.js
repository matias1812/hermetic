// frontend/src/js/store/store_subscriber_bridge.js
import { hermesStore } from './hermes_store.js';
import { state } from '../state.js';

export class StoreSubscriberBridge {
    /**
     * Puente de suscripción entre HermesStore y el estado legacy en memoria.
     * Garantiza que el Store sea la fuente de verdad y sincronice transparentemente con state.js.
     */
    
    initialize() {
        // Suscribirse a inicialización del store
        hermesStore.subscribe('store:initialized', (storeState) => {
            if (state.contacts && storeState.contacts.length > 0) {
                state.contacts.contacts = [...storeState.contacts];
            }
            if (state.groups && storeState.groups.length > 0) {
                state.groups.userGroups = [...storeState.groups];
            }
        });
        
        // Suscribirse a altas/bajas de contactos
        hermesStore.subscribe('CONTACT_ADDED', ({ newState }) => {
            if (state.contacts) {
                state.contacts.contacts = [...newState.contacts];
            }
            document.dispatchEvent(new CustomEvent('hermes:contact_list_updated', { detail: newState.contacts }));
        });
        
        hermesStore.subscribe('CONTACT_REMOVED', ({ newState }) => {
            if (state.contacts) {
                state.contacts.contacts = [...newState.contacts];
            }
            document.dispatchEvent(new CustomEvent('hermes:contact_list_updated', { detail: newState.contacts }));
        });
        
        // Suscribirse a cambios en grupos
        hermesStore.subscribe('GROUP_CREATED', ({ newState }) => {
            if (state.groups) {
                state.groups.userGroups = [...newState.groups];
            }
            document.dispatchEvent(new CustomEvent('hermes:group_list_updated', { detail: newState.groups }));
        });
        
        hermesStore.subscribe('GROUP_LEFT', ({ newState }) => {
            if (state.groups) {
                state.groups.userGroups = [...newState.groups];
            }
            document.dispatchEvent(new CustomEvent('hermes:group_list_updated', { detail: newState.groups }));
        });
        
        console.log('✅ StoreSubscriberBridge active: HermesStore synchronized with legacy state');
    }
}

export const storeBridge = new StoreSubscriberBridge();
