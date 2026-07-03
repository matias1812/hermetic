// chat_selector.js
import { state } from './state.js';

export class ChatSelector {
    constructor() {
        this.activeType = null; // 'contact' | 'group' | null
        this.activeId = null;
        this.initListeners();
    }

    initListeners() {
        setTimeout(() => {
            const backBtn = document.getElementById('btn-back-to-contacts');
            if (backBtn) {
                backBtn.addEventListener('click', () => this.closeChat());
            }
        }, 500);
    }

    /**
     * Seleccionar un chat (contacto o grupo).
     * DESMARCA automáticamente el otro tipo.
     */
    selectChat(id, type) {
        if (window.closeSettingsModal) window.closeSettingsModal();
        // 1. Desmarcar TODOS los elementos de contacto y grupo
        document.querySelectorAll('#contacts-list > div, #groups-list > div, .contact-item, .group-item').forEach(el => {
            el.classList.remove('active', 'selected', 'bg-terminalGreen/10', 'border-terminalGreen', 'border-l-2', 'bg-purple-500/10', 'border-purple-500');
        });

        // 2. Marcar el nuevo elemento con estilos diferenciados
        if (type === 'contact') {
            state.activeContact = id;
            state.activeGroup = null;
            // Buscar elemento por contenido o data
            const items = document.querySelectorAll('#contacts-list > div');
            items.forEach(el => {
                if (el.textContent && el.textContent.includes(`@${id}`)) {
                    el.classList.add('active', 'selected', 'bg-terminalGreen/10', 'border-l-2', 'border-terminalGreen');
                }
            });
        } else if (type === 'group') {
            state.activeGroup = id;
            state.activeContact = null;
            const items = document.querySelectorAll('#groups-list > div');
            items.forEach(el => {
                if (el.textContent && el.textContent.includes(id)) {
                    el.classList.add('active', 'selected', 'bg-purple-500/10', 'border-l-2', 'border-purple-500');
                }
            });
        }

        this.activeType = type;
        this.activeId = id;

        // Transición responsive móvil nativa
        document.getElementById('sidebar-panel')?.classList.add('mobile-hidden');
        document.getElementById('chat-panel')?.classList.add('mobile-visible');

        // 3. Mostrar header con flecha y estilos diferenciados
        this.showChatHeader(id, type);
    }

    showChatHeader(id, type) {
        const titleEl = document.getElementById('chat-header-title');
        const statusEl = document.getElementById('chat-header-status');
        const avatarEl = document.getElementById('active-contact-avatar');
        const backBtn = document.getElementById('btn-back-to-contacts');

        if (backBtn) backBtn.classList.remove('hidden');

        if (type === 'contact') {
            if (avatarEl) {
                avatarEl.textContent = id.substring(0, 2).toUpperCase();
                avatarEl.style.background = 'rgba(0, 255, 255, 0.1)';
                avatarEl.style.border = '1px solid #00ffff';
                avatarEl.style.color = '#00ffff';
            }
            if (titleEl) {
                titleEl.textContent = `@${id}`;
                titleEl.style.color = '#00ffff';
            }
            if (statusEl) {
                statusEl.textContent = '🟢 CANAL E2EE ACTIVO';
            }
        } else if (type === 'group') {
            const group = state.groups.userGroups.find(g => g.id === id || g.name === id);
            const groupName = group ? group.name : id;
            if (avatarEl) {
                avatarEl.textContent = '👥';
                avatarEl.style.background = 'rgba(180, 77, 255, 0.1)';
                avatarEl.style.border = '1px solid #b44dff';
                avatarEl.style.color = '#b44dff';
            }
            if (titleEl) {
                titleEl.textContent = groupName;
                titleEl.style.color = '#b44dff';
            }
            if (statusEl) {
                const count = group ? group.members.length : '3+';
                statusEl.textContent = `👥 GRUPO SECRETO (${count} MIEMBROS)`;
            }
        }
    }

    /**
     * Cerrar chat activo (flecha <-).
     */
    closeChat() {
        document.querySelectorAll('#contacts-list > div, #groups-list > div, .contact-item, .group-item').forEach(el => {
            el.classList.remove('active', 'selected', 'bg-terminalGreen/10', 'border-terminalGreen', 'border-l-2', 'bg-purple-500/10', 'border-purple-500');
        });

        state.activeContact = null;
        state.activeGroup = null;
        this.activeType = null;
        this.activeId = null;

        const titleEl = document.getElementById('chat-header-title');
        const statusEl = document.getElementById('chat-header-status');
        const avatarEl = document.getElementById('active-contact-avatar');

        if (titleEl) {
            titleEl.textContent = 'Selecciona un chat';
            titleEl.style.color = '#ffffff';
        }
        if (statusEl) {
            statusEl.textContent = 'CANAL DESACOPLADO';
        }
        if (avatarEl) {
            avatarEl.textContent = '?';
            avatarEl.style.background = '';
            avatarEl.style.border = '';
            avatarEl.style.color = '';
        }

        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="text-center text-xs text-gray-600 my-auto uppercase font-mono tracking-wider">[!] Selecciona un chat para abrir el canal seguro.</div>';
        }

        const footer = document.getElementById('chat-footer');
        if (footer) footer.classList.add('hidden');

        document.getElementById('sidebar-panel')?.classList.remove('mobile-hidden');
        document.getElementById('chat-panel')?.classList.remove('mobile-visible');
    }
}

export const chatSelector = new ChatSelector();
window.chatSelector = chatSelector;
