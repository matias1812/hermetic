// frontend/src/js/ui/toast_manager.js
import { IconSystem } from '../icon_system.js';
import { DOMSanitizer } from './dom_sanitizer.js';

export class ToastManager {
    /**
     * Sistema de Toasts para feedback visual no invasivo.
     * Reemplaza alertas y banners molestos con stacking y auto-destrucción.
     */
    static activeToasts = [];
    static maxToasts = 3;

    static ensureContainer() {
        let container = document.getElementById('hermes-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'hermes-toast-container';
            container.className = 'fixed bottom-5 right-5 z-100 flex flex-col space-y-2.5 pointer-events-none max-w-xs sm:max-w-sm';
            document.body.appendChild(container);
        }
        return container;
    }

    static show(message, typeOrIsError = 'info', duration = 3500) {
        const container = this.ensureContainer();

        // Limpiar si excede el máximo de toasts en pantalla
        while (this.activeToasts.length >= this.maxToasts) {
            const oldest = this.activeToasts.shift();
            if (oldest && oldest.parentElement) {
                oldest.classList.add('opacity-0', 'translate-y-2', 'scale-95');
                setTimeout(() => oldest.remove(), 200);
            }
        }

        // Determinar tipo real (compatible con llamadas booleanas de showToast legacy)
        let type = typeOrIsError;
        if (typeof typeOrIsError === 'boolean') {
            type = typeOrIsError ? 'error' : 'success';
        }

        const toast = document.createElement('div');
        const iconName = type === 'success' ? 'verified' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
        const icon = IconSystem.get(iconName, 18);

        const borderClass = type === 'success' 
            ? 'border-green-500/80 bg-gray-950/95 text-green-300' 
            : type === 'error' 
            ? 'border-red-500/80 bg-red-950/95 text-red-300' 
            : type === 'warning'
            ? 'border-yellow-500/80 bg-gray-950/95 text-yellow-300'
            : 'border-cyan-500/80 bg-gray-950/95 text-cyan-300';

        const safeMsg = DOMSanitizer.escapeHTML(message || '');
        toast.className = `pointer-events-auto flex items-center space-x-3 border ${borderClass} px-3.5 py-2.5 rounded shadow-2xl backdrop-blur-md transform transition-all duration-300 translate-y-4 opacity-0 scale-95 select-none cursor-pointer`;
        toast.innerHTML = `
            <span class="shrink-0 flex items-center">${icon}</span>
            <span class="text-xs font-mono tracking-wide leading-tight break-words">${safeMsg}</span>
        `;

        // Click para descartar anticipadamente
        toast.addEventListener('click', () => {
            const idx = this.activeToasts.indexOf(toast);
            if (idx !== -1) this.activeToasts.splice(idx, 1);
            toast.classList.add('opacity-0', 'translate-y-2', 'scale-95');
            setTimeout(() => toast.remove(), 250);
        });

        container.appendChild(toast);
        this.activeToasts.push(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-4', 'opacity-0', 'scale-95');
        });

        setTimeout(() => {
            const idx = this.activeToasts.indexOf(toast);
            if (idx !== -1) {
                this.activeToasts.splice(idx, 1);
                toast.classList.add('opacity-0', 'translate-y-2', 'scale-95');
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
}
