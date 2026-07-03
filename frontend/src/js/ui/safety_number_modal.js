import { safetyNumberVerifier } from '../safety_numbers.js';
import { showToast } from '../state.js';
import { DOMSanitizer } from './dom_sanitizer.js';

export async function openSafetyNumberModal(state, targetId, onVerifiedCb) {
    if (!state || !targetId) return;

    let root = document.getElementById('hermes-modal-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'hermes-modal-root';
        root.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black/80 backdrop-blur-sm';
        document.body.appendChild(root);
    }

    const myIk = state.userKeys?.sphincs_pk || "0000000000000000";
    const theirIk = await state.sync.getContactPublicKey(targetId);

    const mySN = await safetyNumberVerifier.generateSafetyNumber(myIk, state.currentUser);
    const theirSN = await safetyNumberVerifier.generateSafetyNumber(theirIk, targetId);
    const qrUri = safetyNumberVerifier.generateQRCodeURI(myIk, state.currentUser);

    const statusObj = state.contacts.getContactOOBStatus(targetId);
    let statusText = "SIN VERIFICAR OOB";
    let statusClass = "text-gray-400";
    const safeTarget = DOMSanitizer.escapeHTML(targetId);
    if (statusObj.mutual) {
        statusText = "🛡️ VERIFICADO OOB (MUTUO)";
        statusClass = "text-terminalGreen font-bold";
    } else if (statusObj.meVerified) {
        statusText = "🛡️ TÚ VERIFICASTE ESTA HUELLA";
        statusClass = "text-yellow-400 font-bold";
    } else if (statusObj.peerVerified) {
        statusText = `🛡️ @${safeTarget.toUpperCase()} VERIFICÓ TU HUELLA`;
        statusClass = "text-cyan-400 font-bold";
    }

    const safeStatus = DOMSanitizer.escapeHTML(statusText);
    const safeMyUser = DOMSanitizer.escapeHTML(state.currentUser || 'ME');
    const safeMySN = DOMSanitizer.escapeHTML(mySN);
    const safeTheirSN = DOMSanitizer.escapeHTML(theirSN);

    root.innerHTML = `
        <div class="bg-gray-900 border border-terminalGreen rounded-lg p-6 max-w-lg w-full mx-4 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
            <div class="flex items-center justify-between border-b border-darkGrey pb-3">
                <div class="flex items-center space-x-3">
                    <span class="text-2xl">🛡️</span>
                    <div>
                        <h3 class="text-sm font-bold text-terminalGreen tracking-wide uppercase">SAFETY NUMBERS / IDENTIDAD OOB</h3>
                        <p class="text-[9px] text-gray-400 font-mono uppercase">CANAL CON @${safeTarget.toUpperCase()}</p>
                    </div>
                </div>
                <div class="text-[9px] font-mono px-2 py-0.5 rounded border border-darkGrey ${statusClass}">
                    ${statusText}
                </div>
            </div>

            <div class="space-y-3">
                <div class="bg-black p-3 rounded border border-darkGrey">
                    <div class="text-[9px] text-gray-400 uppercase font-mono mb-1">TUS SAFETY NUMBERS (@${safeMyUser}):</div>
                    <div class="font-mono text-xs text-terminalGreen tracking-wider select-all break-all font-bold">${safeMySN}</div>
                </div>

                <div class="bg-black p-3 rounded border border-darkGrey">
                    <div class="text-[9px] text-gray-400 uppercase font-mono mb-1">SUS SAFETY NUMBERS (@${safeTarget}):</div>
                    <div class="font-mono text-xs text-cyan-400 tracking-wider select-all break-all font-bold">${safeTheirSN}</div>
                </div>

                <div class="flex flex-col items-center justify-center bg-black p-3 rounded border border-darkGrey space-y-2">
                    <div class="text-[9px] text-gray-400 font-mono uppercase">URI CRIPTOGRÁFICO PARA ESCANEO QR:</div>
                    <div class="bg-darkSurface p-2 rounded border border-darkGrey w-full text-center text-gray-200 font-mono text-[9px] select-all break-all">
                        <code>${qrUri}</code>
                    </div>
                    <p class="text-[9px] text-gray-500 text-center leading-relaxed">
                        Compara los 30 dígitos numéricos o escanea mediante un canal externo de confianza (en persona o videollamada) para descartar ataques Man-in-the-Middle.
                    </p>
                </div>
            </div>

            <div class="flex justify-end space-x-3 border-t border-darkGrey pt-3">
                <button id="btn-sn-close" class="px-4 py-2 border border-gray-600 text-gray-300 rounded text-xs hover:bg-gray-800 uppercase font-mono transition-colors">Cerrar</button>
                <button id="btn-sn-confirm" class="px-4 py-2 bg-terminalGreen text-black font-bold rounded text-xs hover:bg-green-400 uppercase font-mono shadow-[0_0_10px_rgba(0,255,102,0.3)] transition-all">🛡️ MARCAR COMO VERIFICADO</button>
            </div>
        </div>
    `;

    root.classList.remove('hidden');
    root.classList.add('flex');

    const btnClose = document.getElementById('btn-sn-close');
    const btnConfirm = document.getElementById('btn-sn-confirm');

    const closeModal = () => {
        root.classList.add('hidden');
        root.classList.remove('flex');
        root.innerHTML = '';
        document.removeEventListener('keydown', keyHandler);
    };

    const keyHandler = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', keyHandler);

    if (btnClose) btnClose.onclick = closeModal;

    if (btnConfirm) {
        btnConfirm.onclick = async () => {
            closeModal();
            await state.contacts.verifyContactOOB(state.storage, targetId, true);
            showToast(`🛡️ Contacto @${targetId} marcado como verificado OOB`, false);

            // Notificar al peer a través del túnel o del relay para verificación mutua
            try {
                await state.sync.sendBlob(state.currentUser, targetId, {
                    type: "oob_verify"
                });
            } catch (err) {
                console.warn("[OOB] No se pudo enviar señal de verificación mutua en tiempo real:", err);
            }

            if (onVerifiedCb) onVerifiedCb();
        };
    }
}
