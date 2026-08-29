// privacy_settings.js
import { state, showToast } from './state.js';

export class PrivacySettings {
    /**
     * Configuración de privacidad del usuario.
     */
    constructor() {
        this.settings = {
            showOnlineStatus: true,
            sendReadReceipts: true,
            allowScreenshots: false,
            autoDeleteMessages: false,
            autoDeleteTimer: 3600,
            
            // Privacidad y sincronización
            pendingMessageTTL: 86400, // 24 horas por defecto
            serverMessageDeletion: 'after_receipt', // 'on_logout', 'after_receipt', 'never'
            
            // Almacenamiento y recuperación
            backupEnabled: false,
            backupFrequency: 86400, // 24 horas por defecto si se activan
            backupType: 'incremental', // 'incremental', 'full'
            // SEC: sin 'cloud' -- el auto-backup es 100% local (ver BACKLOG.md, el fallback
            // de clave para 'cloud' era derivable de info pública, rompía zero-knowledge).
            backupDestination: 'local' // 'local', 'custom'
        };
        this.loadSettings();
    }

    async loadSettings() {
        if (!state.storage || !state.storage.getUserId()) return;
        try {
            const saved = await state.storage.load('hermes_privacy_settings');
            if (saved) {
                this.settings = { ...this.settings, ...saved };
            }
        } catch (e) {
            console.warn('No se pudo cargar configuración de privacidad:', e);
        }
        this.applySettings();
    }

    async saveSettings() {
        await state.storage.save('hermes_privacy_settings', this.settings);
        this.applySettings();
        
        // Disparar evento para que auto_backup_trigger u otros componentes reaccionen
        document.dispatchEvent(new Event('privacy_settings_updated'));
    }

    applySettings() {
        window.disableReadReceipts = !this.settings.sendReadReceipts;
        if (state.screenshotDetector) {
            state.screenshotDetector.isEnabled = !this.settings.allowScreenshots;
        }
    }

