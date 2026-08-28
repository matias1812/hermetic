// chat_ui.js
import { state, sha256, showToast } from './state.js';
import { AudioRecorder } from './audio_recorder.js';
import { modalManager } from './ui/modal_manager.js';
import { StateRenderer } from './ui/state_renderer.js';
import { renderMessages } from './ui/message_renderer.js';
import * as GroupUI from './ui/group_ui.js';
import { setupChatInput } from './ui/chat_input.js';
import { openSafetyNumberModal } from './ui/safety_number_modal.js';

// Re-export message renderer functions for compatibility
export {
    renderMessages,
    showBubbleActions,
    promptEditMessage,
    confirmDeleteMessage,
    openInspector,
    openEphemeralImageModal
} from './ui/message_renderer.js';

// Instancia global del grabador de audio (singleton por pestaña)
const audioRecorder = new AudioRecorder();

export function renderContactSidebar() {
    renderContacts();
    renderRequests();
}

export function renderContacts() {
    const container = document.getElementById("contacts-list");
    if (!container) return;
    container.innerHTML = "";

    const list = [...state.contacts.contacts];
    
    // Sort contacts by latest message timestamp
    list.sort((a, b) => {
        const msgsA = state.chats ? state.chats.getMessages(a) : [];
        const msgsB = state.chats ? state.chats.getMessages(b) : [];
        
        const lastA = msgsA.length > 0 ? (msgsA[msgsA.length - 1].timestamp_ms || 0) : 0;
        const lastB = msgsB.length > 0 ? (msgsB[msgsB.length - 1].timestamp_ms || 0) : 0;
        
        return lastB - lastA;
    });

    if (list.length === 0) {
        StateRenderer.renderEmpty(container, 'SIN CONTACTOS', 'Agrega un usuario para iniciar un canal 1:1 cifrado.', 'person');
        return;
    }

    list.forEach(c => {
        const isActive = state.activeContact === c;
        const el = document.createElement("div");
        el.className = `p-3 flex items-center gap-3 cursor-pointer transition-colors rounded ${isActive ? 'bg-terminalGreen/20' : 'hover:bg-darkSurface/50'}`;

        const avatar = document.createElement("div");
        avatar.className = 'w-9 h-9 rounded-full bg-darkMuted border border-darkGrey flex items-center justify-center text-xs font-bold text-white uppercase select-none shrink-0';
        avatar.textContent = c.substring(0, 2).toUpperCase();

        const info = document.createElement("div");
        info.className = 'flex-grow min-w-0';

        const nameRow = document.createElement("div");
        nameRow.className = 'flex justify-between items-center mb-0.5';

        const nameSpan = document.createElement("span");
        nameSpan.className = 'font-bold text-xs truncate text-gray-300 flex items-center gap-1.5';
        
        const isOnline = state.contacts.onlineStatuses[c];
        const statusDot = document.createElement("span");
        statusDot.className = `w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse' : 'bg-gray-700/50 border border-gray-600'}`;
        
        nameSpan.appendChild(statusDot);
        const nameText = document.createElement("span");
        if (isActive) nameText.className = "text-terminalGreen font-bold tracking-wide";
        nameText.textContent = `@${c}`;
        nameSpan.appendChild(nameText);

        const oobStatus = state.contacts.getContactOOBStatus(c);
        if (oobStatus.mutual || oobStatus.meVerified) {
            const badge = document.createElement("span");
            badge.className = `font-mono text-[8px] px-1 py-0.5 rounded border shadow-sm shrink-0 ${
                oobStatus.mutual 
                    ? "text-terminalGreen bg-terminalGreen/20 border-terminalGreen/40" 
                    : "text-yellow-400 bg-yellow-950/30 border-yellow-700/50"
            }`;
            badge.textContent = oobStatus.mutual ? "🛡️ OOB" : "🛡️ VERIF";
            badge.title = oobStatus.mutual ? "Verificado Out-Of-Band (Mutuo)" : "Verificado por ti";
            nameSpan.appendChild(badge);
        }

        nameRow.appendChild(nameSpan);

        const unreadCount = state.chats ? state.chats.getUnreadCount(c) : 0;
        if (unreadCount > 0) {
            const unreadBadge = document.createElement("span");
            unreadBadge.className = 'font-extrabold text-[10px] px-2 py-0.5 rounded-full animate-pulse ml-auto shrink-0 inline-flex items-center justify-center border border-white/30';
            unreadBadge.style.backgroundColor = '#00ff66';
            unreadBadge.style.color = '#000000';
            unreadBadge.style.boxShadow = '0 0 12px rgba(0, 255, 102, 0.9)';
            unreadBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
            nameRow.appendChild(unreadBadge);
        }

        info.appendChild(nameRow);
        
        const typingBadge = document.createElement('div');
        const isTyping = window.typingState && window.typingState[c];
        const typingClasses = 'typing-sidebar-badge text-[9px] font-mono text-terminalGreen font-bold italic animate-pulse truncate mt-0.5';
        typingBadge.className = isTyping ? typingClasses : typingClasses + ' hidden';
        if (isTyping) {
            typingBadge.textContent = `✍️ @${window.typingState[c].username} escribiendo...`;
        }
        typingBadge.dataset.chatId = c;
        info.appendChild(typingBadge);

        el.dataset.chatId = c;
        el.appendChild(avatar);
        el.appendChild(info);

        el.addEventListener("click", async () => {
            state.activeContact = c;
            state.activeGroup = null;
            if (state.chats) await state.chats.markAllAsRead(state.storage, c);
            openChatWithContact();
            renderContactSidebar();
            renderGroupSidebar();
        });

        container.appendChild(el);
    });
}

