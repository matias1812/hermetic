// frontend/src/js/ui/state_renderer.js
import { IconSystem } from '../icon_system.js';
import { DOMSanitizer } from './dom_sanitizer.js';

export class StateRenderer {
    /**
     * Renderizador estándar de estados de UI (Loading, Empty, Error, Offline).
     * Garantiza uniformidad visual en listas, paneles de chat y menús.
     */

    static renderLoading(container, text = 'Descifrando datos locales...') {
        if (!container) return;
        const safeText = DOMSanitizer.escapeHTML(text);
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 space-y-3 text-gray-500 min-h-[140px] select-none animate-pulse">
                <div class="w-6 h-6 border-2 border-terminalGreen border-t-transparent rounded-full animate-spin"></div>
                <span class="text-[11px] font-mono tracking-widest uppercase text-terminalGreen/80">${safeText}</span>
            </div>
        `;
    }

    static renderEmpty(container, title = 'SIN DATOS', subtitle = 'No hay elementos para mostrar en esta vista.', iconName = 'lock') {
        if (!container) return;
        const icon = IconSystem.get(iconName, 32);
        const safeTitle = DOMSanitizer.escapeHTML(title);
        const safeSub = DOMSanitizer.escapeHTML(subtitle);
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 text-center space-y-2 text-gray-500 min-h-[160px] select-none">
                <div class="text-gray-600 mb-1 opacity-60">${icon}</div>
                <div class="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">${safeTitle}</div>
                <div class="text-[10px] font-mono text-gray-600 max-w-xs leading-relaxed">${safeSub}</div>
            </div>
        `;
    }

    static renderError(container, message = 'Ocurrió un error al procesar este componente.', retryCallback = null) {
        if (!container) return;
        const icon = IconSystem.get('error', 28);
        const safeMsg = DOMSanitizer.escapeHTML(message);
        
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-6 text-center space-y-3 bg-red-950/10 border border-red-500/20 rounded-lg m-3 min-h-[140px] select-none">
                <div class="text-red-400 animate-bounce">${icon}</div>
                <div class="text-xs font-mono font-bold text-red-400 uppercase tracking-wide">ERROR DE INTEGRIDAD / RED</div>
                <div class="text-[10px] font-mono text-red-300/80 max-w-sm leading-relaxed">${safeMsg}</div>
                <div id="state-retry-btn-container"></div>
            </div>
        `;

        if (retryCallback && typeof retryCallback === 'function') {
            const btn = document.createElement('button');
            btn.className = 'mt-2 px-3 py-1.5 bg-red-900/40 hover:bg-red-800 text-red-200 border border-red-500/40 rounded text-[10px] font-mono font-bold uppercase transition-all tracking-wider shadow';
            btn.textContent = '↻ REINTENTAR';
            btn.addEventListener('click', retryCallback);
            container.querySelector('#state-retry-btn-container')?.appendChild(btn);
        }
    }

    static renderOffline(container, retryCallback = null) {
        if (!container) return;
        const icon = IconSystem.get('warning', 28);
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-6 text-center space-y-3 bg-yellow-950/10 border border-yellow-500/20 rounded-lg m-3 min-h-[140px] select-none">
                <div class="text-yellow-400">${icon}</div>
                <div class="text-xs font-mono font-bold text-yellow-400 uppercase tracking-wide">MODO DESCONECTADO (OFFLINE)</div>
                <div class="text-[10px] font-mono text-yellow-200/70 max-w-sm leading-relaxed">
                    No se puede conectar con el relevo hermético. Tus mensajes y llaves locales siguen protegidos en IndexedDB.
                </div>
                <div id="offline-retry-btn-container"></div>
            </div>
        `;

        if (retryCallback && typeof retryCallback === 'function') {
            const btn = document.createElement('button');
            btn.className = 'mt-2 px-3 py-1.5 bg-yellow-900/40 hover:bg-yellow-800 text-yellow-200 border border-yellow-500/40 rounded text-[10px] font-mono font-bold uppercase transition-all tracking-wider shadow';
            btn.textContent = '⚡ RECONECTAR AHORA';
            btn.addEventListener('click', retryCallback);
            container.querySelector('#offline-retry-btn-container')?.appendChild(btn);
        }
    }
}
