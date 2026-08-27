// --- INICIO: PRODUCTION LOGGER OVERRIDE ---
if (typeof window !== 'undefined' && localStorage.getItem('HERMES_DEBUG') !== 'true') {
    window.console.log = function() {};
    window.console.info = function() {};
    window.console.debug = function() {};
    window.console.trace = function() {};
}
// --- FIN: PRODUCTION LOGGER OVERRIDE ---

import './style.css';
import { state, showToast } from './js/state.js';
import { modalManager } from './js/ui/modal_manager.js';
import { apiFetch } from './js/api.js';

window.modalManager = modalManager;
window.fetch = apiFetch;

import './js/crypto_client.js';
import { AuthValidator } from './js/auth.js';
import {
    setupAuthEventListeners,
    setupSettingsDropdown,
    tryRestoreSession,
    executeWipeLogout
} from './js/auth_ui.js';
import {
    setupBackupRestoreListeners,
    loadBackupsList
} from './js/backup_ui.js';
import {
    setupChatEventListeners,
    buildCreateGroupModal,
    createGroup,
    openGroupChat,
    openEphemeralImageModal,
} from './js/chat_ui.js';
import { setupRecoveryUI } from './js/recovery_ui.js';
import { securityMonitor } from './js/security_monitor.js';
import { hermesTour } from './js/onboarding_tour.js';
import './js/group_crypto.js';
import './js/privacy_settings.js';
import './js/ui/theme_manager.js';
import './js/ephemeral_audio.js';
import { finalEvaluation } from './js/final_evaluation.js';
import { chatSelector } from './js/chat_selector.js';
import { verifier } from './js/messaging_tests.js';
import './js/crypto_wasm_bridge.js';
import './js/timing_verifier.js';
import './js/double_ratchet.js';
import './js/audio_engine_pro.js';
import './js/admin_pro.js';
import './js/i18n.js';
import { verifierSuite } from './js/verification_suite.js';
import { appInitializer } from './js/app_initializer.js';
import { hermesNotifications } from './js/ui/hermes_notifications.js';

// Global toggles for login/register
window.togglePasswordVisibility = (id) => {
    const input = document.getElementById(id);
    if (input) {
        input.type = input.type === "password" ? "text" : "password";
    }
};

window.showRegisterView = () => {
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("register-view").classList.remove("hidden");
    document.getElementById("account-select-view").classList.add("hidden");
};