export function renderRequests() {
    const requestsSection = document.getElementById('requests-section');
    const requestsList    = document.getElementById('requests-list');
    const pendingSection  = document.getElementById('pending-section');
    const pendingList     = document.getElementById('pending-list');

    if (!requestsSection || !requestsList || !pendingSection || !pendingList) return;

    const incoming = state.contacts.contactData.filter(c => c.status === 'pending_received');
    const outgoing = state.contacts.contactData.filter(c => c.status === 'pending_sent');

    // Actualizar indicador en tab de contactos
    const tabContacts = document.getElementById('tab-contacts');
    if (tabContacts) {
        if (incoming.length > 0) {
            tabContacts.innerHTML = `👤 CONTACTOS <span class="bg-yellow-500 text-black px-1.5 py-0.5 rounded-full text-[8px] font-bold ml-1 shadow-sm animate-pulse">${incoming.length}</span>`;
        } else {
            tabContacts.innerHTML = `👤 CONTACTOS`;
        }
    }

    // -- Incoming --
    requestsList.innerHTML = '';
    if (incoming.length > 0) {
        requestsSection.classList.remove('hidden');
        const headerSpan = requestsSection.querySelector('span');
        if (headerSpan) headerSpan.textContent = `⚡ SOLICITUDES RECIBIDAS (${incoming.length})`;

        incoming.forEach(req => {
            const senderId = req.contact_id;
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 px-3 py-2.5 bg-yellow-950/10 border-l-2 border-yellow-500/50';

            const avatar = document.createElement('div');
            avatar.className = 'w-8 h-8 rounded-full bg-darkMuted border border-yellow-500/40 flex items-center justify-center text-xs font-bold text-yellow-400 shrink-0 shadow-inner';
            avatar.textContent = senderId.substring(0, 2).toUpperCase();

            const name = document.createElement('span');
            name.className = 'flex-grow text-xs text-gray-200 truncate font-mono font-bold';
            name.textContent = `@${senderId}`;

            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'text-[9px] font-mono font-bold bg-terminalGreen/20 hover:bg-terminalGreen hover:text-black border border-terminalGreen px-2.5 py-1 rounded text-terminalGreen transition-all shadow-sm uppercase shrink-0';
            acceptBtn.textContent = 'ACEPTAR';
            acceptBtn.addEventListener('click', () => acceptContactRequest(senderId));

            const rejectBtn = document.createElement('button');
            rejectBtn.className = 'text-[9px] font-mono font-bold bg-darkMuted hover:bg-red-950 hover:text-red-400 border border-red-500/20 px-2.5 py-1 rounded text-red-500 transition-colors uppercase shrink-0';
            rejectBtn.textContent = 'RECHAZAR';
            rejectBtn.addEventListener('click', () => rejectContactRequestFn(senderId));

            row.appendChild(avatar);
            row.appendChild(name);
            row.appendChild(acceptBtn);
            row.appendChild(rejectBtn);
            requestsList.appendChild(row);
        });
    } else {
        requestsSection.classList.add('hidden');
    }

    // -- Outgoing --
    pendingList.innerHTML = '';
    if (outgoing.length > 0) {
        pendingSection.classList.remove('hidden');
        const headerSpan = pendingSection.querySelector('span');
        if (headerSpan) headerSpan.textContent = `⏳ SOLICITUDES ENVIADAS (${outgoing.length})`;

        outgoing.forEach(req => {
            const targetId = req.contact_id;
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 px-3 py-2.5 bg-darkSurface/20';

            const avatar = document.createElement('div');
            avatar.className = 'w-8 h-8 rounded-full bg-darkMuted border border-gray-600/50 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0';
            avatar.textContent = targetId.substring(0, 2).toUpperCase();

            const name = document.createElement('span');
            name.className = 'flex-grow text-xs text-gray-400 truncate font-mono italic';
            name.textContent = `@${targetId} (pendiente)`;

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'text-[9px] font-mono font-bold bg-darkMuted hover:bg-red-950 hover:text-red-400 border border-red-500/20 px-2.5 py-1 rounded text-red-500 transition-colors uppercase shrink-0';
            cancelBtn.textContent = 'CANCELAR';
            cancelBtn.addEventListener('click', () => cancelSentRequest(targetId));

            row.appendChild(avatar);
            row.appendChild(name);
            row.appendChild(cancelBtn);
            pendingList.appendChild(row);
        });
    } else {
        pendingSection.classList.add('hidden');
    }
}

