// backup_ui.js
// UI de backup v7.1 — integrado con BackupManager.createBackup() que incluye multimedia.

import { state, showToast } from './state.js';
import { modalManager } from './ui/modal_manager.js';

export function startBackupReminder(seconds) {
    if (state.backupReminderInterval) {
        clearInterval(state.backupReminderInterval);
    }
    if (seconds <= 0) return;

    state.backupReminderInterval = setInterval(() => {
        showToast("⚠️ RECORDATORIO: Crea un backup local para no perder tus chats.", false);
    }, seconds * 1000);
}

export async function loadBackupsList() {
    const container = document.getElementById("backups-list-container");
    if (!container) return;
    container.innerHTML = "";

    let backups = [];
    try {
        backups = await state.backup.listBackups();
    } catch (e) {
        console.warn('[BackupUI] No se pudo cargar el índice de backups:', e);
    }

    // También incluir backups locales del formato legacy (localStorage base64)
    const legacyBackups = JSON.parse(
        localStorage.getItem(state.storage.getUserId() + "_local_backups") || "[]"
    );

    if (backups.length === 0 && legacyBackups.length === 0) {
        container.innerHTML = '<div class="text-[8px] text-gray-500 uppercase font-mono py-1">Sin backups guardados localmente</div>';
        return;
    }

    // ── Backups v7.1 (desde índice nuevo) ─────────────────────────────
    backups.forEach(b => {
        const el = document.createElement("div");
        el.className = "flex flex-col gap-1 bg-black/40 border border-darkGrey/40 p-2 rounded";

        el.innerHTML = `
            <div class="flex justify-between items-center gap-2">
              <div class="min-w-0">
                <span class="text-white text-[9px] font-mono block truncate">Backup v7.1 — ${b.date}</span>
                <div class="flex gap-2 mt-0.5 flex-wrap">
                  <span class="text-terminalGreen/60 text-[7px] font-mono">${b.totalMessages} msgs</span>
                  <span class="text-blue-400/60 text-[7px] font-mono">${b.totalImages} imgs</span>
                  <span class="text-orange-400/60 text-[7px] font-mono">${b.totalAudio} audios</span>
                  <span class="text-gray-500 text-[7px] font-mono">${b.size}</span>
                </div>
              </div>
              <button
                data-backup-del="${b.id}"
                class="bg-red-950/20 border border-red-500/20 text-red-400 hover:bg-red-600 hover:text-white px-1.5 py-0.5 rounded text-[8px] shrink-0 font-mono"
              >[DEL]</button>
            </div>
        `;

        const delBtn = el.querySelector(`[data-backup-del="${b.id}"]`);
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                const confirmed = await modalManager.confirm('[ ELIMINAR REGISTRO ]', '¿Eliminar este registro del índice de backups?');
                if (confirmed) {
                    await state.backup.deleteBackupFromIndex(b.id);
                    showToast('Registro de backup eliminado del índice.');
                    loadBackupsList();
                }
            });
        }

        container.appendChild(el);
    });

    // ── Backups legacy (format antiguo base64 en localStorage) ─────────
    legacyBackups.forEach(b => {
        const dateStr = new Date(b.timestamp).toLocaleString();
        const sizeKb  = (b.size / 1024).toFixed(1);

        const el = document.createElement("div");
        el.className = "flex justify-between items-center bg-black/40 border border-darkGrey/40 p-2 rounded gap-2";

        const info = document.createElement("div");
        info.innerHTML = `
            <span class="text-white text-[9px] block truncate">${b.filename}</span>
            <span class="text-gray-500 text-[7px]">${dateStr} — ${sizeKb} KB</span>
        `;

        const actions = document.createElement("div");
        actions.className = "flex gap-1 shrink-0";

        const restoreBtn = document.createElement("button");
        restoreBtn.className = "bg-terminalGreen/10 border border-terminalGreen/30 text-terminalGreen hover:bg-terminalGreen hover:text-black px-1.5 py-0.5 rounded text-[8px] font-mono";
        restoreBtn.textContent = "[RES]";
        restoreBtn.addEventListener("click", async () => {
            const password = prompt("Ingresa la contraseña del backup para restaurarlo:");
            if (!password) return;
            try {
                const encryptedBytes = state.storage.base64ToArrayBuffer(b.content);
                const data = await state.backup.decryptBackup(encryptedBytes, password);

                await state.storage.save('hermes_contacts',     data.contacts        || []);
                await state.storage.save('hermes_contact_data', data.contactData     || []);
                await state.storage.save('hermes_shared_keys',  data.sharedKeys      || {});
                await state.storage.save('hermes_groups',       data.groups          || []);
                await state.storage.save('hermes_messages',     data.messageHistory  || {});
                await state.storage.save('hermes_settings',     data.settings        || {});
                await state.storage.save('hermes_keys',         data.userKeys        || null);

                showToast("Backup legacy restaurado.");
                showToast('Backup legacy restaurado. Recargando...');
                setTimeout(() => window.location.reload(), 1500);
            } catch (e) {
                showToast('Error de restauración: Contraseña incorrecta', true);
            }
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "bg-red-950/20 border border-red-500/20 text-red-400 hover:bg-red-600 hover:text-white px-1.5 py-0.5 rounded text-[8px] font-mono";
        deleteBtn.textContent = "[DEL]";
        deleteBtn.addEventListener("click", async () => {
            const confirmed = await modalManager.confirm('[ ELIMINAR BACKUP ]', '¿Eliminar este backup local?');
            if (confirmed) {
                const updated = legacyBackups.filter(x => x.id !== b.id);
                localStorage.setItem(state.storage.getUserId() + "_local_backups", JSON.stringify(updated));
                loadBackupsList();
            }
        });

        actions.appendChild(restoreBtn);
        actions.appendChild(deleteBtn);
        el.appendChild(info);
        el.appendChild(actions);
        container.appendChild(el);
    });
}

export function setupBackupRestoreListeners() {
    const btnCreateBackup = document.getElementById("btn-create-backup");
    const restoreFileInput = document.getElementById("restore-file-input");
    const btnBackupSettings = document.getElementById("btn-backup-settings");

    btnBackupSettings?.addEventListener("click", () => {
        loadBackupsList();
        if (window.modalManager) {
            window.modalManager.open("backup-modal");
        }
    });

    // ── CREAR BACKUP (v7.1 — delega todo al BackupManager.createBackup()) ──
    btnCreateBackup?.addEventListener("click", async () => {
        const password = await modalManager.prompt('[ CIFRAR BACKUP ]', 'Ingresa una contraseña para cifrar el archivo de copia de seguridad (.hermes):');
        if (!password) return;

        try {
            const result = await state.backup.createBackup(password);

            if (result.success) {
                showToast(result.message);
                loadBackupsList();
            } else {
                showToast('Error al crear backup', true);
            }
        } catch (e) {
            console.error('[BackupUI] Error creando backup v7.1:', e);
            showToast('Error al crear backup: ' + e.message, true);
        }
    });

    // ── RESTAURAR BACKUP ─────────────────────────────────────────────────────────────────
    restoreFileInput?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const password = await modalManager.prompt('[ DESCIFRAR BACKUP ]', 'Ingresa la contraseña del backup para descifrarlo:');
        if (!password) return;

        try {
            const res = await state.backup.restoreBackup(file, password);
            if (res.success) {
                showToast('Backup restaurado. Recargando...');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                showToast(res.message, true);
            }
        } catch (err) {
            showToast('Error de restauración: ' + err.message, true);
        }
        restoreFileInput.value = "";
    });

    // ── AUTO BACKUP SETTINGS ─────────────────────────────────────────────────────────────
    const toggleAutoBackup = document.getElementById("toggle-auto-backup");
    const intervalContainer = document.getElementById("auto-backup-interval-container");
    const selectInterval = document.getElementById("select-auto-backup-interval");

    if (toggleAutoBackup && intervalContainer && selectInterval) {
        if (window.privacySettings) {
            toggleAutoBackup.checked = window.privacySettings.settings.backupEnabled;
            if (toggleAutoBackup.checked) {
                intervalContainer.classList.remove("hidden");
            }
            selectInterval.value = window.privacySettings.settings.backupFrequency || "86400";
        }

        const updateAutoBackup = () => {
            if (toggleAutoBackup.checked) {
                intervalContainer.classList.remove("hidden");
            } else {
                intervalContainer.classList.add("hidden");
            }
            if (window.privacySettings) {
                window.privacySettings.set('backupEnabled', toggleAutoBackup.checked);
                window.privacySettings.set('backupFrequency', parseInt(selectInterval.value));
            }
        };

        toggleAutoBackup.addEventListener("change", updateAutoBackup);
        selectInterval.addEventListener("change", updateAutoBackup);
    }
}