window.showLoginView = () => {
    document.getElementById("register-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("account-select-view").classList.add("hidden");
};

window.openCreateGroupModal = () => {
    buildCreateGroupModal();
};

window.submitCreateGroup = async () => {
    const btn = document.getElementById('btn-submit-create-group');
    if (btn && btn.disabled) return;

    const nameEl = document.getElementById('cg-name');
    const name = nameEl ? nameEl.value.trim() : '';
    const checked = [...document.querySelectorAll('.cg-member-check:checked')].map(el => el.value);

    if (!name) {
        await modalManager.alert('[ CAMPO REQUERIDO ]', 'Ingrese un nombre para el grupo.', 'error');
        return;
    }
    if (checked.length < 2) {
        await modalManager.alert('[ MIEMBROS INSUFICIENTES ]', 'Debe seleccionar al menos 2 miembros (para ser 3+ en total).', 'error');
        return;
    }

    if (btn) btn.disabled = true;
    try {
        await createGroup(name, checked);
        if (nameEl) nameEl.value = '';
    } catch (e) {
        console.error("Error creating group:", e);
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.removeGroupMemberFn = async function(userId) {
    if (!state.activeGroup) return;
    const grp = state.groups.userGroups.find(g => g.id === state.activeGroup);
    if (!grp) return;

    const confirmed = await modalManager.confirm('[ CONFIRMAR ELIMINACIÓN ]', `¿Eliminar a @${userId} del grupo?`);
    if (!confirmed) return;
    try {
        // Notificar al miembro eliminado antes de rotar la clave
        await state.sync.sendBlob(state.currentUser, userId, {
            type: "group_remove_member",
            group_id: state.activeGroup,
            user_id: userId
        }).catch(() => {});

        await state.groups.removeMember(state.storage, state.activeGroup, userId);

        // Rotación automática de clave simétrica (Forward Secrecy inside Group)
        const newKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const newKeyHex = Array.from(newKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        await state.groups.rotateGroupKey(state.storage, state.activeGroup, newKeyHex);

        // Enviar notificación de remoción y nueva clave a los miembros restantes
        for (const targetId of grp.members) {
            if (targetId === state.currentUser) continue;
            await state.sync.sendBlob(state.currentUser, targetId, {
                type: "group_remove_member",
                group_id: state.activeGroup,
                user_id: userId
            }).catch(() => {});

            await state.sync.sendBlob(state.currentUser, targetId, {
                type: "group_rekey",
                group_id: state.activeGroup,
                new_symmetric_key: newKeyHex
            }).catch(() => {});
        }

        showToast(`@${userId} eliminado y claves del grupo rotadas por seguridad.`);
        openGroupChat(grp);
    } catch (e) {
        showToast('Error al eliminar miembro', true);
    }
};

window.openAddMemberModal = () => {
    const select = document.getElementById("add-member-select");
    if (!select) return;
    select.innerHTML = "";
    
    const grp = state.groups.userGroups.find(g => g.id === state.activeGroup);
    if (!grp) return;

    const candidates = state.contacts.contacts.filter(c => !grp.members.includes(c));
    if (candidates.length === 0) {
        select.innerHTML = '<option value="">Sin contactos para agregar</option>';
    } else {
        candidates.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = `@${c}`;
            select.appendChild(opt);
        });
    }
    
    const modal = document.getElementById("add-member-modal");
    modal.classList.remove("hidden");
    setTimeout(() => modal.classList.remove("opacity-0"), 10);
};

window.submitAddMember = async () => {
    const select = document.getElementById("add-member-select");
    if (!select || !state.activeGroup) return;
    
    const userId = select.value;
    if (!userId) return;
    
    const grp = state.groups.userGroups.find(g => g.id === state.activeGroup);
    if (!grp) return;
    
    try {
        await state.groups.addMember(state.storage, state.activeGroup, userId);
        
        for (const targetId of grp.members) {
            await state.sync.sendBlob(state.currentUser, targetId, {
                type: "group_invite",
                group_id: state.activeGroup,
                group_name: grp.name,
                creator_id: grp.creator_id,
                members: grp.members,
                symmetric_key: grp.symmetric_key
            });
        }
        
        const modal = document.getElementById("add-member-modal");
        modal.classList.add("opacity-0");
        setTimeout(() => modal.classList.add("hidden"), 300);
        
        openGroupChat(grp);
    } catch (e) {
        console.error(e);
        showToast('Error al agregar miembro', true);
    }
};

window.openEditGroupModal = () => {
    const grp = state.groups.userGroups.find(g => g.id === state.activeGroup);
    if (!grp) return;
    
    document.getElementById("edit-group-name").value = grp.name;
    
    const modal = document.getElementById("edit-group-modal");
    modal.classList.remove("hidden");
    setTimeout(() => modal.classList.remove("opacity-0"), 10);
};

window.submitEditGroup = async () => {
    const nameInput = document.getElementById("edit-group-name");
    if (!nameInput || !state.activeGroup) return;
    
    const newName = nameInput.value.trim();
    if (!newName) return;
    
    const grp = state.groups.userGroups.find(g => g.id === state.activeGroup);
    if (!grp) return;
    
    try {
        await state.groups.updateGroupName(state.storage, state.activeGroup, newName);
        
        for (const targetId of grp.members) {
            await state.sync.sendBlob(state.currentUser, targetId, {
                type: "group_rename",
                group_id: state.activeGroup,
                new_name: newName
            });
        }
        
        const modal = document.getElementById("edit-group-modal");
        modal.classList.add("opacity-0");
        setTimeout(() => modal.classList.add("hidden"), 300);
        
        openGroupChat(grp);
    } catch (e) {
        console.error(e);
        showToast('Error al editar grupo', true);
    }
};

window.closeInspector = () => {
    const modal = document.getElementById("inspector-modal");
    modal.classList.add("opacity-0");
    setTimeout(() => modal.classList.add("hidden"), 300);
};

window.switchInspectorTab = (tab) => {
    const tabs = ["envelope", "crypto", "stego"];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const content = document.getElementById(`tab-content-${t}`);
        if (t === tab) {
            btn.classList.add("border-terminalGreen", "text-white");
            btn.classList.remove("border-transparent", "text-gray-500");
            content.classList.remove("hidden");
        } else {
            btn.classList.remove("border-terminalGreen", "text-white");
            btn.classList.add("border-transparent", "text-gray-500");
            content.classList.add("hidden");
        }
    });
};