export async function cancelSentRequest(targetId) {
    try {
        state.contacts.contactData = state.contacts.contactData.filter(c => c.contact_id !== targetId);
        await state.contacts.save(state.storage);

        try {
            await state.sync.sendBlob(state.currentUser, targetId, {
                type: "contact_reject"
            });
        } catch (e) {
            console.warn("Failed to notify peer about cancellation (offline):", e);
        }

        showToast(`Solicitud para @${targetId} cancelada.`);
        renderContactSidebar();
    } catch (err) {
        console.error("Error cancelling contact request:", err);
        showToast("Error al cancelar la solicitud.", true);
    }
}

async function sendContactAccept(senderId, successMessage) {
    try {
        const sharedKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const sharedKeyHex = Array.from(sharedKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        await state.contacts.acceptRequest(state.storage, senderId, sharedKeyHex);

        await state.sync.sendBlob(state.currentUser, senderId, {
            type: "contact_accept",
            shared_key: sharedKeyHex
        });
        await state.sync.registerRelationship('contact', senderId);

        showToast(successMessage);
        renderContactSidebar();
    } catch (e) {
        console.error(e);
        showToast("Error al aceptar contacto", true);
    }
}

export async function acceptContactRequest(senderId) {
    await sendContactAccept(senderId, `Contacto @${senderId} aceptado`);
}

export async function resendContactInvite(contactId) {
    // El otro lado ya nos tiene como contacto aceptado — este mismo mensaje
    // (contact_accept con un shared_key nuevo) es lo que su cliente necesita
    // para reconstruir el contacto si perdió sus datos locales (ver el
    // sistema de reconciliación en recovery/reconciliation_manager.js).
    await sendContactAccept(contactId, `Invitación reenviada a @${contactId}`);
}

export async function rejectContactRequestFn(senderId) {
    try {
        await state.contacts.rejectRequest(state.storage, senderId);
        await state.sync.sendBlob(state.currentUser, senderId, {
            type: "contact_reject"
        });
        showToast(`Solicitud de @${senderId} rechazada`);
        renderContactSidebar();
    } catch (e) {
        showToast("Error al rechazar solicitud", true);
    }
}

export async function sendContactRequest(targetAlias) {
    try {
        const targetHash = await sha256(targetAlias);
        console.log(`[sendContactRequest] targetAlias: "${targetAlias}", targetHash: "${targetHash}"`);
        const userRes = await fetch(`/api/user/${targetHash}`);
        if (!userRes.ok) {
            console.error(`[sendContactRequest] fetch failed for ${targetHash}. Status: ${userRes.status}`);
            const errEl = document.getElementById("add-contact-error");
            if (errEl) {
                errEl.textContent = "Destinatario no registrado en el servidor.";
                errEl.classList.remove("hidden");
            }
            return;
        }

        await state.sync.sendBlob(state.currentUser, targetAlias, {
            type: "contact_request"
        });

        await state.contacts.addSentRequest(state.storage, targetAlias);
        document.dispatchEvent(new Event("contacts_updated"));

        showToast(`Solicitud enviada a @${targetAlias}`);
        
        document.getElementById("add-contact-name").value = "";
        const modal = document.getElementById('add-contact-modal');
        if (modal) {
            modal.classList.add('opacity-0');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
        const input = document.getElementById('add-contact-name');
        if (input) input.value = '';
        renderContactSidebar();
    } catch (e) {
        console.error(e);
        const errEl = document.getElementById('add-contact-error');
        if (errEl) {
            errEl.textContent = "Error al enviar solicitud: " + e.message;
            errEl.classList.remove("hidden");
        }
    }
}

export function openChatWithContact() {
    ['settings-modal', 'backup-modal'].forEach(id => {
        const m = document.getElementById(id);
        if (m && !m.classList.contains('hidden')) {
            m.classList.add('opacity-0');
            setTimeout(() => m.classList.add('hidden'), 200);
        }
    });

    state.activeGroup = null;
    const oobStatus = state.contacts.getContactOOBStatus(state.activeContact);
    document.getElementById("chat-header-title").textContent = `@${state.activeContact}`;
    
    const statusEl = document.getElementById("chat-header-status");
    if (oobStatus.mutual) {
        statusEl.innerHTML = '<span class="text-terminalGreen font-bold">🛡️ VERIFICADO OOB (MUTUO)</span> · TÚNEL SEGURIZADO [PQC]';
    } else if (oobStatus.meVerified) {
        statusEl.innerHTML = '<span class="text-yellow-400 font-bold">🛡️ VERIFICADO POR TI</span> · TÚNEL SEGURIZADO [PQC]';
    } else if (oobStatus.peerVerified) {
        statusEl.innerHTML = '<span class="text-cyan-400 font-bold">🛡️ VERIFICÓ TU HUELLA</span> · TÚNEL SEGURIZADO [PQC]';
    } else {
        statusEl.textContent = "TÚNEL SEGURIZADO [PQC ACTIVADO]";
    }

    document.getElementById("active-contact-avatar").textContent = state.activeContact.substring(0, 2).toUpperCase();

    const btnSearchChat = document.getElementById("btn-search-chat");
    if (btnSearchChat) btnSearchChat.classList.remove("hidden");
    
    document.getElementById("btn-back-to-contacts")?.classList.remove("hidden");
    document.getElementById("sidebar-panel")?.classList.add("mobile-hidden");
    document.getElementById("chat-panel")?.classList.add("mobile-visible");

    const verifyBtn = document.getElementById("btn-verify-safety-number");
    if (verifyBtn) {
        verifyBtn.classList.remove("hidden");
        verifyBtn.removeAttribute("disabled");
        if (oobStatus.mutual) {
            verifyBtn.textContent = "[ 🛡️ VERIFICADO OOB ]";
            verifyBtn.className = "text-[8px] bg-terminalGreen/20 border border-terminalGreen text-terminalGreen px-2 py-1 rounded font-bold transition-all uppercase shadow-[0_0_8px_rgba(0,255,102,0.3)]";
        } else {
            verifyBtn.textContent = "[ 🛡️ VERIFICAR HUELLA ]";
            verifyBtn.className = "text-[8px] bg-terminalGreen/10 border border-terminalGreen/40 hover:border-terminalGreen text-terminalGreen px-2 py-1 rounded font-bold transition-all uppercase";
        }
        verifyBtn.onclick = () => {
            openSafetyNumberModal(state, state.activeContact, () => {
                openChatWithContact();
                renderContactSidebar();
            });
        };
    }

    document.getElementById("btn-chat-options").classList.remove("hidden");
    document.getElementById("btn-add-group-member").classList.add("hidden");
    document.getElementById("btn-edit-group-config").classList.add("hidden");
    document.getElementById("btn-leave-group")?.classList.add("hidden");
    document.getElementById("group-members-bar")?.classList.add("hidden");

    const deleteBtn = document.getElementById("btn-delete-conversation");
    deleteBtn.classList.remove("hidden");
    deleteBtn.removeAttribute("disabled");

    const resendInviteBtn = document.getElementById("btn-resend-invite");
    resendInviteBtn.classList.remove("hidden");
    resendInviteBtn.removeAttribute("disabled");

    const deleteContactBtn = document.getElementById("btn-delete-contact");
    deleteContactBtn.classList.remove("hidden");
    deleteContactBtn.removeAttribute("disabled");

    const blockBtn = document.getElementById("btn-block-contact");
    blockBtn.classList.remove("hidden");
    blockBtn.removeAttribute("disabled");

    if (state.contacts.blockedContacts.includes(state.activeContact)) {
        blockBtn.textContent = "Desbloquear Contacto";
    } else {
        blockBtn.textContent = "Bloquear Contacto";
    }

    document.getElementById("indicator-kem")?.classList.add("text-terminalGreen", "border-terminalGreen/40");
    document.getElementById("indicator-sig")?.classList.add("text-terminalGreen", "border-terminalGreen/40");

    if (state.sync) {
        state.sync.activeChatId = state.activeContact;
    }

    document.getElementById("chat-footer").classList.remove("hidden");
    document.getElementById("chat-input").removeAttribute("disabled");
    document.getElementById("btn-send").removeAttribute("disabled");

    state.chatMessages = state.chats.getMessages(state.activeContact);

    let sentAnyReadReceipt = false;
    if (state.privacySettings?.readReceipts !== false && !window.disableReadReceipts) {
        state.chatMessages.forEach(msg => {
            if (msg.sender !== state.currentUser && !msg.readSent) {
                try {
                    state.sync.sendBlob(state.currentUser, state.activeContact, {
                        type: "receipt",
                        subtype: "read",
                        msg_id: msg.id
                    });
                    msg.readSent = true;
                    sentAnyReadReceipt = true;
                } catch (e) {
                    console.error("[main] Error sending read receipt:", e);
                }
            }
        });
    }
    if (sentAnyReadReceipt) {
        state.chats.save(state.storage);
    }

    renderMessages();
    renderContactSidebar();

    const cIdStr = String(state.activeContact);
    const container = document.getElementById("typing-indicator-container");
    const userSpan = document.getElementById("typing-username");
    if (window.typingState && window.typingState[cIdStr] && container && userSpan) {
        userSpan.textContent = `@${window.typingState[cIdStr].username}`;
        container.classList.remove("hidden");
    } else if (container) {
        container.classList.add("hidden");
    }
}

// ── Group UI Delegations ──────────────────────────────────────────
export function renderGroupSidebar() {
    GroupUI.renderGroupSidebar((grp) => openGroupChat(grp));
}

export async function openGroupChat(grp) {
    GroupUI.openGroupChat(grp, renderGroupSidebar, renderContactSidebar, renderMessages);
}

export async function createGroup(name, memberIds) {
    return GroupUI.createGroup(name, memberIds, renderGroupSidebar);
}

export function buildCreateGroupModal() {
    return GroupUI.buildCreateGroupModal();
}

// ── Event Listeners Orquestador ───────────────────────────────────
export function setupChatEventListeners() {
    setupChatInput(audioRecorder, renderMessages, renderContactSidebar);

    const btnChatOptions = document.getElementById("btn-chat-options");
    const chatOptionsMenu = document.getElementById("chat-options-menu");

    if (btnChatOptions && chatOptionsMenu) {
        btnChatOptions.addEventListener("click", (e) => {
            e.stopPropagation();
            chatOptionsMenu.classList.toggle("hidden");
        });

        document.addEventListener("click", (e) => {
            if (!chatOptionsMenu.contains(e.target) && !btnChatOptions.contains(e.target)) {
                chatOptionsMenu.classList.add("hidden");
            }
        });
    }

    const btnBackToContacts = document.getElementById("btn-back-to-contacts");
    if (btnBackToContacts) {
        btnBackToContacts.addEventListener("click", () => {
            state.activeContact = null;
            state.activeGroup = null;
            
            document.getElementById("chat-header-title").textContent = "Selecciona un chat";
            document.getElementById("chat-header-status").textContent = "CANAL DESACOPLADO";
            document.getElementById("active-contact-avatar").textContent = "?";
            document.getElementById("chat-footer").classList.add("hidden");
            document.getElementById("chat-messages").innerHTML = "";
            document.getElementById("btn-chat-options")?.classList.add("hidden");
            document.getElementById("btn-back-to-contacts")?.classList.add("hidden");
            document.getElementById("sidebar-panel")?.classList.remove("mobile-hidden");
            document.getElementById("chat-panel")?.classList.remove("mobile-visible");
            
            renderContactSidebar();
            renderGroupSidebar();
        });
    }

    const btnAddContact = document.getElementById("btn-add-contact");
    const addContactInput = document.getElementById("add-contact-name");
    const addModal = document.getElementById("add-contact-modal");
    const btnOpenModal = document.getElementById("btn-open-add-modal");
    const btnCloseModal = document.getElementById("btn-close-add-modal");
    const btnDeleteConv = document.getElementById("btn-delete-conversation");
    const btnDeleteContact = document.getElementById("btn-delete-contact");
    const btnBlockContact = document.getElementById("btn-block-contact");
    const btnResendInvite = document.getElementById("btn-resend-invite");
    const btnEditGroupConfig = document.getElementById("btn-edit-group-config");
    const btnLeaveGroup = document.getElementById("btn-leave-group");

    if (btnEditGroupConfig) {
        btnEditGroupConfig.onclick = async () => {
            if (!state.activeGroup) return;
            const grp = state.groups.userGroups.find(g => g.id === state.activeGroup);
            if (!grp) return;
            
            const newName = await modalManager.prompt('[ EDITAR GRUPO ]', 'Ingresa el nuevo nombre para el grupo:', grp.name);
            if (newName && newName !== grp.name) {
                await state.groups.updateGroupName(state.storage, state.activeGroup, newName);
                
                // Notificar a los otros miembros del cambio de nombre
                for (const memberId of grp.members) {
                    if (memberId !== state.currentUser) {
                        state.sync.sendBlob(state.currentUser, memberId, {
                            type: "group_rename",
                            group_id: state.activeGroup,
                            new_name: newName
                        }).catch(e => console.error("Error notificando renombramiento de grupo", e));
                    }
                }

                showToast('Nombre del grupo actualizado y notificado al equipo.');
                document.getElementById("chat-header-title").textContent = `# ${newName}`;
                document.getElementById("active-contact-avatar").textContent = newName.substring(0, 2).toUpperCase();
                renderGroupSidebar();
            }

            const rotateConfirmed = await modalManager.confirm('[ ROTACIÓN DE CLAVES ]', '¿Deseas rotar la clave simétrica AES del grupo ahora para renovar la seguridad (Forward Secrecy)?');
            if (rotateConfirmed) {
                const newKeyBytes = crypto.getRandomValues(new Uint8Array(32));
                const newKeyHex = Array.from(newKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
                await state.groups.rotateGroupKey(state.storage, state.activeGroup, newKeyHex);
                for (const memberId of grp.members) {
                    if (memberId !== state.currentUser) {
                        state.sync.sendBlob(state.currentUser, memberId, {
                            type: "group_rekey",
                            group_id: state.activeGroup,
                            new_symmetric_key: newKeyHex
                        }).catch(() => {});
                    }
                }
                showToast('Claves del grupo rotadas y distribuidas con éxito.');
            }
        };
    }

    if (btnDeleteConv) {
        btnDeleteConv.onclick = async () => {
            const isGroup = !!state.activeGroup;
            const targetId = isGroup ? state.activeGroup : state.activeContact;
            if (!targetId) return;

            const confirmed = await modalManager.confirm(
                '[ ELIMINAR CONVERSACIÓN ]', 
                `¿Seguro que deseas eliminar permanentemente la conversación con ${isGroup ? 'el grupo' : '@'}${targetId}? Esta acción no se puede deshacer y borrará todos los mensajes locales.`
            );
            
            if (confirmed) {
                // Delete messages from indexedDB
                await state.chats.deleteHistory(state.storage, targetId);
                
                // Clear UI
                if (state.activeContact === targetId) state.activeContact = null;
                if (state.activeGroup === targetId) state.activeGroup = null;
                
                document.getElementById("btn-back-to-contacts")?.click();
                showToast('Conversación eliminada');
                
                // Refresh UI
                if (isGroup) {
                    renderGroupSidebar();
                } else {
                    renderContactSidebar();
                }
            }
        };
    }

    if (btnLeaveGroup) {
        btnLeaveGroup.onclick = async () => {
            if (!state.activeGroup) return;
            const confirmed = await modalManager.confirm('[ SALIR DEL GRUPO ]', '¿Seguro que deseas salir de este grupo? Todos los mensajes y accesos se eliminarán.');
            if (confirmed) {
                const targetGroupId = state.activeGroup;
                
                // Enviar aviso a los demas (simplificado: enviamos config_change o simplemente salimos localmente si no implementado)
                try {
                    const grp = state.groups.userGroups.find(g => g.id === targetGroupId);
                    if (grp) {
                        for (const memberId of grp.members) {
                            if (memberId !== state.currentUser) {
                                state.sync.sendBlob(state.currentUser, memberId, {
                                    type: "group_member_leave",
                                    group_id: targetGroupId
                                }).catch(e => console.error("Error notifying leave", e));
                            }
                        }
                    }
                } catch(e) {}
                
                // Purga local profunda
                await state.groups.removeMember(state.storage, targetGroupId, state.currentUser);
                await state.groups.deleteGroup(state.storage, targetGroupId);
                await state.chats.deleteHistory(state.storage, targetGroupId);
                
                state.activeGroup = null;
                document.getElementById("btn-back-to-contacts")?.click();
                showToast('Has salido del grupo y eliminado el historial');
                renderGroupSidebar();
            }
        };
    }

    const btnAddGroupMember = document.getElementById("btn-add-group-member");
    const addMemberSelect = document.getElementById("add-member-select");
    const btnConfirmAddMember = document.getElementById("btn-confirm-add-member");

    if (btnAddGroupMember) {
        btnAddGroupMember.onclick = () => {
            const memberModal = document.getElementById("add-member-modal");
            if (memberModal && state.activeGroup) {
                if (addMemberSelect) {
                    addMemberSelect.innerHTML = "";
                    const grp = state.groups.userGroups.find(g => g.id === state.activeGroup);
                    if (grp) {
                        const memberIds = new Set(grp.members);
                        const availableContacts = (state.contacts?.contacts || []).filter(c => !memberIds.has(c));
                        if (availableContacts.length === 0) {
                            addMemberSelect.innerHTML = `<option disabled selected>No hay contactos disponibles</option>`;
                            if (btnConfirmAddMember) btnConfirmAddMember.disabled = true;
                        } else {
                            if (btnConfirmAddMember) btnConfirmAddMember.disabled = false;
                            availableContacts.forEach(c => {
                                const opt = document.createElement("option");
                                opt.value = c;
                                opt.textContent = `@${c}`;
                                addMemberSelect.appendChild(opt);
                            });
                        }
                    }
                }

                memberModal.classList.remove("hidden");
                setTimeout(() => memberModal.classList.remove("opacity-0"), 10);
            }
        };
    }

    if (btnConfirmAddMember) {
        btnConfirmAddMember.onclick = async () => {
            const userId = addMemberSelect ? addMemberSelect.value : null;
            if (!userId || !state.activeGroup) return;

            try {
                btnConfirmAddMember.textContent = "[ AGREGANDO... ]";
                btnConfirmAddMember.disabled = true;
                
                const grp = state.groups.userGroups.find(g => g.id === state.activeGroup);
                if (!grp) return;

                await state.groups.addMember(state.storage, state.activeGroup, userId);

                // Rotar la clave del grupo al agregar un miembro: evita reciclar
                // indefinidamente la misma clave simétrica hacia gente nueva (ver
                // BACKLOG.md #4). grp.members ya incluye a userId (addMember lo agregó).
                const newKeyHex = GroupUI.generateGroupKeyHex();
                await state.groups.rotateGroupKey(state.storage, state.activeGroup, newKeyHex);

                // Enviar invitación completa al nuevo miembro (ya con la clave rotada)
                await state.sync.sendBlob(state.currentUser, userId, {
                    type: "group_invite",
                    group_id: grp.id,
                    group_name: grp.name,
                    creator_id: grp.creator_id,
                    members: grp.members,
                    symmetric_key: newKeyHex
                });

                // Notificar a los miembros existentes del nuevo ingreso y distribuirles
                // la clave rotada
                for (const memberId of grp.members) {
                    if (memberId !== state.currentUser && memberId !== userId) {
                        state.sync.sendBlob(state.currentUser, memberId, {
                            type: "group_add_member",
                            group_id: grp.id,
                            user_id: userId
                        }).catch(e => console.error("Error notificando nuevo miembro", e));
                        state.sync.sendBlob(state.currentUser, memberId, {
                            type: "group_rekey",
                            group_id: grp.id,
                            new_symmetric_key: newKeyHex
                        }).catch(() => {});
                    }
                }

                showToast(`Se agregó a @${userId} al grupo.`);
                
                const memberModal = document.getElementById("add-member-modal");
                if (memberModal) {
                    memberModal.classList.add("opacity-0");
                    setTimeout(() => memberModal.classList.add("hidden"), 300);
                }

                openGroupChat(grp);
            } catch (err) {
                console.error("Error agregando miembro:", err);
                showToast(`Error al agregar miembro: ${err.message}`, true);
            } finally {
                btnConfirmAddMember.textContent = "[ AGREGAR AL GRUPO ]";
                btnConfirmAddMember.disabled = false;
            }
        };
    }

    document.addEventListener("contacts_updated", () => {
        renderContactSidebar();
    });

    if (btnOpenModal) {
        btnOpenModal.onclick = () => {
            if (addModal) {
                addModal.classList.remove("hidden");
                setTimeout(() => addModal.classList.remove("opacity-0"), 10);
            }
        };
    }

    if (btnCloseModal) {
        btnCloseModal.onclick = () => {
            if (addModal) {
                addModal.classList.add("opacity-0");
                setTimeout(() => addModal.classList.add("hidden"), 300);
            }
        };
    }

    if (btnAddContact) {
        btnAddContact.onclick = async () => {
            const targetAlias = addContactInput.value.trim().toLowerCase();
            if (!targetAlias || !/^[a-zA-Z0-9_-]{3,20}$/.test(targetAlias)) {
                showToast('Alias inválido (3-20 caracteres alfanuméricos)', true);
                return;
            }
            if (state.currentUser && targetAlias === state.currentUser.toLowerCase()) {
                showToast('No puedes agregarte a ti mismo', true);
                return;
            }
            const existingContact = state.contacts.contactData.find(c => c.contact_id === targetAlias);
            if (existingContact) {
                if (existingContact.status === 'accepted') {
                    if (!state.contacts.contacts.includes(targetAlias)) {
                        state.contacts.contacts.push(targetAlias);
                        await state.contacts.save(state.storage);
                        renderContactSidebar();
                    }
                    showToast('Este contacto ya está en tu lista');
                    return;
                } else if (existingContact.status === 'pending_sent') {
                    showToast('Ya enviaste una solicitud a este usuario');
                    return;
                } else if (existingContact.status === 'pending_received') {
                    await acceptContactRequest(targetAlias);
                    return;
                }
            }
            await sendContactRequest(targetAlias);
        };
    }

    if (btnDeleteConv) {
        btnDeleteConv.onclick = async () => {
            const targetId = state.activeContact || state.activeGroup;
            if (!targetId) return;
            const name = state.activeGroup ? state.groups.userGroups.find(g => g.id === targetId)?.name : targetId;
            const confirmed = await modalManager.confirm('[ VACIAR HISTORIAL ]', `¿Seguro que deseas vaciar el historial con ${name}?`);
            if (confirmed) {
                await state.chats.deleteHistory(state.storage, targetId);
                state.chatMessages = [];
                renderMessages();
                showToast('Historial vaciado');
            }
        };
    }

    if (btnResendInvite) {
        btnResendInvite.onclick = async () => {
            if (!state.activeContact) return;
            document.getElementById("chat-options-menu")?.classList.add("hidden");
            await resendContactInvite(state.activeContact);
        };
    }

    if (btnDeleteContact) {
        btnDeleteContact.onclick = async () => {
            if (!state.activeContact) return;
            const confirmed = await modalManager.confirm('[ ELIMINAR CONTACTO ]', `¿Seguro que deseas eliminar a @${state.activeContact} de tus contactos? Se vaciará el historial.`);
            if (confirmed) {
                try {
                    await state.contacts.removeContact(state.storage, state.activeContact);
                    await state.chats.deleteHistory(state.storage, state.activeContact);

                    try {
                        await state.sync.sendBlob(state.currentUser, state.activeContact, {
                            type: "contact_reject"
                        });
                    } catch (e) {}

                    state.activeContact = null;
                    
                    document.getElementById("btn-chat-options")?.classList.add("hidden");
                    btnDeleteConv.classList.add("hidden");
                    btnDeleteConv.setAttribute("disabled", "true");
                    btnDeleteContact.classList.add("hidden");
                    btnDeleteContact.setAttribute("disabled", "true");
                    btnBlockContact.classList.add("hidden");
                    btnBlockContact.setAttribute("disabled", "true");
                    document.getElementById("chat-footer").classList.add("hidden");

                    document.getElementById("chat-header-title").textContent = "Selecciona un chat";
                    document.getElementById("chat-header-status").textContent = "CANAL DESACOPLADO";
                    document.getElementById("active-contact-avatar").textContent = "?";
                    document.getElementById("chat-input").setAttribute("disabled", "true");
                    document.getElementById("btn-send").setAttribute("disabled", "true");
                    
                    renderContactSidebar();
                    renderMessages();
                } catch (e) {
                    showToast('Error al eliminar contacto', true);
                }
            }
        };
    }

    if (btnBlockContact) {
        btnBlockContact.onclick = async () => {
            if (!state.activeContact) return;
            const isBlocked = state.contacts.blockedContacts.includes(state.activeContact);
            if (isBlocked) {
                await state.contacts.unblockContact(state.storage, state.activeContact);
            } else {
                await state.contacts.blockContact(state.storage, state.activeContact);
            }
            openChatWithContact();
            renderContactSidebar();
        };
    }


    // -- Lógica de Búsqueda de Mensajes --
    const btnSearchChat = document.getElementById("btn-search-chat");
    const chatSearchContainer = document.getElementById("chat-search-container");
    const chatSearchInput = document.getElementById("chat-search-input");
    const btnChatSearchNext = document.getElementById("btn-chat-search-next");
    const btnChatSearchPrev = document.getElementById("btn-chat-search-prev");
    
    let searchResults = [];
    let currentSearchIndex = -1;

    if (btnSearchChat && chatSearchContainer && chatSearchInput) {
        btnSearchChat.onclick = () => {
            chatSearchContainer.classList.toggle("hidden");
            if (!chatSearchContainer.classList.contains("hidden")) {
                chatSearchInput.focus();
            } else {
                searchResults = [];
                currentSearchIndex = -1;
                chatSearchInput.value = "";
            }
        };

        chatSearchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            if (!query) {
                searchResults = [];
                currentSearchIndex = -1;
                return;
            }

            searchResults = state.chatMessages.filter(msg => {
                return msg.plaintext && msg.plaintext.toLowerCase().includes(query);
            });

            currentSearchIndex = searchResults.length > 0 ? searchResults.length - 1 : -1;
            scrollToSearchResult();
        });

        const scrollToSearchResult = () => {
            if (currentSearchIndex >= 0 && currentSearchIndex < searchResults.length) {
                const targetMsgId = searchResults[currentSearchIndex].id;
                const msgEl = document.getElementById(`msg-${targetMsgId}`);
                if (msgEl) {
                    msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
                    msgEl.classList.add("ring-2", "ring-terminalGreen", "bg-terminalGreen/20");
                    setTimeout(() => msgEl.classList.remove("ring-2", "ring-terminalGreen", "bg-terminalGreen/20"), 1500);
                }
            }
        };

        if (btnChatSearchPrev) {
            btnChatSearchPrev.onclick = () => {
                if (searchResults.length > 0) {
                    currentSearchIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
                    scrollToSearchResult();
                }
            };
        }

        if (btnChatSearchNext) {
            btnChatSearchNext.onclick = () => {
                if (searchResults.length > 0) {
                    currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
                    scrollToSearchResult();
                }
            };
        }
    }

    // -- Lógica de Indicador de Escritura (Chat activo y Sidebar) --
    // Convertimos los temporizadores en un estado global para sobrevivir re-renders
    if (!window.typingState) window.typingState = {};

    document.addEventListener("typing_indicator", (e) => {
        const { chatId, username, isGroup } = e.detail;
        const cIdStr = String(chatId);
        const isGrp = isGroup || (state.groups && state.groups.userGroups.some(g => String(g.id) === cIdStr));

        // Actualizar el estado global en memoria
        window.typingState[cIdStr] = {
            username: username,
            isGroup: isGrp,
            timestamp: Date.now()
        };

        // 1. Mostrar en el Chat Activo
        if (String(state.activeContact || "") === cIdStr || String(state.activeGroup || "") === cIdStr) {
            const container = document.getElementById("typing-indicator-container");
            const userSpan = document.getElementById("typing-username");
            if (container && userSpan) {
                if (isGrp) {
                    userSpan.textContent = `@${username} está escribiendo en el grupo`;
                } else {
                    userSpan.textContent = `@${username}`;
                }
                container.classList.remove("hidden");
                
                if (window.typingState[cIdStr].timer) clearTimeout(window.typingState[cIdStr].timer);
                window.typingState[cIdStr].timer = setTimeout(() => {
                    container.classList.add("hidden");
                    delete window.typingState[cIdStr];
                }, 4000);
            }
        }

        // 2. Mostrar en el Sidebar (Contactos 1:1 o Grupos)
        document.querySelectorAll('.typing-sidebar-badge').forEach(badge => {
            if (String(badge.dataset.chatId || "") === cIdStr) {
                if (isGrp) {
                    badge.textContent = `✍️ @${username} escribiendo...`;
                } else {
                    badge.textContent = `✍️ escribiendo...`;
                }
                badge.classList.remove('hidden');

                if (window.typingState[cIdStr].sidebarTimer) clearTimeout(window.typingState[cIdStr].sidebarTimer);
                window.typingState[cIdStr].sidebarTimer = setTimeout(() => {
                    badge.classList.add('hidden');
                    if (window.typingState[cIdStr] && !window.typingState[cIdStr].timer) {
                        delete window.typingState[cIdStr];
                    }
                }, 4000);
            }
        });
    });
}
