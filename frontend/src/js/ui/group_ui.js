// frontend/src/js/ui/group_ui.js
import { state, showToast } from '../state.js';
import { StateRenderer } from './state_renderer.js';
import { modalManager } from './modal_manager.js';

export function renderGroupSidebar(openGroupChatCb) {
    const container = document.getElementById('groups-list');
    if (!container) return;
    container.innerHTML = '';

    const list = [...state.groups.userGroups];
    
    // Sort groups by latest message timestamp
    list.sort((a, b) => {
        const msgsA = state.chats ? state.chats.getMessages(a.id) : [];
        const msgsB = state.chats ? state.chats.getMessages(b.id) : [];
        
        const lastA = msgsA.length > 0 ? (msgsA[msgsA.length - 1].timestamp_ms || 0) : 0;
        const lastB = msgsB.length > 0 ? (msgsB[msgsB.length - 1].timestamp_ms || 0) : 0;
        
        return lastB - lastA;
    });

    if (list.length === 0) {
        StateRenderer.renderEmpty(container, 'SIN GRUPOS', 'Crea un grupo privado para chatear en equipo con doble trinquete.', 'group');
        return;
    }

    list.forEach(grp => {
        const isActive = state.activeGroup === grp.id;
        const el = document.createElement('div');
        el.className = `p-3 flex items-center gap-3 cursor-pointer transition-colors rounded ${isActive ? 'bg-terminalGreen/20' : 'hover:bg-darkSurface/50'}`;

        const avatar = document.createElement('div');
        avatar.className = 'w-9 h-9 rounded-full bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-300 uppercase select-none shrink-0';
        avatar.textContent = grp.name.substring(0, 2).toUpperCase();

        const info = document.createElement('div');
        info.className = 'flex-grow min-w-0';
        
        const nameRow = document.createElement('div');
        nameRow.className = 'flex justify-between items-baseline mb-0.5';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'font-bold text-xs truncate text-purple-300';
        nameSpan.textContent = `# ${grp.name}`;
        
        nameRow.appendChild(nameSpan);

        const unreadCount = state.chats ? state.chats.getUnreadCount(grp.id) : 0;
        if (unreadCount > 0) {
            const unreadBadge = document.createElement("span");
            unreadBadge.className = 'font-extrabold text-[10px] px-2 py-0.5 rounded-full animate-pulse ml-auto shrink-0 inline-flex items-center justify-center border border-white/30';
            unreadBadge.style.backgroundColor = '#a855f7';
            unreadBadge.style.color = '#ffffff';
            unreadBadge.style.boxShadow = '0 0 12px rgba(168, 85, 247, 0.9)';
            unreadBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
            nameRow.appendChild(unreadBadge);
        }

        info.appendChild(nameRow);

        const typingBadge = document.createElement('div');
        const cIdStr = String(grp.id);
        const isTyping = window.typingState && window.typingState[cIdStr];
        const typingClasses = 'typing-sidebar-badge text-[9px] font-mono text-purple-400 font-bold italic animate-pulse truncate mt-0.5';
        typingBadge.className = isTyping ? typingClasses : typingClasses + ' hidden';
        if (isTyping) {
            typingBadge.textContent = `✍️ @${window.typingState[cIdStr].username} escribiendo...`;
        }
        typingBadge.dataset.chatId = cIdStr;
        info.appendChild(typingBadge);

        el.dataset.chatId = grp.id;
        el.appendChild(avatar);
        el.appendChild(info);

        el.addEventListener('click', async () => {
            state.activeContact = null;
            state.activeGroup = grp.id;
            if (state.chats) await state.chats.markAllAsRead(state.storage, grp.id);
            if (openGroupChatCb) openGroupChatCb(grp);
        });

        container.appendChild(el);
    });
}

