// frontend/src/js/ui/contacts_list.js
import { hermesStore } from '../store/hermes_store.js';
import { IconSystem } from '../icon_system.js';
import { DOMSanitizer } from './dom_sanitizer.js';

export class ContactsListComponent {
    constructor() {
        this.state = 'loading'; // loading | empty | error | success
        this.contacts = [];
    }
    
    async load() {
        this.setState('loading');
        this.render();
        
        try {
            this.contacts = hermesStore.getContacts() || [];
            
            if (this.contacts.length === 0) {
                this.setState('empty');
            } else {
                this.setState('success');
            }
        } catch (error) {
            this.setState('error');
            console.error('[ContactsListComponent] Error loading contacts:', error);
        }
        
        this.render();
    }
    
    setState(newState) {
        this.state = newState;
    }
    
    render() {
        const container = document.getElementById('contacts-list');
        if (!container) return;
        
        switch (this.state) {
            case 'loading':
                container.innerHTML = `
                    <div class="state-loading">
                        <div class="skeleton skeleton-contact"></div>
                        <div class="skeleton skeleton-contact"></div>
                        <div class="skeleton skeleton-contact"></div>
                    </div>
                `;
                break;
                
            case 'empty':
                container.innerHTML = `
                    <div class="state-empty">
                        <span class="empty-icon">${IconSystem.get('person')}</span>
                        <p class="empty-title">Sin contactos</p>
                        <p class="empty-description">Añade tu primer contacto usando su identificador criptográfico</p>
                    </div>
                `;
                break;
                
            case 'error':
                container.innerHTML = `
                    <div class="state-error">
                        <p class="error-description">No se pudieron cargar tus contactos</p>
                        <button class="btn-cyber" id="btn-retry-contacts">
                            🔄 Reintentar
                        </button>
                    </div>
                `;
                const retryBtn = container.querySelector('#btn-retry-contacts');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => this.load());
                }
                break;
                
            case 'success':
                container.innerHTML = this.contacts.map(contact => {
                    const safeId = DOMSanitizer.escapeAttribute(contact.id || '');
                    const safeAlias = DOMSanitizer.escapeHTML(contact.alias || contact.id || '');
                    const safeInitials = DOMSanitizer.escapeHTML((contact.alias || '?').substring(0, 2).toUpperCase());
                    return `
                    <div class="contact-item" data-contact-id="${safeId}">
                        <div class="contact-avatar">
                            ${safeInitials}
                        </div>
                        <div class="contact-info">
                            <span class="contact-name">${safeAlias}</span>
                            <span class="contact-status ${contact.isOnline ? 'online' : ''}">
                                ${contact.isOnline ? 'En línea' : 'Desconectado'}
                            </span>
                        </div>
                    </div>
                `;
                }).join('');
                break;
        }
    }
}

export const contactsListUI = new ContactsListComponent();
