import { hermesBridge } from './crypto_wasm_bridge.js';
import { EncryptedStorageManager } from './storage_manager.js';
import { LocalContactManager } from './contact_manager.js';
import { LocalGroupManager } from './group_manager.js';
import { LocalChatManager } from './chat_manager.js';
import { BackupManager } from './backup_manager.js';
import { MediaStorage } from './media_storage.js';
import { ToastManager } from './ui/toast_manager.js';
// NOTE: ScreenshotDetector is NOT imported here to avoid circular dependency.
// It is lazy-imported in auth_ui.js after login via dynamic import().

export const state = {
    currentUser: null,
    userKeys: null, // { kyber_pk, kyber_sk, sphincs_pk, sphincs_sk }
    activeContact: null,
    activeGroup: null,
    chatMessages: [],
    activeInspectorMsg: null,
    backupReminderInterval: null,
    privacySettings: { readReceipts: true, onlineStatus: true },
    
    // Global Managers
    storage: new EncryptedStorageManager(),
    contacts: new LocalContactManager(),
    groups: new LocalGroupManager(),
    chats: new LocalChatManager(),
    backup: null,
    sync: null,

    // Multimedia
    mediaStorage: new MediaStorage(),
    screenshotDetector: null,   // inicializado tras login
};

let lastTs = 0;
export function intTimestamp() {
    let current = Math.floor(Date.now() / 1000);
    if (current <= lastTs) {
        current = lastTs + 1;
    }
    lastTs = current;
    return current;
}

export function showToast(message, isErrorOrType = false) {
    ToastManager.show(message, isErrorOrType);
}

// Exponer globalmente para módulos que no pueden importar state.js (evitar deps circulares)
window._hermesShowToast = showToast;
window.state = state;

document.addEventListener('contacts_updated', () => {
    document.dispatchEvent(new Event('hermes:contacts_updated'));
});

export async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await hermesBridge.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
