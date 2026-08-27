// frontend/src/js/auto_backup_trigger.js
import { state, showToast } from './state.js';
import { CryptoClient } from './crypto_client.js';

export class AutoBackupTrigger {
    constructor(backupManager, recoverySystem) {
        this.backup = backupManager || state.backup;
        this.recovery = recoverySystem;
        this.timer = null;
    }
    
    initialize() {
        document.addEventListener('privacy_settings_updated', () => this.applySchedule());
        this.applySchedule();
        console.log('✅ Auto-backup scheduler initialized');
    }
    
    applySchedule() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        const settings = window.privacySettings?.settings;
        if (!settings || !settings.backupEnabled || settings.backupFrequency === 0) {
            console.log('⏳ Auto-backup disabled or manual');
            return;
        }

        const freqMs = settings.backupFrequency * 1000;
        this.timer = setInterval(() => this.triggerScheduledBackup(), freqMs);
        console.log(`⏳ Auto-backup scheduled every ${settings.backupFrequency}s`);
    }

    async triggerBackup(reason = 'event') {
        const settings = window.privacySettings?.settings;
        if (!settings || !settings.backupEnabled) return;
        
        if (this._backupInProgress) return;
        this._backupInProgress = true;
        try {
            console.log(`💾 Event-triggered auto-backup due to: ${reason}`);
            await this.triggerScheduledBackup();
        } finally {
            this._backupInProgress = false;
        }
    }

    async triggerScheduledBackup() {
        console.log(`💾 Scheduled Auto-backup triggered`);
        if (!state.backup || !state.storage || !state.storage.getUserId() || !state.storage.isUnlocked) {
            return;
        }

        const settings = window.privacySettings?.settings;
        const dest = settings?.backupDestination || 'local';
        const encryptionKey = localStorage.getItem('hermes_recovery_key_cache') || (state.storage.getUserId() + '_local_auto_key');

        try {
            const allData = await state.backup._collectAllData();
            allData.checksum = await state.backup.calculateChecksum(allData);
            const encrypted = await state.backup.encryptBackup(allData, encryptionKey);
            
            if (dest === 'cloud') {
                await this.uploadToCloud(encrypted);
                this.showBackupToast('la Nube Cifrada');
            } else if (dest === 'custom') {
                state.backup.downloadBackupFile(encrypted);
                this.showBackupToast('tu Carpeta (Descargas)');
            } else {
                const metadata = {
                    totalImages: Object.keys(allData.images || {}).length,
                    totalAudio: Object.keys(allData.audio || {}).length,
                    totalMessages: state.backup._countMessages(allData.messageHistory),
                    backupSize: encrypted.byteLength
                };
                if (typeof state.backup._registerBackup === 'function') {
                    await state.backup._registerBackup(metadata);
                }
                const legacyKey = state.storage.getUserId() + "_local_backups";
                const legacy = JSON.parse(localStorage.getItem(legacyKey) || "[]");
                legacy.push({ id: "auto_" + Date.now(), date: new Date().toLocaleString(), totalMessages: metadata.totalMessages });
                localStorage.setItem(legacyKey, JSON.stringify(legacy.slice(-10)));
                this.showBackupToast('tu Dispositivo (Local Index)');
            }
            
            localStorage.setItem('hermes_last_auto_backup', Date.now().toString());
        } catch (error) {
            console.warn('⚠️ Auto-backup failed:', error);
        }
    }

    async uploadToCloud(encryptedBuffer) {
        const userId = state.storage.getUserId();
        const hexData = state.backup._bufferToHex(encryptedBuffer);
        const timestamp = Math.floor(Date.now()/1000);
        const signature = await CryptoClient.signTimestamp(timestamp, state.userKeys?.sphincs_sk);
        const sessionToken = sessionStorage.getItem('hermes_session_token') || localStorage.getItem('hermes_session_token');

        const payload = {
            user_hash: userId,
            encrypted_data_hex: hexData,
            backup_id: crypto.randomUUID(),
            backup_type: window.privacySettings?.settings.backupType || 'full',
            parent_id: null,
            timestamp: timestamp,
            signature: signature
        };

        const headers = { "Content-Type": "application/json" };
        if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;

        const res = await fetch("/api/backup", {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Cloud upload failed");
    }

    showBackupToast(dest) {
        showToast(`💾 Backup automático guardado en ${dest}`);
    }
}

export const autoBackupTrigger = new AutoBackupTrigger();
