import { CompleteRecoverySystem } from './recovery_system_complete.js';
import { state, showToast } from './state.js';
import { modalManager } from './ui/modal_manager.js';

export const recoverySystem = new CompleteRecoverySystem();

export function setupRecoveryUI() {
    const btnGenerate = document.getElementById('btn-generate-master-key');
    const btnExport = document.getElementById('btn-export-master-backup');
    const btnImport = document.getElementById('btn-import-master-backup');
    const inputImport = document.getElementById('master-recovery-file-input');
    const displayArea = document.getElementById('master-key-display') || document.getElementById('mnemonic-container');
    const wordsContainer = document.getElementById('bip39-words-container') || document.getElementById('mnemonic-display');

    if (btnGenerate) {
        btnGenerate.addEventListener('click', async () => {
            try {
                const idHash = state.userIdHash || state.storage?.getUserId() || sessionStorage.getItem("session_user_id_hash");
                if (!idHash) {
                    showToast('⚠️ Debes iniciar sesión antes de generar la llave maestra.', true);
                    return;
                }

                const { mnemonic } = await recoverySystem.initialize(idHash);
                
                if (wordsContainer && mnemonic) {
                    wordsContainer.innerHTML = '';
                    if (wordsContainer.id === 'mnemonic-display') {
                        wordsContainer.className = 'grid grid-cols-3 md:grid-cols-4 gap-1.5 p-2 bg-black/80 rounded border border-orange-500/30';
                    }
                    mnemonic.split(' ').forEach((word, idx) => {
                        const chip = document.createElement('div');
                        chip.className = 'bg-gray-900 border border-orange-500/40 text-orange-300 px-2 py-1 rounded text-[10px] font-mono flex items-center gap-1 shadow-sm';
                        chip.innerHTML = `<span class="text-gray-500 select-none text-[8px]">${idx + 1}.</span> <span class="font-bold">${word}</span>`;
                        wordsContainer.appendChild(chip);
                    });
                }
                
                if (displayArea) displayArea.classList.remove('hidden');
                localStorage.setItem('hermes_master_key_set', 'true');
                const mkBadge = document.getElementById('mk-status-badge');
                if (mkBadge) {
                    mkBadge.textContent = 'ACTIVA';
                    mkBadge.className = 'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-green-950/40 text-green-400 border border-green-800/40';
                }
                showToast('🔑 Nueva Llave Maestra generada. Guárdala en un lugar seguro.', false);
            } catch (e) {
                console.error('[RecoveryUI] Error generating master key:', e);
                showToast('❌ Error al generar la Llave Maestra: ' + (e.message || 'Error desconocido'), true);
            }
        });
    }

    if (btnExport) {
        btnExport.addEventListener('click', async () => {
            try {
                if (!recoverySystem.recoveryKey) {
                    showToast('⚠️ Primero genera una Llave Maestra (Paso 1).', true);
                    return;
                }

                // autoBackup() encrypts and exports the full state
                await recoverySystem.autoBackup();
                showToast('📦 Respaldo Maestro hermético exportado correctamente.', false);
            } catch (e) {
                console.error('[RecoveryUI] Error exporting backup:', e);
                showToast('❌ Error exportando el Respaldo Maestro: ' + (e.message || 'Error desconocido'), true);
            }
        });
    }

    if (btnImport) {
        btnImport.addEventListener('click', () => {
            if (inputImport) inputImport.click();
        });
    }

    if (inputImport) {
        inputImport.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const mnemonic = await modalManager.prompt('[ IMPORTAR RESPALDO ]', '🔑 Ingresa tu Frase Semilla de 12 palabras separadas por espacios para descifrar este Respaldo Maestro:');
            if (!mnemonic) {
                showToast('⚠️ Frase requerida.', true);
                e.target.value = '';
                return;
            }

            try {
                const idHash = state.userIdHash || state.storage?.getUserId() || sessionStorage.getItem("session_user_id_hash");
                await recoverySystem.restore(mnemonic.trim(), idHash);

                showToast('✅ Respaldo Maestro restaurado con éxito.', false);
                
                // Recargar interfaz
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                console.error('[RecoveryUI] Error importing:', err);
                showToast('❌ Error importando: ' + err.message, true);
            }
            e.target.value = '';
        });
    }
}
