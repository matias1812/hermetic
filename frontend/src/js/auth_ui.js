// auth_ui.js
import { state, sha256, showToast } from './state.js';
import { modalManager } from './ui/modal_manager.js';
import { SyncManager } from './sync_manager.js';
import { BackupManager } from './backup_manager.js';
import { renderContactSidebar, renderGroupSidebar, setupChatEventListeners, renderMessages } from './chat_ui.js';
import { loadBackupsList, startBackupReminder } from './backup_ui.js';
import { recoverySystem } from './recovery_system_complete.js';
import { hermesStore } from './store/hermes_store.js';
import { MemorySanitizer } from './memory_sanitizer.js';


export function loadAllLocalIdentities() {
    const list = [];
    const PREFIX = "_hermes_lock_test_";
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(PREFIX)) {
            const idHash = key.substring(PREFIX.length);
            if (idHash === "default") {
                localStorage.removeItem(key);
                continue;
            }
            const alias = localStorage.getItem("hermes_alias_" + idHash) || ("id_" + idHash.substring(0, 8));
            list.push({ idHash, alias });
        }
    }
    return list;
}

export function showAccountSelector() {
    const listContainer = document.getElementById("saved-accounts-list");
    if (!listContainer) return;

    const identities = loadAllLocalIdentities();
    listContainer.innerHTML = "";

    identities.forEach(ident => {
        const btn = document.createElement("button");
        btn.className = "w-full text-left bg-black border border-darkGrey hover:border-terminalGreen p-3 rounded flex items-center justify-between text-xs transition-colors group mb-2";
        
        const isFallback = ident.alias.startsWith("id_");
        const displayName = isFallback ? `Cuenta Cifrada (${ident.alias.substring(3)})` : `@${ident.alias}`;

        btn.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-terminalGreen font-mono">&gt;</span>
                <span class="text-white font-bold font-mono">${displayName}</span>
            </div>
            <span class="text-gray-500 group-hover:text-terminalGreen text-[9px] font-mono transition-colors">&gt; DESBLOQUEAR</span>
        `;
        btn.addEventListener("click", () => {
            showUnlockScreenFor(ident.alias, ident.idHash);
        });
        listContainer.appendChild(btn);
    });

    document.getElementById("view-auth").classList.remove("hidden");
    document.getElementById("account-select-view").classList.remove("hidden");
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("register-view").classList.add("hidden");
}

export function showUnlockScreenFor(alias, idHash) {
    document.getElementById("view-auth").classList.remove("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("register-view").classList.add("hidden");
    document.getElementById("account-select-view").classList.add("hidden");
    
    const loginAlias = document.getElementById("login-alias");
    const isFallback = alias.startsWith("id_");

    if (isFallback) {
        document.getElementById("auth-prompt-title").textContent = "[ IDENTIFICAR Y DESBLOQUEAR ]";
        loginAlias.value = "";
        loginAlias.placeholder = "Ingresa tu alias (ej. k3szz)...";
        loginAlias.removeAttribute("disabled");
    } else {
        document.getElementById("auth-prompt-title").textContent = "[ DESBLOQUEAR ]";
        loginAlias.value = alias;
        loginAlias.setAttribute("disabled", "true");
    }
    
    document.getElementById("btn-login").textContent = "[ DESBLOQUEAR ]";
    
    const saved = loadAllLocalIdentities();
    const backContainer = document.getElementById("login-back-to-selector-container");
    if (saved.length > 0) {
        backContainer.classList.remove("hidden");
    } else {
        backContainer.classList.add("hidden");
    }

    const loginPassword = document.getElementById("login-password");
    loginPassword.value = "";
    loginPassword.focus();
}

export function showLoginScreen() {
    document.getElementById("view-auth").classList.remove("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("register-view").classList.add("hidden");
    document.getElementById("account-select-view").classList.add("hidden");
    
    document.getElementById("auth-prompt-title").textContent = "[ INICIAR SESIÓN ]";
    
    const loginAlias = document.getElementById("login-alias");
    loginAlias.value = "";
    loginAlias.removeAttribute("disabled");
    
    document.getElementById("btn-login").textContent = "[ AUTENTICAR ]";
    
    const saved = loadAllLocalIdentities();
    const backContainer = document.getElementById("login-back-to-selector-container");
    if (saved.length > 0) {
        backContainer.classList.remove("hidden");
    } else {
        backContainer.classList.add("hidden");
    }

    document.getElementById("login-password").value = "";
}

export async function forgetAllIdentities() {
    const confirmed = await modalManager.confirm('[ OLVIDAR IDENTIDADES ]', "¿Seguro que deseas olvidar todas las identidades locales? Las llaves y mensajes se mantendrán cifrados en el dispositivo, pero no podrás acceder a ellos a menos que ingreses el mismo alias y contraseña.");
    if (!confirmed) {
        return;
    }
    
    const PREFIX = "_hermes_lock_test_";
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(PREFIX)) {
            const idHash = key.substring(PREFIX.length);
            keysToRemove.push(key);
            keysToRemove.push("hermes_alias_" + idHash);
        }
    }
    
    keysToRemove.push("hermes_alias_legacy");
    keysToRemove.forEach(k => localStorage.removeItem(k));
    
    showLoginScreen();
}

export async function tryRestoreSession() {
    const storedUserHash = sessionStorage.getItem("session_user_id_hash");
    if (storedUserHash) {
        const cachedPass = sessionStorage.getItem("session_pass");
        if (cachedPass) {
            try {
                const alias = localStorage.getItem("hermes_alias_" + storedUserHash) || localStorage.getItem("hermes_alias_legacy") || "";
                if (!alias) {
                    throw new Error("Alias local extraviado, forzando relogin");
                }
                state.storage.setUserId(storedUserHash);
                const unlocked = await state.storage.unlock(cachedPass);
                if (unlocked) {
                    await doLoginTransition(alias, cachedPass);
                    return;
                }
            } catch (e) {
                console.warn("[Auth] Error al restaurar sesión en background:", e.message);
                sessionStorage.removeItem("session_user_id_hash");
                sessionStorage.removeItem("session_pass");
            }
        }
        const aliasParaDesbloqueo = localStorage.getItem("hermes_alias_" + storedUserHash) || "";
        if (aliasParaDesbloqueo) {
            showUnlockScreenFor(aliasParaDesbloqueo, storedUserHash);
        } else {
            showAccountSelector();
        }
    } else {
        const saved = loadAllLocalIdentities();
        if (saved.length > 0) {
            showAccountSelector();
        } else {
            showLoginScreen();
        }
    }
}

export async function triggerLoginRestore(prefilledAlias = null) {
    let alias = prefilledAlias || document.getElementById("login-alias")?.value.trim().toLowerCase();
    if (!alias) {
        alias = await modalManager.prompt('[ ALIAS DEL RESPALDO ]', 'Ingresa el alias (@usuario) asociado a este archivo de respaldo:');
        if (!alias) return;
        alias = alias.trim().toLowerCase();
    }

    const source = await modalManager.prompt(
        '[ ORIGEN DEL RESPALDO ]',
        '¿Deseas restaurar desde la Nube (escribe "nube") o desde un Archivo Local (escribe "local")?'
    );

    if (!source) return;

    if (source.toLowerCase().trim() === 'nube') {
        // Caso "perdí el dispositivo": no hay sesión ni contraseña anterior que
        // valga (la contraseña del vault nunca sale de este dispositivo, así
        // que perderlo la pierde con él). Lo único que autentica esto ante el
        // servidor son las 12 palabras, vía /api/recovery/fetch (proof-based,
        // sin sesión) — ver recoverySystem.restorePreAuth().
        const idHash = await sha256(alias);
        try {
            const phrase = await modalManager.prompt(
                '[ FRASE DE RECUPERACIÓN ]',
                `Ingresa las 12 palabras de recuperación de la cuenta @${alias}:`
            );
            if (!phrase) return;

            showToast("Verificando frase de recuperación en el servidor...", false);
            const remoteState = await recoverySystem.restorePreAuth(phrase, idHash);

            const newPassword = await modalManager.prompt(
                '[ NUEVA CONTRASEÑA LOCAL ]',
                'Frase válida. Define una nueva contraseña para desbloquear esta cuenta en este dispositivo:'
            );
            if (!newPassword) {
                showToast("Restauración cancelada: se requiere una contraseña local nueva.", true);
                return;
            }

            showToast("Restaurando cuenta...", false);
            state.storage.setUserId(idHash);
            localStorage.setItem("hermes_alias_" + idHash, alias);
            localStorage.setItem("hermes_alias_legacy", alias);

            const unlocked = await state.storage.unlock(newPassword);
            if (!unlocked) {
                showToast("Error al inicializar almacenamiento local", true);
                return;
            }

            await recoverySystem.applyState(remoteState);
            if (remoteState.keys) {
                state.userKeys = remoteState.keys;
            }

            showToast("✅ Cuenta restaurada con éxito desde la frase de recuperación. Iniciando sesión...");
            await doLoginTransition(alias, newPassword);

        } catch (err) {
            console.error("[LoginRestore] Error:", err);
            showToast("Error al restaurar desde la nube: " + err.message, true);
        }
    } else {
        // Flujo LOCAL
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".hermes,.json";
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const password = await modalManager.prompt('[ DESCIFRAR RESPALDO ]', `Ingresa la contraseña del respaldo para la cuenta @${alias}:`);
            if (!password) return;

            try {
                showToast("Restaurando respaldo local...", false);
                const idHash = await sha256(alias);
                state.storage.setUserId(idHash);
                localStorage.setItem("hermes_alias_" + idHash, alias);
                localStorage.setItem("hermes_alias_legacy", alias);

                const unlocked = await state.storage.unlock(password);
                if (!unlocked) {
                    showToast("Error al inicializar almacenamiento local", true);
                    return;
                }

                const backupMgr = new BackupManager(state.storage, state.mediaStorage);
                if (state.mediaStorage && !state.mediaStorage.db) {
                    try { await state.mediaStorage.open(); } catch(err) {}
                }

                const res = await backupMgr.restoreBackup(file, password);
                if (res.success) {
                    showToast("✅ Respaldo restaurado con éxito. Iniciando sesión...");
                    await doLoginTransition(alias, password);
                } else {
                    showToast(res.message || "❌ Contraseña incorrecta o archivo de respaldo dañado", true);
                }
            } catch (err) {
                console.error("[LoginRestore] Error:", err);
                showToast("Error al restaurar: " + err.message, true);
            }
        };
        input.click();
    }
}

export async function doLoginTransition(alias, password) {
    state.currentUser = alias.toLowerCase();
    sessionStorage.setItem("session_pass", password || 'hermes_default_session_key'); // Cache session password for refreshes

    const idHash = await sha256(alias);
    sessionStorage.setItem("session_user_id_hash", idHash); // CRITICAL: Cache idHash so F5 refresh restores session!
    localStorage.setItem("hermes_alias_" + idHash, alias);
    localStorage.setItem("hermes_alias_legacy", alias);

    state.userIdHash = idHash;
    state.storage.setUserId(idHash);

    try {
        if (!state.storage.isUnlocked) {
            const success = await state.storage.unlock(password || 'hermes_default_session_key');
            if (!success) {
                showToast("Contraseña incorrecta o datos corruptos", "error");
                document.getElementById('login-password').value = '';
                return;
            }
        }

        await state.contacts.load(state.storage);
        await state.groups.load(state.storage);
        await state.chats.load(state.storage);
        state.userKeys = await state.storage.load('hermes_keys');
        const pSettings = await state.storage.load('privacy_settings');
        if (pSettings) {
            state.privacySettings = pSettings;
        }
        if (window.privacySettings && typeof window.privacySettings.loadSettings === 'function') {
            await window.privacySettings.loadSettings();
            if (state.privacySettings) {
                if (state.privacySettings.readReceipts !== undefined) window.privacySettings.settings.sendReadReceipts = state.privacySettings.readReceipts;
                if (state.privacySettings.typingIndicators !== undefined) window.privacySettings.settings.showTypingIndicator = state.privacySettings.typingIndicators;
                if (state.privacySettings.onlineStatus !== undefined) window.privacySettings.settings.showOnlineStatus = state.privacySettings.onlineStatus;
            }
        }

        if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }

        // Hidratar el outbox (namespaced por usuario) ahora que setUserId ya corrió.
        try {
            await hermesStore.initialize();
        } catch (storeErr) {
            console.warn("[Auth] HermesStore init in transition:", storeErr);
        }

        if (state.currentUser) {
            // OJO: solo persistir si el filtro realmente sacó algo. Guardar
            // incondicionalmente en cada login es lo que causaba pérdida real de
            // contactos — si state.contacts.load() arriba devolvió [] por cualquier
            // hiccup silencioso de lectura/descifrado (storage_manager.js traga esos
            // errores y devuelve null en vez de propagarlos), este bloque terminaba
            // reescribiendo el array vacío sobre datos buenos en disco, sin ningún
            // error visible en ningún lado.
            const beforeContacts = state.contacts.contacts.length;
            const beforeData = state.contacts.contactData.length;
            state.contacts.contacts = state.contacts.contacts.filter(c => c !== state.currentUser);
            state.contacts.contactData = state.contacts.contactData.filter(c => c.contact_id !== state.currentUser);
            if (state.contacts.contacts.length !== beforeContacts || state.contacts.contactData.length !== beforeData) {
                await state.contacts.save(state.storage);
            }
        }

        recoverySystem.startAutoBackup();

        // Transition Views
        document.getElementById("view-auth").classList.add("hidden");
        document.getElementById("view-chat").classList.remove("hidden");
        const displayAliasLogin = localStorage.getItem("hermes_alias_override_" + state.currentUser) || state.currentUser;
        document.getElementById("current-user-name").textContent = `@${displayAliasLogin}`;
        document.getElementById("my-avatar").textContent = displayAliasLogin.substring(0, 2).toUpperCase();
        if (window.hermesTheme) window.hermesTheme.onLogin(state.currentUser);

        window.sendSystemMessage = async (msg) => {
            if (state.activeContact || state.activeGroup) {
                try {
                    await state.sync.sendMessage(state.activeContact || state.activeGroup, {
                        plaintext: msg.message || `⚠️ @${state.currentUser} tomó una captura de pantalla!`,
                        timestamp: Math.floor(Date.now()/1000),
                        type: 'system',
                        viewed_by: []
                    });
                    if (typeof renderMessages === 'function') renderMessages();
                } catch(e) {
                    console.error("No se pudo notificar la captura", e);
                }
            }
        };

    } catch (e) {
        if (e.name === 'StorageDecryptionError') {
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('account-select-view').classList.remove('hidden');
            if (window.modalManager) {
                await window.modalManager.alert(
                    '[ ERROR DE DESCIFRADO ]',
                    'No fue posible abrir tu almacenamiento.\n\nEs posible que los datos estén dañados o la contraseña sea incorrecta. Inicia sesión con la contraseña correcta o restaura un respaldo (.hermes).',
                    'error'
                );
            }
            return;
        }
        // NUNCA continuar el login tras un error inesperado acá: seguir de largo dejaba
        // el usuario entrar con contacts/groups/keys reseteados en memoria, y cualquier
        // save() posterior (auto-add de contacto, reconciliación, etc.) persistía ese
        // vacío al disco — pérdida de cuenta real por un error transitorio. Mejor abortar
        // el login y no tocar nada en disco; el usuario puede reintentar.
        console.error("[Auth] Error inesperado cargando datos locales — abortando login sin modificar nada:", e);
        // El error puede haber ocurrido después de la transición a view-chat (p.ej. un
        // import() dinámico que falla) — hay que revertirla explícitamente, si no el
        // usuario queda viendo el chat vacío en vez de volver a la pantalla de login.
        document.getElementById('view-chat')?.classList.add('hidden');
        document.getElementById('view-auth')?.classList.remove('hidden');
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('account-select-view').classList.remove('hidden');
        if (window.modalManager) {
            await window.modalManager.alert(
                '[ ERROR AL INICIAR SESIÓN ]',
                'Ocurrió un error inesperado cargando tus datos locales. Por seguridad no se modificó nada. Intenta iniciar sesión de nuevo.',
                'error'
            );
        }
        return;
    }


    if (!state.userKeys || !state.userKeys.sphincs_sk || !state.userKeys.kyber_sk) {
        console.warn("[Auth] No se encontraron llaves locales para esta sesión. Se requiere restauración desde respaldo.");
    }

    // Instantiate backup manager (v7.1 with multimedia support)
    state.backup = new BackupManager(state.storage, state.mediaStorage);

    // Initialize IndexedDB for multimedia (images + audio)
    try {
        await state.mediaStorage.open();
        // Limpiar efímeras expiradas de sesiones anteriores
        const cleaned = await state.mediaStorage.cleanupEphemeral();
        if (cleaned > 0) console.log(`[MediaStorage] Limpiadas ${cleaned} imágenes efímeras expiradas.`);
    } catch (e) {
        console.warn('[MediaStorage] No se pudo inicializar IndexedDB:', e);
    }

    // Initialize screenshot detector
    const { ScreenshotDetector } = await import('./screenshot_detector.js');
    state.screenshotDetector = new ScreenshotDetector((method, imageId) => {
        // Cerrar el modal de imagen efímera si estaba abierto
        const modal = document.getElementById('view-once-modal');
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
            const img = document.getElementById('view-once-img');
            if (img) img.src = '';
        }
        console.warn(`[ScreenshotDetector] Intento de captura: ${method}, imageId: ${imageId}`);

        const msg = state.chatMessages ? state.chatMessages.find(m => m.id === imageId) : null;
        if (msg) {
            const isGroup = state.groups.userGroups.some(g => g.id === (state.activeContact || state.activeGroup));
            const targetId = isGroup ? state.activeGroup : msg.sender;
            const payloadType = isGroup ? "group_screenshot_alert" : "screenshot_alert";
            
            try {
                state.sync.sendBlob(state.currentUser, targetId, {
                    type: payloadType,
                    target_msg_id: msg.id
                });
                
                // Add the system message locally for the screenshot taker too
                state.chats.addMessage(state.storage, targetId, {
                    id: crypto.randomUUID(),
                    sender: 'system',
                    receiver: targetId,
                    plaintext: `⚠️ @${state.currentUser} tomó una captura de pantalla!`,
                    timestamp: Math.floor(Date.now()/1000),
                    type: 'system',
                    viewed_by: []
                }).then(() => {
                    if (typeof renderMessages === 'function') renderMessages();
                });
            } catch(e) {
                console.error("No se pudo notificar la captura", e);
            }
        }
    });
    state.screenshotDetector.startDetection();


    // Transition Views
    document.getElementById("view-auth").classList.add("hidden");
    document.getElementById("view-chat").classList.remove("hidden");
    document.getElementById("current-user-name").textContent = `@${state.currentUser}`;
    document.getElementById("my-avatar").textContent = state.currentUser.substring(0, 2).toUpperCase();
    if (window.hermesTheme) window.hermesTheme.onLogin(state.currentUser);

    // Start Synchronization
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const wsProtocol = isLocal ? "ws:" : "wss:";
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    state.sync = new SyncManager(state.currentUser, state.storage, state.contacts, state.groups, state.chats, () => {
        renderContactSidebar();
        renderGroupSidebar();
        if (state.activeContact) {
            state.chatMessages = state.chats.getMessages(state.activeContact);
            renderMessages();
        } else if (state.activeGroup) {
            state.chatMessages = state.chats.getMessages(state.activeGroup);
            renderMessages();
        }
    });
    
    if (state.activeContact || state.activeGroup) {
        state.sync.activeChatId = state.activeContact || state.activeGroup;
    }
    
    await state.sync.start(wsUrl);

    setupChatEventListeners();
    // setupBackupRestoreListeners/setupRecoveryUI/setupSettingsDropdown ya se registran una
    // única vez al boot en main.js:initApp() (corren antes que cualquier login sea posible);
    // volver a llamarlos acá duplicaba los addEventListener de esos botones (doble mnemónico
    // generado por click en "Generar Llave Maestra", doble backup subido por click en
    // "Crear Backup", etc.) — ver BACKLOG.md.
    renderContactSidebar();
    renderGroupSidebar();
    loadBackupsList();
    
    const checkOnlineStatuses = async () => {
        if (!state.contacts || !state.sync) return;
        let changed = false;
        for (const c of state.contacts.contacts) {
            const isOnline = await state.sync.checkContactStatus(c);
            if (state.contacts.onlineStatuses[c] !== isOnline) {
                state.contacts.onlineStatuses[c] = isOnline;
                changed = true;
            }
        }
        if (changed) {
            document.dispatchEvent(new Event("contacts_updated"));
        }
    };
    
    // Check immediately, then every 10 seconds
    setTimeout(checkOnlineStatuses, 1000);
    window._onlineStatusInterval = setInterval(checkOnlineStatuses, 10000);

    document.dispatchEvent(new Event('hermes:logged_in'));

    // Setup backup reminder
    const reminderSelect = document.getElementById("backup-reminder-select");
    if (reminderSelect) {
        const savedInterval = localStorage.getItem("hermes_backup_reminder") || "3600";
        reminderSelect.value = savedInterval;
        startBackupReminder(parseInt(savedInterval));
        reminderSelect.addEventListener("change", (e) => {
            localStorage.setItem("hermes_backup_reminder", e.target.value);
            startBackupReminder(parseInt(e.target.value));
        });
    }
}

export async function executeWipeLogout() {
    // Revocar el token de sesión en el servidor — sin esto queda válido hasta su
    // expiración natural (8h) aunque el usuario haya cerrado sesión explícitamente.
    try {
        const sessionToken = sessionStorage.getItem('hermes_session_token');
        if (sessionToken) {
            await fetch("/api/logout", {
                method: "POST",
                headers: { "Authorization": `Bearer ${sessionToken}` }
            });
        }
        sessionStorage.removeItem('hermes_session_token');
    } catch (e) {
        console.warn("[Auth] No se pudo revocar el token de sesión al salir:", e);
    }

    // Si la configuración requiere vaciar mensajes al salir, lo hacemos ANTES de borrar las llaves de memoria
    if (window.privacySettings && window.privacySettings.settings.serverMessageDeletion === 'on_logout' && state.currentUser && state.userKeys) {
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            const signatureHex = await window.CryptoClient.signTimestamp(timestamp, state.userKeys.sphincs_sk);
            const idHash = await window.CryptoClient.hashClientId(state.currentUser);
            
            await fetch("/api/blobs/clear", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id_hash: idHash,
                    timestamp: timestamp,
                    signature: signatureHex
                })
            });
            console.log("[Auth] Cola de mensajes pendiente en servidor eliminada (on_logout).");
        } catch (e) {
            console.warn("[Auth] No se pudo limpiar la cola de mensajes al salir:", e);
        }
    }

    state.storage.lock();
    if (state.sync) state.sync.stop();
    if (state.screenshotDetector) {
        state.screenshotDetector.stopDetection();
        state.screenshotDetector = null;
    }
    sessionStorage.removeItem("session_user_id_hash");
    sessionStorage.removeItem("session_pass");
    
    // Fase 3: Sanitización de RAM Explícita (Zeroization Parcial)
    if (state) {
        try {
            MemorySanitizer.fullClearCache(state);
        } catch (err) {
            console.error("Error en MemorySanitizer", err);
            state.currentUser = null;
            state.userKeys = null;
            state.activeContact = null;
            state.activeGroup = null;
            state.chatMessages = [];
        }
    }
    
    // Reset view
    const settingsModal = document.getElementById("settings-modal");
    if (settingsModal) {
        settingsModal.classList.add("hidden");
        settingsModal.classList.add("opacity-0");
    }
    document.getElementById("view-chat").classList.add("hidden");
    document.getElementById("view-auth").classList.remove("hidden");
    document.getElementById("login-view").classList.remove("hidden");
    document.getElementById("register-view").classList.add("hidden");
    document.getElementById("account-select-view").classList.add("hidden");
    if (window.hermesTheme) window.hermesTheme.onLogout();
    
    document.getElementById("auth-prompt-title").textContent = "[ INICIAR SESIÓN ]";
    
    const loginAlias = document.getElementById("login-alias");
    if (loginAlias) {
        loginAlias.removeAttribute("disabled");
        loginAlias.value = "";
    }
    const loginPassword = document.getElementById("login-password");
    if (loginPassword) loginPassword.value = "";
    
    const btnLogin = document.getElementById("btn-login");
    if (btnLogin) btnLogin.textContent = "[ AUTENTICAR ]";
    
    // Clear register fields
    const regAliasInput = document.getElementById("register-alias");
    if (regAliasInput) regAliasInput.value = "";
    const regPassInput = document.getElementById("register-password");
    if (regPassInput) regPassInput.value = "";
    const regConfirm = document.getElementById("register-password-confirm");
    if (regConfirm) regConfirm.value = "";
    
    const terms = document.getElementById("register-terms");
    if (terms) terms.checked = false;
    const submitBtn = document.getElementById("register-submit");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
    }
    
    const strengthMeter = document.getElementById("password-strength");
    if (strengthMeter) strengthMeter.classList.add("hidden");
    const indicator = document.getElementById("password-match-indicator");
    if (indicator) indicator.classList.add("hidden");
}

window.triggerManualBackup = async function() {
    if (!state.backup) {
        showToast("El gestor de backups no está disponible.", "error");
        return;
    }
    const password = await window.modalManager.prompt(
        '[ BACKUP MANUAL ]',
        'Ingresa tu contraseña para cifrar el archivo de respaldo:'
    );
    if (!password) return;
    
    // Simulate checking old password
    const testData = localStorage.getItem('_hermes_lock_test_' + state.currentUser);
    if (testData) {
        try {
            await window.CryptoClient.decryptSymmetric(testData, password);
        } catch(e) {
            showToast("Contraseña incorrecta. Abortando backup.", "error");
            return;
        }
    }

    try {
        showToast("Generando backup cifrado, por favor espera...", "info");
        await state.backup.createBackup(password);
        showToast("Backup generado y descargado exitosamente.", "success");
    } catch (e) {
        console.error("Manual backup error:", e);
        showToast("Error al generar backup: " + e.message, "error");
    }
};



export async function openDisableModal() {
    const modal = document.getElementById("disable-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    setTimeout(() => modal.classList.remove("opacity-0"), 10);
    
    const closeBtn = document.getElementById("btn-close-disable-modal");
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.classList.add("opacity-0");
            setTimeout(() => modal.classList.add("hidden"), 300);
        };
    }

    const confirmBtn = document.getElementById("btn-confirm-disable");
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            const passEl = document.getElementById("disable-pass-input");
            const pass = passEl ? passEl.value : "";
            if (!pass) return;

            const unlocked = await state.storage.unlock(pass);
            if (!unlocked) {
                await modalManager.alert('[ ERROR ]', 'Contraseña de confirmación incorrecta.', 'error');
                return;
            }

            try {
                const idHash = state.storage.getUserId();
                await fetch(`/api/user/${idHash}`, { method: "DELETE" });
            } catch (e) {}

            await state.storage.delete('hermes_keys');
            await state.storage.delete('hermes_contacts');
            await state.storage.delete('hermes_contact_data');
            await state.storage.delete('hermes_shared_keys');
            await state.storage.delete('hermes_groups');
            await state.storage.delete('hermes_messages');
            await state.storage.delete('hermes_settings');
            localStorage.removeItem(state.storage.getUserId() + "_local_backups");

            localStorage.removeItem("user_id_hash");
            localStorage.removeItem("hermes_alias_legacy");
            localStorage.removeItem("_hermes_lock_test_" + state.storage.getUserId());

            executeWipeLogout();
            modal.classList.add("opacity-0");
            setTimeout(() => modal.classList.add("hidden"), 300);
        };
    }
}

export function setupSettingsDropdown() {
    const btnProfile = document.getElementById("btn-profile");
    const settingsModal = document.getElementById("settings-modal");
    const btnCloseSettings = document.getElementById("btn-close-settings-modal");

    window.setupSettingsData = () => {
        try {
            const displayAlias = localStorage.getItem("hermes_alias_override_" + state.currentUser) || state.currentUser;
            const usernameEl = document.getElementById("settings-username");
            if (usernameEl && state.currentUser) usernameEl.textContent = `@${displayAlias}`;
            const avatarEl = document.getElementById("settings-avatar");
            if (avatarEl && displayAlias) avatarEl.textContent = displayAlias.substring(0, 2).toUpperCase();
            
            const btnSaveAlias = document.getElementById("btn-save-alias");
            const inputNewAlias = document.getElementById("input-new-alias");
            if (btnSaveAlias && inputNewAlias) {
                btnSaveAlias.onclick = () => {
                    const val = inputNewAlias.value.trim();
                    if (!val || val.length < 3 || val.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(val)) {
                        showToast("Alias inválido (3-20 caracteres alfanuméricos)", true);
                        return;
                    }
                    if (state.currentUser && typeof state.currentUser === 'string') {
                        localStorage.setItem("hermes_alias_override_" + state.currentUser, val);
                    }
                    if (usernameEl) usernameEl.textContent = `@${val}`;
                    if (avatarEl) avatarEl.textContent = val.substring(0, 2).toUpperCase();
                    
                    showToast("Nombre / Alias actualizado correctamente.", false);
                    
                    const mainUserEl = document.getElementById("current-user-name");
                    const mainAvatarEl = document.getElementById("my-avatar");
                    if (mainUserEl) mainUserEl.textContent = `@${val}`;
                    if (mainAvatarEl) mainAvatarEl.textContent = val.substring(0, 2).toUpperCase();
                    inputNewAlias.value = "";
                    showToast(`✅ Alias visual actualizado a @${val}`);
                };
            }
            
            loadBackupsList();

            const toggleRead = document.getElementById("toggle-read-receipts");
            const toggleTyping = document.getElementById("toggle-typing-indicators");
            const toggleOnline = document.getElementById("toggle-online-status");
            const selectTTL = document.getElementById("select-message-ttl");
            
            if (toggleRead) toggleRead.checked = state.privacySettings?.readReceipts !== false;
            if (toggleTyping) toggleTyping.checked = state.privacySettings?.typingIndicators !== false;
            if (toggleOnline) toggleOnline.checked = state.privacySettings?.onlineStatus !== false;
            if (selectTTL && window.privacySettings) {
                selectTTL.value = window.privacySettings.settings.pendingMessageTTL || "86400";
            }
            if (window.hermesTheme) window.hermesTheme.updateUI();

            const mkBadge = document.getElementById('mk-status-badge');
            const mkBtnText = document.getElementById('mk-btn-text');
            const btnConfigMK = document.getElementById('btn-configure-mk');
            const currentUserId = state.storage ? state.storage.getUserId() : '';
            const hasMK = localStorage.getItem('hermes_master_key_set_' + currentUserId) === 'true' || localStorage.getItem('hermes_recovery_salt_' + currentUserId) || localStorage.getItem('hermes_recovery_salt');
            if (mkBadge) {
                if (hasMK) {
                    mkBadge.textContent = 'ACTIVA';
                    mkBadge.className = 'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-green-950/40 text-green-400 border border-green-800/40';
                    if (mkBtnText) mkBtnText.textContent = 'VER O GESTIONAR LLAVE MAESTRA';
                } else {
                    mkBadge.textContent = 'NO CONFIGURADA';
                    mkBadge.className = 'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-800/40';
                    if (mkBtnText) mkBtnText.textContent = 'CONFIGURAR LLAVE MAESTRA';
                }
            }
            if (btnConfigMK) {
                btnConfigMK.onclick = () => {
                    if (window.closeSettingsModal) window.closeSettingsModal();
                    const bm = document.getElementById('backup-modal');
                    if (bm) {
                        if (window.modalManager) {
                            window.modalManager.open(bm);
                        } else {
                            if (bm.parentElement !== document.body) document.body.appendChild(bm);
                            bm.style.setProperty('z-index', '2147483647', 'important');
                            bm.classList.remove('hidden');
                            setTimeout(() => bm.classList.remove('opacity-0'), 10);
                        }
                    }
                };
            }
            
            const updatePrivacy = async () => {
                state.privacySettings = {
                    readReceipts: toggleRead ? toggleRead.checked : true,
                    typingIndicators: toggleTyping ? toggleTyping.checked : true,
                    onlineStatus: toggleOnline ? toggleOnline.checked : true
                };
                await state.storage.save("privacy_settings", state.privacySettings);
                
                if (window.privacySettings) {
                    window.privacySettings.settings.sendReadReceipts = state.privacySettings.readReceipts;
                    window.privacySettings.settings.showTypingIndicator = state.privacySettings.typingIndicators;
                    window.privacySettings.settings.showOnlineStatus = state.privacySettings.onlineStatus;
                    window.privacySettings.saveSettings();
                }
                window.disableReadReceipts = !state.privacySettings.readReceipts;
                
                if (selectTTL && window.privacySettings) {
                    window.privacySettings.set('pendingMessageTTL', parseInt(selectTTL.value));
                }
                if (state.sync && state.sync.websocket) {
                    state.sync.websocket.close(); // Force reconnect to broadcast new online status
                }
                showToast("Configuración de privacidad guardada.");
            };
            
            if (toggleRead) {
                toggleRead.removeEventListener('change', updatePrivacy);
                toggleRead.addEventListener('change', updatePrivacy);
            }
            if (toggleTyping) {
                toggleTyping.removeEventListener('change', updatePrivacy);
                toggleTyping.addEventListener('change', updatePrivacy);
            }
            if (toggleOnline) {
                toggleOnline.removeEventListener('change', updatePrivacy);
                toggleOnline.addEventListener('change', updatePrivacy);
            }
            if (selectTTL) {
                selectTTL.removeEventListener('change', updatePrivacy);
                selectTTL.addEventListener('change', updatePrivacy);
            }
        } catch (err) {
            console.error("Error al poblar datos del modal de configuración:", err);
        }
    };

    if (btnProfile) {
        btnProfile.onclick = (e) => {
            if (window.openSettingsModal) {
                window.openSettingsModal(e);
            } else if (window.modalManager) {
                window.modalManager.open('settings-modal');
            }
        };
    }

    const changePassBtn = document.getElementById("btn-change-password");
    if (changePassBtn) {
        changePassBtn.addEventListener("click", async () => {
            const oldPass = document.getElementById("settings-old-pass").value;
            const newPass = document.getElementById("settings-new-pass").value;
            const newPassConfirm = document.getElementById("settings-new-pass-confirm").value;

            if (!oldPass || !newPass || !newPassConfirm) {
                showToast('Completa todos los campos de contraseña', true);
                return;
            }
            if (newPass !== newPassConfirm) {
                showToast('Las nuevas contraseñas no coinciden', true);
                return;
            }
            if (newPass.length < 8) {
                showToast('La nueva contraseña debe tener al menos 8 caracteres', true);
                return;
            }

            try {
                const unlocked = await state.storage.unlock(oldPass);
                if (!unlocked) {
                    showToast('Contraseña actual incorrecta', true);
                    return;
                }

                const backupObj = {
                    version: '7.0',
                    timestamp: Date.now(),
                    contacts: await state.storage.load('hermes_contacts'),
                    contactData: await state.storage.load('hermes_contact_data'),
                    sharedKeys: await state.storage.load('hermes_shared_keys'),
                    groups: await state.storage.load('hermes_groups'),
                    messageHistory: await state.storage.load('hermes_messages'),
                    settings: await state.storage.load('hermes_settings'),
                    userKeys: await state.storage.load('hermes_keys')
                };

                state.storage.lock();
                await state.storage.unlock(newPass);

                await state.storage.save('hermes_contacts', backupObj.contacts || []);
                await state.storage.save('hermes_contact_data', backupObj.contactData || []);
                await state.storage.save('hermes_shared_keys', backupObj.sharedKeys || {});
                await state.storage.save('hermes_groups', backupObj.groups || []);
                await state.storage.save('hermes_messages', backupObj.messageHistory || {});
                await state.storage.save('hermes_settings', backupObj.settings || {});
                await state.storage.save('hermes_keys', backupObj.userKeys);

                const marker = await state.storage.encrypt('HERMES_LOCK_OK');
                localStorage.setItem('_hermes_lock_test_' + state.storage.getUserId(), marker);

                sessionStorage.setItem("session_pass", newPass);
                showToast('Contraseña cambiada con éxito');

                document.getElementById("settings-old-pass").value = "";
                document.getElementById("settings-new-pass").value = "";
                document.getElementById("settings-new-pass-confirm").value = "";
            } catch (e) {
                console.error(e);
                showToast('Error al cambiar contraseña', true);
            }
        });
    }

    const logoutBtn = document.getElementById("btn-settings-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            if (window.closeSettingsModal) window.closeSettingsModal();
            const confirmed = await modalManager.confirm('[ CERRAR SESIÓN ]', '¿Cerrar sesión en esta pestaña?');
            if (confirmed) {
                executeWipeLogout();
            }
        });

        const existingLogoutAll = document.getElementById("btn-settings-logout-all");
        if (!existingLogoutAll) {
            const logoutAllBtn = document.createElement("button");
            logoutAllBtn.id = "btn-settings-logout-all";
            logoutAllBtn.className = "w-full text-left px-3 py-2.5 text-orange-400 hover:bg-orange-950/20 transition-colors rounded border border-orange-900/40 text-[10px] font-mono font-bold flex items-center gap-2 mt-2";
            logoutAllBtn.innerHTML = `<span>⚠️</span> CERRAR TODAS LAS SESIONES`;
            logoutAllBtn.addEventListener("click", async () => {
                if (window.closeSettingsModal) window.closeSettingsModal();
                const confirmed = await modalManager.confirm('[ CERRAR TODAS LAS SESIONES ]', '¿Cerrar sesión en todas las pestañas y dispositivos?');
                if (confirmed) {
                    const myHash = state.storage.getUserId();
                    if (myHash) {
                        localStorage.setItem("logout_all_signal_" + myHash, Date.now());
                    }
                    executeWipeLogout();
                }
            });
            logoutBtn.parentNode.appendChild(logoutAllBtn);
        }
    }

    const disableBtn = document.getElementById("btn-settings-disable");
    if (disableBtn) {
        disableBtn.addEventListener("click", () => {
            if (window.closeSettingsModal) window.closeSettingsModal();
            openDisableModal();
        });
    }
}

export function setupAuthEventListeners() {
    const btnRegister = document.getElementById("register-submit");
    const btnLogin = document.getElementById("btn-login");
    const loginAliasInput = document.getElementById("login-alias");
    const loginPassInput = document.getElementById("login-password");
    const regAliasInput = document.getElementById("register-alias");
    const regPassInput = document.getElementById("register-password");
    const regPassConfirmInput = document.getElementById("register-password-confirm");

    const btnUseOther = document.getElementById("btn-use-other-account");
    if (btnUseOther) {
        btnUseOther.addEventListener("click", showLoginScreen);
    }
    const btnForgetAll = document.getElementById("btn-forget-all-accounts");
    if (btnForgetAll) {
        btnForgetAll.addEventListener("click", forgetAllIdentities);
    }
    const btnBackToSelector = document.getElementById("btn-back-to-selector");
    if (btnBackToSelector) {
        btnBackToSelector.addEventListener("click", (e) => {
            e.preventDefault();
            showAccountSelector();
        });
    }
    const btnLoginRestore = document.getElementById("btn-login-restore");
    if (btnLoginRestore) {
        btnLoginRestore.addEventListener("click", () => triggerLoginRestore());
    }

    if (btnLogin) {
        btnLogin.addEventListener("click", async () => {
            if (btnLogin.disabled) return;
            btnLogin.disabled = true;
            const originalText = btnLogin.textContent;
            btnLogin.textContent = "[ DESCIFRANDO... ]";
            try {
                const alias = loginAliasInput.value.trim().toLowerCase();
                const password = loginPassInput.value;

                if (!alias || !password) {
                    showToast('Por favor ingrese alias y contraseña', true);
                    return;
                }

                const idHash = await sha256(alias);
                const localMarker = localStorage.getItem('_hermes_lock_test_' + idHash);
                if (!localMarker) {
                    try {
                        const checkRes = await fetch(`/api/user/${idHash}`);
                        if (!checkRes.ok) {
                            await modalManager.alert('[ CUENTA NO ENCONTRADA ]', `La cuenta '@${alias}' no existe. Ve a 'CREAR NUEVA IDENTIDAD' para registrarte.`, 'error');
                            return;
                        } else {
                            const wantRestore = await modalManager.confirm(
                                '[ LLAVES NO DISPONIBLES ]',
                                `La cuenta '@${alias}' existe en la red, pero este dispositivo no tiene tus llaves locales.\n\n¿Deseas seleccionar tu archivo de respaldo (.hermes) para restaurar la sesión?`
                            );
                            if (wantRestore) {
                                triggerLoginRestore(alias);
                            }
                            return;
                        }
                    } catch (e) {
                        console.warn("No se pudo verificar el usuario en el backend:", e);
                    }
                }

                state.storage.setUserId(idHash);
                localStorage.setItem("hermes_alias_" + idHash, alias);
                localStorage.setItem("hermes_alias_legacy", alias);

                const unlocked = await state.storage.unlock(password);
                if (!unlocked) {
                    showToast('Contraseña incorrecta o error de integridad local', true);
                    return;
                }

                await doLoginTransition(alias, password);
            } catch (err) {
                console.error("[Login] Error:", err);
                showToast("Error inesperado al iniciar sesión", true);
            } finally {
                btnLogin.disabled = false;
                btnLogin.textContent = originalText;
            }
        });
    }

    if (btnRegister) {
        btnRegister.addEventListener("click", async () => {
            if (btnRegister.disabled) return;
            const alias = regAliasInput.value.trim().toLowerCase();
            const password = regPassInput.value;
            const confirmPass = regPassConfirmInput.value;

            if (!alias || !/^[a-zA-Z0-9_-]{3,20}$/.test(alias)) {
                showToast('Alias alfanumérico válido requerido (3-20 chars)', true);
                return;
            }
            if (password.length < 12) {
                showToast('La contraseña debe tener al menos 12 caracteres', true);
                return;
            }
            if (password !== confirmPass) {
                showToast('Las contraseñas no coinciden', true);
                return;
            }

            btnRegister.disabled = true;
            const originalText = btnRegister.textContent;
            btnRegister.textContent = "[ REGISTRANDO... ]";

            try {
                const idHash = await sha256(alias);
            state.storage.setUserId(idHash);
            
            localStorage.setItem("hermes_alias_" + idHash, alias);
            localStorage.setItem("hermes_alias_legacy", alias);

            await state.storage.unlock(password);
                console.log("[Auth] Generando llaves maestras en WASM...");
                const generated = hermesBridge.generateIdentityKeys();
                
                state.userKeys = {
                    kyber_pk: generated.kyber_pk_hex,
                    kyber_sk: generated.kyber_sk_hex,
                    sphincs_pk: generated.sphincs_pk_hex,
                    sphincs_sk: generated.sphincs_sk_hex
                };

                const regRes = await fetch("/api/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        client_id: idHash,
                        kyber_pk_hex: state.userKeys.kyber_pk,
                        sphincs_pk_hex: state.userKeys.sphincs_pk
                    })
                });

                if (regRes.ok) {
                    showToast("Registro exitoso");

                    // Guardar llaves en almacenamiento local PRIMERO y FUERA del try-catch
                    // para garantizar que nunca se pierdan si algo falla en el backup/recovery
                    await state.storage.save('hermes_keys', state.userKeys);

                    // recoverySystem.initialize()/backup.createBackup() abajo llaman a
                    // /api/recovery/register-proof y /api/backup, ambos con sesión
                    // requerida (Depends(verify_session_token)) — pero la sesión real
                    // recién se abre en doLoginTransition(), MÁS ABAJO. Sin este bootstrap
                    // temprano ambas llamadas 401 en silencio (dentro de su propio
                    // try/catch) y el usuario nunca se entera de que no quedó nada
                    // respaldado. Se pide un token ahora mismo con las llaves recién
                    // generadas; doLoginTransition() vuelve a pedirlo después, pero
                    // _ensureRegistered() es idempotente.
                    try {
                        const earlySync = new SyncManager(alias.toLowerCase(), state.storage, state.contacts, state.groups, state.chats, () => {});
                        await earlySync._ensureRegistered();
                    } catch (e) {
                        console.warn("[Auth] No se pudo abrir sesión temprano para el backup de registro:", e);
                    }

                    // Frase de recuperación: OBLIGATORIA. Si esto falla (mnemonic, marcador
                    // local, o registro del proof en el servidor), la frase que se le
                    // mostraría al usuario sería inútil para recuperar la cuenta más
                    // adelante — así que se bloquea el registro en vez de continuar
                    // silenciosamente (la cuenta ya existe en el servidor; el usuario puede
                    // reintentar iniciando sesión, ver triggerLoginRestore).
                    try {
                        await recoverySystem.initialize(idHash);
                        localStorage.setItem('hermes_master_key_set_' + idHash, 'true');
                    } catch (e) {
                        console.error("Error inicializando el sistema de recuperación:", e);
                        document.getElementById('view-chat')?.classList.add('hidden');
                        document.getElementById('view-auth')?.classList.remove('hidden');
                        if (window.modalManager) {
                            await window.modalManager.alert(
                                '[ ERROR EN EL RESPALDO OBLIGATORIO ]',
                                'Tu cuenta se creó en el servidor, pero no se pudo configurar la frase de recuperación (' + (e.message || 'error desconocido') + '). Sin esto no podrías recuperar la cuenta si pierdes este dispositivo. Inicia sesión para reintentarlo.',
                                'error'
                            );
                        }
                        btnRegister.disabled = false;
                        btnRegister.textContent = originalText;
                        return;
                    }

                    // Generar y descargar el primer backup local completo con todas las claves
                    try {
                        showToast("Generando primer backup local (con llaves)...", false);
                        state.backup = new BackupManager(state.storage, state.mediaStorage);
                        await state.backup.createBackup(password);
                        showToast("Backup inicial generado exitosamente.", "success");
                    } catch (e) {
                        console.error("Error generando el backup inicial:", e);
                    }
                } else {
                    const err = await regRes.json();
                    await modalManager.alert('[ ERROR DE REGISTRO ]', err.detail || 'Error al registrar usuario en el servidor', 'error');
                    return;
                }

                state.currentUser = alias.toLowerCase();

                await state.contacts.save(state.storage);
                await state.groups.save(state.storage);
                await state.chats.save(state.storage);

                if (window.modalManager) {
                    window.modalManager.open('onboarding-modal');
                }

                document.dispatchEvent(new Event('hermes:account_created'));
                await doLoginTransition(alias, password);
            } catch (e) {
                console.error(e);
                showToast('Error de registro: ' + e.message, true);
            } finally {
                btnRegister.disabled = false;
                btnRegister.textContent = originalText;
            }
        });
    }
}
