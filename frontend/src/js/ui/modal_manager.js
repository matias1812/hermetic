// frontend/src/js/ui/modal_manager.js
import { IconSystem } from '../icon_system.js';

export class ModalManager {
    /**
     * Gestor profesional de Modales para reemplazar alertas del navegador.
     * Reemplaza alert(), confirm() y prompt() por interfaces HTML limpias con accesibilidad (Esc, Tab).
     */
    
    constructor() {
        this.ensureModalContainer();
        this.activeKeydownHandler = null;
    }
    
    ensureModalContainer() {
        if (!document.getElementById('hermes-modal-root')) {
            const root = document.createElement('div');
            root.id = 'hermes-modal-root';
            root.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-black/80 backdrop-blur-sm';
            document.body.appendChild(root);
        }
    }

    closeModal(root, resolve, resolveVal) {
        if (this.activeKeydownHandler) {
            document.removeEventListener('keydown', this.activeKeydownHandler);
            this.activeKeydownHandler = null;
        }
        root.classList.add('hidden');
        root.classList.remove('flex');
        root.innerHTML = '';
        resolve(resolveVal);
    }
    
    async alert(title, message, type = 'info') {
        const icon = IconSystem.get(type === 'error' ? 'error' : type === 'success' ? 'verified' : 'warning', 32);
        return this.showModal({
            title,
            message,
            icon,
            buttons: [
                { label: 'Aceptar', class: 'btn-terminal-primary w-full py-2 bg-terminalGreen text-black font-bold rounded', resolveValue: true }
            ]
        });
    }
    
    async confirm(title, message) {
        const icon = IconSystem.get('warning', 32);
        return this.showModal({
            title,
            message,
            icon,
            buttons: [
                { label: 'Cancelar', class: 'px-4 py-2 border border-gray-600 text-gray-300 rounded hover:bg-gray-800', resolveValue: false },
                { label: 'Confirmar', class: 'px-4 py-2 bg-terminalGreen text-black font-bold rounded hover:bg-green-400', resolveValue: true }
            ]
        });
    }
    
    async prompt(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            const root = document.getElementById('hermes-modal-root');
            root.innerHTML = `
                <div class="bg-gray-900 border border-terminalGreen rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl" role="dialog" aria-modal="true">
                    <h3 class="text-lg font-bold text-terminalGreen mb-2">${title}</h3>
                    <p class="text-sm text-gray-300 mb-4">${message}</p>
                    <input type="text" id="hermes-prompt-input" value="${defaultValue}" class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-white mb-6 focus:border-terminalGreen outline-none"/>
                    <div class="flex justify-end space-x-3">
                        <button id="hermes-modal-cancel" class="px-4 py-2 border border-gray-600 text-gray-300 rounded hover:bg-gray-800">Cancelar</button>
                        <button id="hermes-modal-confirm" class="px-4 py-2 bg-terminalGreen text-black font-bold rounded hover:bg-green-400">Aceptar</button>
                    </div>
                </div>
            `;
            root.classList.remove('hidden');
            root.classList.add('flex');
            
            const input = document.getElementById('hermes-prompt-input');
            const btnCancel = document.getElementById('hermes-modal-cancel');
            const btnConfirm = document.getElementById('hermes-modal-confirm');
            
            input.focus();

            this.activeKeydownHandler = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeModal(root, resolve, null);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.closeModal(root, resolve, input.value.trim());
                }
            };
            document.addEventListener('keydown', this.activeKeydownHandler);
            
            btnCancel.onclick = () => this.closeModal(root, resolve, null);
            btnConfirm.onclick = () => this.closeModal(root, resolve, input.value.trim());
        });
    }
    
    showModal({ title, message, icon = '', buttons = [] }) {
        return new Promise((resolve) => {
            const root = document.getElementById('hermes-modal-root');
            const buttonsHtml = buttons.map((btn, idx) => `
                <button data-idx="${idx}" class="${btn.class}">${btn.label}</button>
            `).join('');
            
            root.innerHTML = `
                <div class="bg-gray-900 border border-terminalGreen rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl" role="dialog" aria-modal="true">
                    <div class="flex items-center space-x-3 mb-3">
                        ${icon ? `<span>${icon}</span>` : ''}
                        <h3 class="text-lg font-bold text-terminalGreen">${title}</h3>
                    </div>
                    <p class="text-sm text-gray-300 mb-6">${message}</p>
                    <div class="flex justify-end space-x-3">
                        ${buttonsHtml}
                    </div>
                </div>
            `;
            
            root.classList.remove('hidden');
            root.classList.add('flex');

            const btnElements = root.querySelectorAll('button');
            if (btnElements.length > 0) {
                // enfocar el último botón (confirmar) por defecto
                btnElements[btnElements.length - 1].focus();
            }

            this.activeKeydownHandler = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    const cancelVal = buttons.length > 0 && buttons[0].resolveValue === false ? false : null;
                    this.closeModal(root, resolve, cancelVal);
                }
            };
            document.addEventListener('keydown', this.activeKeydownHandler);
            
            btnElements.forEach(btnEl => {
                btnEl.onclick = () => {
                    const idx = parseInt(btnEl.dataset.idx);
                    this.closeModal(root, resolve, buttons[idx].resolveValue);
                };
            });
        });
    }
}

export const modalManager = new ModalManager();
