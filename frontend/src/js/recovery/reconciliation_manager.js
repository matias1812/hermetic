// frontend/src/js/recovery/reconciliation_manager.js
import { state, sha256 } from '../state.js';
import { hermesStore } from '../store/hermes_store.js';
import { modalManager } from '../ui/modal_manager.js';
import { RecoveryKeyDerivation } from '../recovery_key_derivation.js';
import { recoverySystem } from '../recovery_system_complete.js';


function getSessionToken() {
    return sessionStorage.getItem('hermes_session_token') || localStorage.getItem('hermes_session_token');
}

function getCurrentUserId() {
    return state.currentUser || state.storage?.getUserId() || 'unknown';
}

async function getCurrentUserHash() {
    const id = getCurrentUserId();
    return await sha256(id);
}


export class ReconciliationManager {
    /**
     * Sistema de reconciliación para usuarios que vuelven sin backup.
     * 
     * FLUJO:
     * 1. Usuario se registra (mismo alias)
     * 2. Sistema detecta que NO tiene contactos/grupos locales
     * 3. Sistema verifica con el servidor si hay estado de membresía
     * 4. Si hay discordancia → ofrece 3 opciones al usuario
     */
    
    constructor() {
        this.recoveryKey = null;
        this.serverState = null;
        this.localState = null;
        this.currentOptions = [];
        this.currentDiscrepancy = null;
    }
    
    async checkForDiscrepancy() {
        console.log('🔍 [ReconciliationManager] Verificando discordancia de estado...');
        
        this.localState = await this.loadLocalState();
        this.serverState = await this.loadServerState();
        
        const discrepancy = this.detectDiscrepancy();
        
        if (discrepancy.hasDiscrepancy) {
            console.warn('⚠️ [ReconciliationManager] Discordancia detectada:', discrepancy);
            await this.showReconciliationOptions(discrepancy);
        } else {
            console.log('✅ [ReconciliationManager] Estado consistente');
        }
        return discrepancy;
    }
    