    renderPrivacyPanel() {
        const isTTL = (val) => this.settings.pendingMessageTTL === val ? 'checked' : '';
        const isDeletion = (val) => this.settings.serverMessageDeletion === val ? 'checked' : '';
        const isBackupEnabled = this.settings.backupEnabled ? 'checked' : '';
        const isFreq = (val) => this.settings.backupFrequency === val ? 'checked' : '';
        const isType = (val) => this.settings.backupType === val ? 'checked' : '';
        const isDest = (val) => this.settings.backupDestination === val ? 'checked' : '';

        return `
            <div class="privacy-settings p-3 border border-darkGrey rounded bg-black/60 font-mono space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
                
                <!-- BÁSICO -->
                <div>
                    <div class="border-b border-darkGrey pb-1 mb-3">
                        <h4 class="text-xs font-bold text-cyan-400 tracking-widest uppercase">[ Privacidad Básica ]</h4>
                    </div>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center text-[11px]">
                            <div><span class="text-white font-bold block">🟢 Mostrar estado en línea</span></div>
                            <input type="checkbox" class="cursor-pointer accent-terminalGreen w-4 h-4" ${this.settings.showOnlineStatus ? 'checked' : ''} onchange="window.privacySettings.toggle('showOnlineStatus')">
                        </div>
                        <div class="flex justify-between items-center text-[11px]">
                            <div><span class="text-white font-bold block">✓ Confirmación de lectura</span></div>
                            <input type="checkbox" class="cursor-pointer accent-terminalGreen w-4 h-4" ${this.settings.sendReadReceipts ? 'checked' : ''} onchange="window.privacySettings.toggle('sendReadReceipts')">
                        </div>
                        <div class="flex justify-between items-center text-[11px]">
                            <div><span class="text-white font-bold block">📸 Permitir capturas de pantalla</span></div>
                            <input type="checkbox" class="cursor-pointer accent-terminalGreen w-4 h-4" ${this.settings.allowScreenshots ? 'checked' : ''} onchange="window.privacySettings.toggle('allowScreenshots')">
                        </div>
                    </div>
                </div>

                <!-- PRIVACIDAD Y SINCRONIZACIÓN -->
                <div>
                    <div class="border-b border-darkGrey pb-1 mb-3">
                        <h4 class="text-xs font-bold text-cyan-400 tracking-widest uppercase">[ Privacidad y Sincronización ]</h4>
                    </div>

                    <div class="text-[11px] space-y-4">
                        <!-- TTL -->
                        <div>
                            <span class="text-white font-bold block text-sm">📬 Retención de mensajes pendientes</span>
                            <span class="text-gray-400 text-[10px] block mb-2 leading-tight">Los mensajes permanecen cifrados extremo a extremo. Si no te conectas antes de este tiempo, el servidor los eliminará automáticamente.</span>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-300 bg-darkerGrey/50 p-2 rounded">
                                <label><input type="radio" name="ttl" ${isTTL(3600)} onchange="window.privacySettings.set('pendingMessageTTL', 3600)"> 1 hora</label>
                                <label><input type="radio" name="ttl" ${isTTL(21600)} onchange="window.privacySettings.set('pendingMessageTTL', 21600)"> 6 horas</label>
                                <label class="text-terminalGreen font-bold"><input type="radio" name="ttl" ${isTTL(86400)} onchange="window.privacySettings.set('pendingMessageTTL', 86400)"> 24h (rec.)</label>
                                <label><input type="radio" name="ttl" ${isTTL(259200)} onchange="window.privacySettings.set('pendingMessageTTL', 259200)"> 3 días</label>
                                <label><input type="radio" name="ttl" ${isTTL(604800)} onchange="window.privacySettings.set('pendingMessageTTL', 604800)"> 7 días</label>
                                <label><input type="radio" name="ttl" ${isTTL(2592000)} onchange="window.privacySettings.set('pendingMessageTTL', 2592000)"> 30 días</label>
                            </div>
                        </div>

                        <!-- Reglas de Eliminación -->
                        <div>
                            <span class="text-white font-bold block text-sm">🧹 Eliminar mensajes pendientes del servidor</span>
                            <span class="text-gray-400 text-[10px] block mb-2 leading-tight">Controla cuándo el servidor debe borrar tus mensajes además del TTL.</span>
                            <div class="space-y-1 text-gray-300 bg-darkerGrey/50 p-2 rounded">
                                <label class="block"><input type="radio" name="delRule" ${isDeletion('on_logout')} onchange="window.privacySettings.set('serverMessageDeletion', 'on_logout')"> Al cerrar sesión</label>
                                <label class="block text-terminalGreen font-bold"><input type="radio" name="delRule" ${isDeletion('after_receipt')} onchange="window.privacySettings.set('serverMessageDeletion', 'after_receipt')"> Después de recibirlos (rec.)</label>
                                <label class="block"><input type="radio" name="delRule" ${isDeletion('never')} onchange="window.privacySettings.set('serverMessageDeletion', 'never')"> Nunca automáticamente</label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ALMACENAMIENTO Y RECUPERACIÓN -->
                <div>
                    <div class="border-b border-darkGrey pb-1 mb-3">
                        <h4 class="text-xs font-bold text-cyan-400 tracking-widest uppercase">[ Almacenamiento y Recuperación ]</h4>
                    </div>
                    
                    <div class="text-[11px] space-y-4">
                        <span class="text-gray-400 text-[10px] block mb-1">Los backups se cifran en tu dispositivo antes de almacenarse. El servidor no puede leer su contenido.</span>
                        
                        <!-- Manual Action Buttons -->
                        <div class="flex gap-2 mb-4">
                            <button type="button" onclick="window.triggerManualBackup()" class="flex-1 bg-terminalGreen text-black font-bold py-1.5 px-2 rounded hover:bg-cyan-400 transition-colors">Crear backup ahora</button>
                            <button type="button" onclick="window.triggerLoginRestore()" class="flex-1 bg-darkerGrey text-white font-bold py-1.5 px-2 rounded hover:bg-darkGrey transition-colors border border-gray-600">Restaurar backup</button>
                        </div>

                        <!-- Automáticos Toggle -->
                        <div class="flex items-center gap-2 bg-darkerGrey/80 p-2 rounded border border-gray-700">
                            <input type="checkbox" id="backupEnabledCb" class="cursor-pointer accent-terminalGreen w-4 h-4" ${isBackupEnabled} onchange="window.privacySettings.toggle('backupEnabled')">
                            <label for="backupEnabledCb" class="text-white font-bold">Activar backups automáticos</label>
                        </div>

                        <!-- Opciones Automáticas -->
                        <div id="backup-config-panel" class="${this.settings.backupEnabled ? '' : 'hidden'} transition-all space-y-3 bg-darkerGrey/30 p-2 rounded border border-darkGrey">
                            
                            <div>
                                <span class="text-gray-300 font-bold block mb-1">Frecuencia:</span>
                                <div class="grid grid-cols-2 gap-1 text-gray-400 text-[10px]">
                                    <label><input type="radio" name="bkpFry" ${isFreq(3600)} onchange="window.privacySettings.set('backupFrequency', 3600)"> Cada hora</label>
                                    <label><input type="radio" name="bkpFry" ${isFreq(21600)} onchange="window.privacySettings.set('backupFrequency', 21600)"> Cada 6 horas</label>
                                    <label class="text-terminalGreen font-bold"><input type="radio" name="bkpFry" ${isFreq(86400)} onchange="window.privacySettings.set('backupFrequency', 86400)"> Cada 24 horas</label>
                                    <label><input type="radio" name="bkpFry" ${isFreq(604800)} onchange="window.privacySettings.set('backupFrequency', 604800)"> Cada semana</label>
                                    <label><input type="radio" name="bkpFry" ${isFreq(0)} onchange="window.privacySettings.set('backupFrequency', 0)"> Solo manual</label>
                                </div>
                            </div>

                            <div>
                                <span class="text-gray-300 font-bold block mb-1">Tipo de backup:</span>
                                <div class="flex flex-col gap-1 text-gray-400 text-[10px]">
                                    <label class="text-terminalGreen font-bold"><input type="radio" name="bkpType" ${isType('incremental')} onchange="window.privacySettings.set('backupType', 'incremental')"> Incremental (recomendado)</label>
                                    <label><input type="radio" name="bkpType" ${isType('full')} onchange="window.privacySettings.set('backupType', 'full')"> Completo</label>
                                </div>
                            </div>

                            <div>
                                <span class="text-gray-300 font-bold block mb-1">Destino:</span>
                                <div class="flex flex-col gap-1 text-gray-400 text-[10px]">
                                    <label class="text-terminalGreen font-bold"><input type="radio" name="bkpDest" ${isDest('local')} onchange="window.privacySettings.set('backupDestination', 'local')"> Solo dispositivo</label>
                                    <label><input type="radio" name="bkpDest" ${isDest('custom')} onchange="window.privacySettings.set('backupDestination', 'custom')"> Carpeta personalizada</label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        `;
    }

    toggle(setting) {
        this.settings[setting] = !this.settings[setting];
        this.saveSettings();
        if (setting === 'backupEnabled') {
            const panel = document.getElementById('backup-config-panel');
            if (panel) {
                if (this.settings.backupEnabled) {
                    panel.classList.remove('hidden');
                } else {
                    panel.classList.add('hidden');
                }
            }
        }
        showToast(`Actualizado: ${setting}`);
    }

    set(setting, value) {
        this.settings[setting] = value;
        this.saveSettings();
        showToast(`Configuración actualizada`);
    }
}

export const privacySettings = new PrivacySettings();
window.privacySettings = privacySettings;