// Initialize on load
function initApp() {
    const steps = [
        ["setupAuthEventListeners", setupAuthEventListeners],
        ["setupSettingsDropdown", setupSettingsDropdown],
        ["setupBackupRestoreListeners", setupBackupRestoreListeners],
        ["setupRecoveryUI", setupRecoveryUI],
        ["setupMultiTabSynchronization", setupMultiTabSynchronization],
        ["setupFetchInterceptor", setupFetchInterceptor],
        ["appInitializer", () => appInitializer.initialize()],
        ["tryRestoreSession", tryRestoreSession],
        ["AuthValidator", () => new AuthValidator()]
    ];

    for (const [name, fn] of steps) {
        try {
            fn();
        } catch (e) {
            console.error(`[Init] Error in ${name}:`, e);
        }
    }

    // Bind group modals confirm buttons
    const confirmAddBtn = document.getElementById("btn-confirm-add-member");
    if (confirmAddBtn) confirmAddBtn.onclick = window.submitAddMember;

    const saveGroupEditBtn = document.getElementById("btn-save-group-edit");
    if (saveGroupEditBtn) saveGroupEditBtn.onclick = window.submitEditGroup;

    // Start Paranoid Security Monitor
    // Only run automated evaluation suite if requested via query param or console
    window.runHermesTests = () => {
        finalEvaluation.evaluate();
        verifier.runAllTests();
        verifierSuite.runAll();
    };
    if (window.location.search.includes('run_tests=true')) {
        setTimeout(() => window.runHermesTests(), 500);
    }


    // Attach Tour listener (solo al crear cuenta)
    document.addEventListener('hermes:account_created', () => {
        const checkModal = setInterval(() => {
            const modal = document.getElementById('onboarding-modal');
            if (!modal || modal.classList.contains('hidden')) {
                clearInterval(checkModal);
                setTimeout(() => hermesTour.start(true), 300);
            }
        }, 500);
    });

    // Click outside any modal to close it
    setupModalClickOutside();

    // Setup custom notifications toggle
    setupNotificationToggle();
}

function setupNotificationToggle() {
    const toggle = document.getElementById('toggle-custom-notifications');
    if (toggle) {
        // Load saved state
        toggle.checked = hermesNotifications.enabled;
        toggle.addEventListener('change', () => {
            hermesNotifications.setEnabled(toggle.checked);
            showToast(toggle.checked ? '🔔 Notificaciones activadas' : '🔕 Notificaciones desactivadas');
        });
    }

    // Listen for incoming messages and show notifications
    document.addEventListener('hermes:new_message', (e) => {
        const { sender } = e.detail || {};
        if (sender && sender !== state.currentUser) {
            hermesNotifications.show(sender);
        }
    });
}

/**
 * For every full-screen overlay modal, close it when clicking the backdrop 
 * (the dark area outside the inner content panel).
 */
function setupModalClickOutside() {
    const modalIds = [
        'settings-modal', 'backup-modal',
        'add-contact-modal', 'inspector-modal', 'disable-modal',
        'create-group-modal', 'edit-group-modal', 'add-member-modal',
        'onboarding-modal'
    ];

    modalIds.forEach(id => {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        overlay.addEventListener('click', (e) => {
            // Only close if clicking the overlay itself (not inner content)
            if (e.target === overlay) {
                overlay.classList.add('opacity-0');
                setTimeout(() => overlay.classList.add('hidden'), 300);
            }
        });
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}

function setupMultiTabSynchronization() {
    window.addEventListener('storage', (e) => {
        if (e.key === 'logout_all_signal') {
            executeWipeLogout();
        }
    });
}

function setupFetchInterceptor() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let [resource, config] = args;
        config = config || {};
        config.headers = config.headers || {};

        if (state && state.currentUser) {
            const alias = typeof state.currentUser === 'string' ? state.currentUser : (state.currentUser.alias || '');
            if (alias) {
                const ts = Date.now().toString();
                const nonce = Math.random().toString(36).substring(2, 10);
                const proofPayload = `${alias}:${ts}:${nonce}`;
                
                if (config.headers instanceof Headers) {
                    config.headers.set('X-Hermes-User', alias);
                    config.headers.set('X-Hermes-Auth-Token', localStorage.getItem('user_id_hash') || 'authenticated');
                    config.headers.set('X-Hermes-Timestamp', ts);
                    config.headers.set('X-Hermes-Nonce', nonce);
                    config.headers.set('X-Hermes-Proof', proofPayload);
                } else {
                    config.headers['X-Hermes-User'] = alias;
                    config.headers['X-Hermes-Auth-Token'] = localStorage.getItem('user_id_hash') || 'authenticated';
                    config.headers['X-Hermes-Timestamp'] = ts;
                    config.headers['X-Hermes-Nonce'] = nonce;
                    config.headers['X-Hermes-Proof'] = proofPayload;
                }
            }
        }
        return originalFetch(resource, config);
    };
}