    async loadLocalState() {
        return {
            contacts: hermesStore?.state?.contacts || state.contacts?.contacts || [],
            groups: hermesStore?.state?.groups || state.groups?.userGroups || [],
            keys: hermesStore?.state?.keys || state.userKeys || {},
            hasBackup: Boolean(state.backup),
            hasRecoveryKey: localStorage.getItem('hermes_recovery_phrase') !== null,
            lastBackupDate: localStorage.getItem('hermes_last_auto_backup')
        };
    }

    
    async loadServerState() {
        try {
            const token = getSessionToken ? getSessionToken() : null;
            if (!token) return null;
            const response = await fetch('/api/user/state', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return null;
            const data = await response.json();
            return {
                contacts: data.contacts || [],
                groups: data.groups || [],
                lastSeen: data.lastSeen,
                deviceCount: data.deviceCount
            };
        } catch (error) {
            return null;
        }
    }
    
    detectDiscrepancy() {
        const discrepancies = {
            hasDiscrepancy: false,
            contactsOnServer: [],
            contactsMissingLocally: [],
            groupsOnServer: [],
            groupsMissingLocally: [],
            totalMissingContacts: 0,
            totalMissingGroups: 0
        };
        
        if (!this.serverState) return discrepancies;
        
        const localContactIds = new Set((this.localState.contacts || []).map(c => c.id));
        for (const serverContact of (this.serverState.contacts || [])) {
            if (!localContactIds.has(serverContact.userId)) {
                discrepancies.contactsMissingLocally.push(serverContact);
                discrepancies.totalMissingContacts++;
            }
        }
        
        const localGroupIds = new Set((this.localState.groups || []).map(g => g.id));
        for (const serverGroup of (this.serverState.groups || [])) {
            if (!localGroupIds.has(serverGroup.groupId)) {
                discrepancies.groupsMissingLocally.push(serverGroup);
                discrepancies.totalMissingGroups++;
            }
        }
        
        discrepancies.hasDiscrepancy = discrepancies.totalMissingContacts > 0 || discrepancies.totalMissingGroups > 0;
        return discrepancies;
    }
    
    async showReconciliationOptions(discrepancy) {
        const hasRecoveryKey = this.localState.hasRecoveryKey;
        const hasBackup = this.localState.hasBackup;
        
        let options = [];
        
        if (hasRecoveryKey) {
            options.push({
                id: 'recovery_key',
                title: '🔑 Restaurar con Recovery Key',
                description: 'Tienes una frase de recuperación guardada. Úsala para restaurar todos tus datos.',
                action: () => this.restoreWithRecoveryKey(),
                recommended: true
            });
        }
        
        if (hasBackup) {
            options.push({
                id: 'backup_file',
                title: '💾 Restaurar desde archivo de backup',
                description: 'Tienes un archivo .hermes guardado. Cárgalo para restaurar tus datos.',
                action: () => this.restoreFromBackupFile(),
                recommended: !hasRecoveryKey
            });
        }
        
        options.push({
            id: 'resync',
            title: '🔄 Sincronizar con mis contactos',
            description: `Tienes ${discrepancy.totalMissingContacts} contactos y ${discrepancy.totalMissingGroups} grupos en el servidor. Solicita a tus contactos que te reenvíen las invitaciones.`,
            action: () => this.requestResync(discrepancy),
            recommended: !hasRecoveryKey && !hasBackup
        });
        
        options.push({
            id: 'start_fresh',
            title: '🆕 Empezar de cero',
            description: 'Elimina tu estado anterior del servidor y comienza sin contactos ni grupos.',
            action: () => this.startFresh(),
            recommended: false,
            danger: true
        });
        
        this.currentOptions = options;
        this.currentDiscrepancy = discrepancy;
        
        modalManager.custom({
            title: '[ DATOS PERDIDOS — RECONCILIACIÓN ]',
            body: `
                <div class="reconciliation-warning p-3 bg-red-950/30 border border-red-500/50 rounded mb-4 text-xs font-mono">
                    <p class="text-yellow-400 font-bold mb-1">⚠️ Detectamos que perdiste tus datos locales</p>
                    <p class="text-gray-300">Encontramos <strong class="text-white">${discrepancy.totalMissingContacts} contactos</strong> y <strong class="text-white">${discrepancy.totalMissingGroups} grupos</strong> en el servidor que no están en tu dispositivo local.</p>
                </div>
                
                <div class="reconciliation-options space-y-3">
                    <p class="text-gray-400 text-xs font-mono">Elige cómo deseas proceder:</p>
                    
                    ${options.map(opt => `
                        <div class="p-3 bg-black border ${opt.recommended ? 'border-terminalGreen shadow-[0_0_10px_rgba(0,255,102,0.2)]' : (opt.danger ? 'border-red-900/60' : 'border-darkGrey')} rounded flex justify-between items-center gap-3">
                            <div>
                                <h4 class="font-bold text-xs ${opt.danger ? 'text-red-400' : 'text-terminalGreen'} font-mono">${opt.title} ${opt.recommended ? '<span class="ml-2 bg-terminalGreen text-black text-[9px] px-1.5 py-0.5 rounded font-bold">RECOMENDADO</span>' : ''}</h4>
                                <p class="text-[10px] text-gray-400 mt-1 leading-relaxed">${opt.description}</p>
                            </div>
                            <button class="btn-cyber shrink-0 px-3 py-1.5 text-[10px] font-bold ${opt.danger ? 'border-red-500 text-red-400 hover:bg-red-950' : 'border-terminalGreen text-terminalGreen hover:bg-terminalGreen hover:text-black'} border rounded uppercase transition-colors" onclick="window.reconciliationManager.selectOption('${opt.id}')">
                                SELECCIONAR
                            </button>
                        </div>
                    `).join('')}
                </div>
            `
        });
    }
    
    selectOption(optId) {
        const opt = this.currentOptions.find(o => o.id === optId);
        if (opt && opt.action) {
            modalManager.close();
            opt.action();
        }
    }
    
    async restoreWithRecoveryKey() {
        const phrase = await modalManager.prompt('[ RECOVERY KEY ]', 'Ingresa tus 12 palabras de recuperación');
        if (!phrase) return;
        try {
            const userHash = await getCurrentUserHash();
            const recoveryKey = await RecoveryKeyDerivation.deriveKeyFromMnemonic(phrase, userHash);

            const blobId = localStorage.getItem('hermes_recovery_blob_id') || 'latest';
            const blob = await recoverySystem.downloadBlob(blobId);
            const restoredState = await recoverySystem.decryptState(blob, recoveryKey);
            await this.applyRestoredState(restoredState);
            modalManager.alert('[ RECONCILIACIÓN EXITOSA ]', `Se recuperaron ${restoredState.contacts?.length || 0} contactos y ${restoredState.groups?.length || 0} grupos.`);
        } catch (error) {
            modalManager.alert('[ ERROR ]', 'No se pudo restaurar el estado. Verifica tus palabras clave.');
        }
    }
    
    async restoreFromBackupFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.hermes';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const pwd = await modalManager.prompt('[ DESCIFRAR BACKUP ]', 'Ingresa la contraseña del archivo de respaldo');
            if (!pwd) return;
            try {
                const text = await file.text();
                if (state.backup) {
                    await state.backup.restoreBackup(text, pwd);
                    modalManager.alert('[ ÉXITO ]', 'Respaldo importado correctamente.');
                    setTimeout(() => window.location.reload(), 1000);
                }
            } catch (err) {
                modalManager.alert('[ ERROR ]', 'Contraseña incorrecta o archivo dañado.');
            }
        };
        input.click();
    }
    
    async requestResync(discrepancy) {
        const myId = getCurrentUserId ? getCurrentUserId() : 'me';
        for (const contact of discrepancy.contactsMissingLocally) {
            try {
                if (state.sync) {
                    await state.sync.sendBlob(myId, contact.userId, {
                        type: 'resync_request',
                        from: myId,
                        timestamp: Date.now(),
                        message: 'He perdido mis datos locales. ¿Puedes reenviarme la invitación de contacto?'
                    });
                }

            } catch (e) {}
        }
        modalManager.alert('[ SOLICITUDES ENVIADAS ]', `Se enviaron ${discrepancy.totalMissingContacts} solicitudes a tus contactos para resincronizar el canal.`);
    }
    
    async startFresh() {
        const confirmed = await modalManager.confirm('[ EMPEZAR DE CERO ]', '¿Estás SEGURO de que deseas purgar el estado antiguo en el servidor? Perderás membresías previas.');
        if (!confirmed) return;
        try {
            const token = getSessionToken ? getSessionToken() : null;
            if (token) {
                await fetch('/api/user/purge', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            }
            await hermesStore.clearAll();
            modalManager.alert('[ REINICIANDO ]', 'Estado del servidor purgado. Empezando de cero limpia y herméticamente.');
            setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
            modalManager.alert('[ ERROR ]', 'No se pudo contactar al servidor para purgar el estado.');
        }
    }
    
    async applyRestoredState(restoredState) {
        if (restoredState.contacts) {
            for (const c of restoredState.contacts) hermesStore.dispatch('CONTACT_ADDED', c);
        }
        if (restoredState.groups) {
            for (const g of restoredState.groups) hermesStore.dispatch('GROUP_CREATED', g);
        }
    }
}

export const reconciliationManager = new ReconciliationManager();
if (typeof window !== 'undefined') {
    window.reconciliationManager = reconciliationManager;
    document.addEventListener('hermes:logged_in', () => reconciliationManager.checkForDiscrepancy());
}