export function openGroupChat(grp, renderGroupSidebarCb, renderContactSidebarCb, renderMessagesCb) {
    ['settings-modal', 'backup-modal', 'admin-panel-modal'].forEach(id => {
        const m = document.getElementById(id);
        if (m && !m.classList.contains('hidden')) {
            m.classList.add('opacity-0');
            setTimeout(() => m.classList.add('hidden'), 200);
        }
    });

    state.activeGroup = grp.id;
    state.activeContact = null;
    if (state.sync) {
        state.sync.activeChatId = grp.id;
    }
    if (renderGroupSidebarCb) renderGroupSidebarCb();
    if (renderContactSidebarCb) renderContactSidebarCb();

    const titleEl = document.getElementById('chat-header-title');
    if (titleEl) titleEl.textContent = `# ${grp.name}`;
    
    const statusEl = document.getElementById('chat-header-status');
    if (statusEl) statusEl.textContent = `GRUPO SEGURIZADO [PQC · ${grp.creator_id === state.currentUser ? 'ADMIN' : 'MEMBER'}]`;
    
    const avatarEl = document.getElementById('active-contact-avatar');
    if (avatarEl) avatarEl.textContent = grp.name.substring(0, 2).toUpperCase();
    
    const footerEl = document.getElementById('chat-footer');
    if (footerEl) footerEl.classList.remove('hidden');
    
    const inputEl = document.getElementById('chat-input');
    if (inputEl) inputEl.removeAttribute('disabled');
    
    const sendBtnEl = document.getElementById('btn-send');
    if (sendBtnEl) sendBtnEl.removeAttribute('disabled');

    document.getElementById("btn-back-to-contacts")?.classList.remove("hidden");
    document.getElementById("sidebar-panel")?.classList.add("mobile-hidden");
    document.getElementById("chat-panel")?.classList.add("mobile-visible");

    const chatOptionsBtn = document.getElementById("btn-chat-options");
    if (chatOptionsBtn) chatOptionsBtn.classList.remove("hidden");

    const addGroupBtn = document.getElementById("btn-add-group-member");
    if (addGroupBtn) addGroupBtn.classList.remove("hidden");
    
    const delConvBtn = document.getElementById("btn-delete-conversation");
    if (delConvBtn) {
        delConvBtn.classList.remove("hidden");
        delConvBtn.removeAttribute("disabled");
    }
    
    const delContactBtn = document.getElementById("btn-delete-contact");
    if (delContactBtn) delContactBtn.classList.add("hidden");
    
    const blockContactBtn = document.getElementById("btn-block-contact");
    if (blockContactBtn) blockContactBtn.classList.add("hidden");

    const verifyBtn = document.getElementById("btn-verify-safety-number");
    if (verifyBtn) verifyBtn.classList.add("hidden");

    const isCreator = grp.creator_id === state.currentUser;
    const editConfigBtn = document.getElementById("btn-edit-group-config");
    if (editConfigBtn) {
        if (isCreator) {
            editConfigBtn.classList.remove("hidden");
        } else {
            editConfigBtn.classList.add("hidden");
        }
    }

    const leaveGroupBtn = document.getElementById("btn-leave-group");
    if (leaveGroupBtn) leaveGroupBtn.classList.remove("hidden");

    const headerDiv = document.createElement('div');
    headerDiv.className = 'text-center text-[10px] text-purple-400/70 font-mono py-3 border-b border-purple-500/10 flex flex-wrap gap-2 justify-center items-center';
    headerDiv.textContent = '\uD83D\uDC65 MIEMBROS: ';

    grp.members.forEach(m => {
        const isSelf = m === state.currentUser;
        const roleStar = m === grp.creator_id ? ' \u2605' : '';

        const badge = document.createElement('span');
        badge.className = 'inline-flex items-center bg-purple-950/40 border border-purple-500/20 px-2 py-0.5 rounded gap-1 text-[9px] font-mono text-purple-300';
        badge.textContent = `@${m}${roleStar}`;

        if (isCreator && !isSelf) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'text-red-400 hover:text-red-200 ml-1 font-bold text-[8px] font-mono';
            removeBtn.textContent = '\u2715';
            removeBtn.addEventListener('click', () => {
                if (window.removeGroupMemberFn) window.removeGroupMemberFn(m);
            });
            badge.appendChild(removeBtn);
        }

        headerDiv.appendChild(badge);
    });

    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
        chatMessages.appendChild(headerDiv);
    }

    if (state.chats) {
        state.chatMessages = state.chats.getMessages(state.activeGroup);
    } else {
        state.chatMessages = [];
    }
    if (renderMessagesCb) renderMessagesCb();
    if (renderGroupSidebarCb) renderGroupSidebarCb();
    if (renderContactSidebarCb) renderContactSidebarCb();

    const cIdStr = String(state.activeGroup);
    const container = document.getElementById("typing-indicator-container");
    const userSpan = document.getElementById("typing-username");
    if (window.typingState && window.typingState[cIdStr] && container && userSpan) {
        userSpan.textContent = `@${window.typingState[cIdStr].username} está escribiendo en el grupo`;
        container.classList.remove("hidden");
    } else if (container) {
        container.classList.add("hidden");
    }
}

export async function createGroup(name, memberIds, renderGroupSidebarCb) {
    try {
        const id = crypto.randomUUID();
        const groupKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const groupKeyHex = Array.from(groupKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        const grp = await state.groups.createGroup(state.storage, id, name, state.currentUser, memberIds, groupKeyHex);

        const invites = grp.members.filter(m => m !== state.currentUser);
        for (const targetId of invites) {
            await state.sync.sendBlob(state.currentUser, targetId, {
                type: "group_invite",
                group_id: id,
                group_name: name,
                creator_id: state.currentUser,
                members: grp.members,
                symmetric_key: groupKeyHex
            });
        }

        showToast(`Grupo #${name} creado con éxito`);
        const modal = document.getElementById('create-group-modal');
        if (modal) {
            modal.classList.add('opacity-0');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
        
        if (renderGroupSidebarCb) renderGroupSidebarCb();
    } catch (e) {
        console.error(e);
        showToast('Error al crear grupo', true);
    }
}

export function buildCreateGroupModal() {
    const modal = document.getElementById('create-group-modal');
    if (!modal) return;
    if (window.modalManager) {
        window.modalManager.open(modal);
    } else {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    const container = document.getElementById('create-group-members-list');
    if (!container) return;
    container.innerHTML = '';

    const acceptedContacts = state.contacts.contacts;

    if (acceptedContacts.length === 0) {
        StateRenderer.renderEmpty(container, 'SIN CONTACTOS', 'Necesitas contactos aceptados para añadirlos a un grupo.', 'person');
        return;
    }

    acceptedContacts.forEach(contact => {
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 p-2 border border-darkGrey/40 rounded hover:bg-purple-950/10 cursor-pointer select-none';

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'cg-member-check accent-purple-500';
        check.value = contact;

        const span = document.createElement('span');
        span.className = 'text-xs text-gray-300 font-mono';
        span.textContent = `@${contact}`;

        label.appendChild(check);
        label.appendChild(span);
        container.appendChild(label);
    });
}
