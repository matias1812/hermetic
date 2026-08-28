// frontend/src/js/recovery/reconciliation_manager.js
import { state, sha256 } from '../state.js';
import { modalManager } from '../ui/modal_manager.js';
import { recoverySystem } from '../recovery_system_complete.js';


function getSessionToken() {
    return sessionStorage.getItem('hermes_session_token');
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
     *
     * Backend real desde 2026-08-27 (ver BACKLOG.md #1): GET /api/user/state y
     * DELETE /api/user/purge existen y checkForDiscrepancy() (en cada login real,
     * evento hermes:logged_in) los usa de verdad. El servidor solo se entera de una
     * relación contacto/grupo por registro EXPLÍCITO post-handshake — nunca
     * infiriéndolo del tráfico del relay — disparado desde SyncManager.registerRelationship()
     * en los 4 puntos donde un handshake real se completa: aceptar/recibir
     * contact_accept (chat_ui.js/sync_manager.js) y crear/recibir group_invite
     * (group_ui.js/sync_manager.js).
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
            contacts: state.contacts?.contacts || [],
            groups: state.groups?.userGroups || [],
            keys: state.userKeys || {},
            hasBackup: Boolean(state.backup),
            hasRecoveryKey: localStorage.getItem('hermes_recovery_phrase_' + getCurrentUserId()) !== null,
            lastBackupDate: localStorage.getItem('hermes_last_auto_backup_' + getCurrentUserId())
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
        
        const localContactIds = new Set(this.localState.contacts || []);
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
            // recoverySystem.restore() ya descarga el backup más reciente, descifra,
            // resuelve conflictos contra el estado local y persiste el resultado
            // (contacts/groups/groupKeys/settings/keys) — no hay un decryptState()
            // ni un recoveryKey crudo que manejar acá aparte.
            const resolved = await recoverySystem.restore(phrase.trim(), userHash);
            const contactCount = resolved.state?.contacts?.length || 0;
            const groupCount = resolved.state?.groups?.length || 0;
            modalManager.alert('[ RECONCILIACIÓN EXITOSA ]', `Se recuperaron ${contactCount} contactos y ${groupCount} grupos.`);
        } catch (error) {
            console.error('[Reconciliation] Error restaurando con recovery key:', error);
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
            state.contacts.contacts = [];
            state.contacts.contactData = [];
            state.contacts.sharedKeys = {};
            state.contacts.blockedContacts = [];
            await state.contacts.save(state.storage);
            state.groups.userGroups = [];
            await state.groups.save(state.storage);
            modalManager.alert('[ REINICIANDO ]', 'Estado del servidor purgado. Empezando de cero limpia y herméticamente.');
            setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
            modalManager.alert('[ ERROR ]', 'No se pudo contactar al servidor para purgar el estado.');
        }
    }
    
    async applyRestoredState(restoredState) {
        // El servidor solo confirma que la relación existió (userId/id), nunca el
        // material criptográfico (blind relay) — se restaura como "aceptado" sin
        // shared_key; el canal real se re-establece en el siguiente handshake.
        if (restoredState.contacts) {
            for (const c of restoredState.contacts) {
                const contactId = c.userId || c.id || c;
                if (!state.contacts.contacts.includes(contactId)) {
                    state.contacts.contacts.push(contactId);
                }
                state.contacts.contactData = state.contacts.contactData.filter(cd => cd.contact_id !== contactId);
                state.contacts.contactData.push({ contact_id: contactId, status: 'accepted', shared_key: null });
            }
            await state.contacts.save(state.storage);
        }
        if (restoredState.groups) {
            for (const g of restoredState.groups) {
                if (!state.groups.userGroups.some(ug => ug.id === g.id)) {
                    state.groups.userGroups.push(g);
                }
            }
            await state.groups.save(state.storage);
        }
    }
}

export const reconciliationManager = new ReconciliationManager();
if (typeof window !== 'undefined') {
    window.reconciliationManager = reconciliationManager;
    document.addEventListener('hermes:logged_in', () => reconciliationManager.checkForDiscrepancy());
}
