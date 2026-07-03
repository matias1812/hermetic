// frontend/src/js/store/chat.js
import { state } from '../state.js';
import { hermesStore } from './hermes_store.js';

export class ChatStoreModule {
    /**
     * Módulo claro para gestión de chats y mensajes en el Store.
     * Mantiene compatibilidad con LocalChatManager (chat_manager.js).
     */
    
    async saveMessage(msgData) {
        await hermesStore.dispatch('MESSAGE_SENT', msgData);
        if (state.chatMessages && state.activeContact && msgData.conversationId === state.activeContact) {
            state.chatMessages.push(msgData);
        }
        return msgData;
    }
    
    async receiveMessage(msgData) {
        await hermesStore.dispatch('MESSAGE_RECEIVED', msgData);
        if (state.chatMessages && state.activeContact && msgData.conversationId === state.activeContact) {
            state.chatMessages.push(msgData);
        }
        return msgData;
    }
    
    getMessages(conversationId) {
        return hermesStore.state.messages[conversationId] || [];
    }
}

export const chatModule = new ChatStoreModule();
