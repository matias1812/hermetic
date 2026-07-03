// frontend/src/js/ui/chat_view.js
import { hermesStore } from '../store/hermes_store.js';
import { IconSystem } from '../icon_system.js';
import { DOMSanitizer } from './dom_sanitizer.js';

export class ChatViewComponent {
    constructor() {
        this.state = 'empty'; // loading | empty | error | success
        this.messages = [];
        this.conversationId = null;
    }
    
    setState(newState) {
        this.state = newState;
    }
    
    async load(conversationId) {
        this.conversationId = conversationId;
        this.setState('loading');
        this.render();
        
        try {
            this.messages = hermesStore.getMessages(conversationId) || [];
            
            if (this.messages.length === 0) {
                this.setState('empty');
            } else {
                this.setState('success');
            }
        } catch (error) {
            this.setState('error');
            console.error('[ChatViewComponent] Error loading messages:', error);
        }
        
        this.render();
    }
    
    render() {
        const container = document.getElementById('messages-container') || document.getElementById('chat-messages');
        if (!container) return;
        
        switch (this.state) {
            case 'loading':
                container.innerHTML = `
                    <div class="state-loading">
                        <div class="skeleton skeleton-message"></div>
                        <div class="skeleton skeleton-message"></div>
                        <div class="skeleton skeleton-message"></div>
                    </div>
                `;
                break;
                
            case 'empty':
                container.innerHTML = `
                    <div class="state-empty">
                        <span class="empty-icon">${IconSystem.get('chat')}</span>
                        <p class="empty-title">No hay mensajes</p>
                        <p class="empty-description">Envía el primer mensaje para empezar la conversación cifrada</p>
                    </div>
                `;
                break;
                
            case 'error':
                container.innerHTML = `
                    <div class="state-error">
                        <p>Error al cargar mensajes</p>
                        <button id="btn-retry-chat" class="btn-cyber">Reintentar</button>
                    </div>
                `;
                const retryBtn = container.querySelector('#btn-retry-chat');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => this.load(this.conversationId));
                }
                break;
                
            case 'success':
                container.innerHTML = this.messages.map(msg => this.renderMessage(msg)).join('');
                this.scrollToBottom(container);
                break;
        }
    }
    
    renderMessage(message) {
        const isOwn = message.senderId === 'me' || message.isOwn;
        
        if (message.type === 'text' || !message.type) {
            return this.renderTextBubble(message, isOwn);
        } else if (message.type === 'image') {
            return this.renderImageBubble(message, isOwn);
        } else if (message.type === 'audio') {
            return this.renderAudioBubble(message, isOwn);
        }
        return this.renderTextBubble(message, isOwn);
    }
    
    renderTextBubble(message, isOwn) {
        const safeId = DOMSanitizer.escapeAttribute(message.id || '');
        const safeText = DOMSanitizer.escapeHTML(message.text || message.content || '');
        return `
            <div class="message-bubble ${isOwn ? 'own' : 'peer'}" data-message-id="${safeId}">
                <div class="message-text">${safeText}</div>
                <div class="message-time">${new Date(message.timestamp || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
        `;
    }
    
    renderImageBubble(message, isOwn) {
        const safeId = DOMSanitizer.escapeAttribute(message.id || '');
        return `
            <div class="message-bubble image-bubble ${isOwn ? 'own' : 'peer'}" data-message-id="${safeId}">
                <div class="image-content">
                    ${message.ephemeral ? `<span class="ephemeral-badge">${IconSystem.get('burn')} Efímera</span>` : ''}
                    <span class="image-placeholder">🖼️ Imagen Cifrada</span>
                </div>
            </div>
        `;
    }
    
    renderAudioBubble(message, isOwn) {
        const safeId = DOMSanitizer.escapeAttribute(message.id || '');
        const safeDuration = DOMSanitizer.escapeHTML(message.duration || 0);
        return `
            <div class="message-bubble audio-bubble ${isOwn ? 'own' : 'peer'}" data-message-id="${safeId}">
                <div class="audio-content">
                    <span class="audio-icon">🎤</span>
                    <span>Audio Cifrado (${safeDuration}s)</span>
                </div>
            </div>
        `;
    }
    
    scrollToBottom(container) {
        container.scrollTop = container.scrollHeight;
    }
}

export const chatViewUI = new ChatViewComponent();
