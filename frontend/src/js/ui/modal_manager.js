import { IconSystem } from '../icon_system.js';

export class ModalManager {
    constructor() {
        this.ensureModalContainer();
        this.activeModal = null;
        this.lastFocused = null;
        this.escapeListener = (e) => {
            if (e.key === 'Escape' && this.activeModal) {
                e.preventDefault();
                // Check if it's the dynamic hermes root which uses promises
                if (this.activeModal.id === 'hermes-modal-root' && this.currentResolve) {
                    const cancelVal = this.currentButtons?.length > 0 && this.currentButtons[0].resolveValue === false ? false : null;
                    this.closeModal(this.activeModal, this.currentResolve, cancelVal);
                } else {
                    this.closeActive();
                }
            }
        };
        document.addEventListener('keydown', this.escapeListener);
        
        // Universal backdrop click
        document.addEventListener('click', (e) => {
            if (this.activeModal && e.target === this.activeModal) {
                if (this.activeModal.id === 'hermes-modal-root' && this.currentResolve) {
                    const cancelVal = this.currentButtons?.length > 0 && this.currentButtons[0].resolveValue === false ? false : null;
                    this.closeModal(this.activeModal, this.currentResolve, cancelVal);
                } else {
                    this.closeActive();
                }
            }
        });
    }
    
    ensureModalContainer() {
        if (!document.getElementById('hermes-modal-root')) {
            const root = document.createElement('div');
            root.id = 'hermes-modal-root';
            // Use consistent high z-index
            root.className = 'fixed inset-0 z-[2147483647] hidden items-center justify-center bg-black/80 backdrop-blur-sm';
            document.body.appendChild(root);
        }
    }

    open(modalId) {
        if (this.activeModal && this.activeModal.id !== modalId) {
            this.closeActive(); // Enforce single instance
        }
        
        const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
        if (!modal) return;
        
        this.lastFocused = document.activeElement;
        this.activeModal = modal;
        
        document.body.style.overflow = 'hidden'; // Impedir scroll del body
        
        // Consistent z-index for all modals opened through this method
        modal.style.zIndex = '2147483647';
        
        if (modal.id === 'hermes-modal-root') {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        } else {
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.remove('opacity-0'), 10);
        }
        
        // Focus trap
        setTimeout(() => {
            const focusable = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (focusable.length) {
                focusable[focusable.length - 1].focus(); // Default to last (usually primary button) or first input
                const firstInput = modal.querySelector('input:not([disabled])');
                if (firstInput) firstInput.focus();
            }
        }, 50);
    }
    
    closeActive() {
        if (!this.activeModal) return;
        const modal = this.activeModal;
        
        if (modal.id === 'hermes-modal-root') {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.innerHTML = '';
        } else {
            modal.classList.add('opacity-0');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
        
        this.activeModal = null;
        document.body.style.overflow = ''; // Restaurar scroll
        
        if (this.lastFocused && typeof this.lastFocused.focus === 'function') {
            this.lastFocused.focus();
            this.lastFocused = null;
        }
    }

    closeModal(root, resolve, resolveVal) {
        this.closeActive();
        if (resolve) resolve(resolveVal);
        this.currentResolve = null;
        this.currentButtons = null;
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
                <div class="bg-gray-900 border border-terminalGreen rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl relative" role="dialog" aria-modal="true">
                    <h3 class="text-lg font-bold text-terminalGreen mb-2">${title}</h3>
                    <p class="text-sm text-gray-300 mb-4">${message}</p>
                    <input type="text" id="hermes-prompt-input" value="${defaultValue}" class="w-full bg-black border border-gray-700 rounded px-3 py-2 text-white mb-6 focus:border-terminalGreen outline-none"/>
                    <div class="flex justify-end space-x-3">
                        <button id="hermes-modal-cancel" class="px-4 py-2 border border-gray-600 text-gray-300 rounded hover:bg-gray-800">Cancelar</button>
                        <button id="hermes-modal-confirm" class="px-4 py-2 bg-terminalGreen text-black font-bold rounded hover:bg-green-400">Aceptar</button>
                    </div>
                </div>
            `;
            
            this.currentResolve = resolve;
            this.currentButtons = [{resolveValue: false}]; // Default cancel behavior for ESC/Backdrop
            
            this.open(root);
            
            const input = root.querySelector('#hermes-prompt-input');
            const btnCancel = root.querySelector('#hermes-modal-cancel');
            const btnConfirm = root.querySelector('#hermes-modal-confirm');
            
            if (input) {
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.closeModal(root, resolve, input.value.trim());
                    }
                };
            }
            
            if (btnCancel) btnCancel.onclick = () => this.closeModal(root, resolve, null);
            if (btnConfirm) btnConfirm.onclick = () => this.closeModal(root, resolve, input ? input.value.trim() : '');
        });
    }
    
    async custom({ title, body, footer, size = 'default' }) {
        return new Promise((resolve) => {
            const root = document.getElementById('hermes-modal-root');
            const maxWidthClass = size === 'large' ? 'max-w-2xl' : 'max-w-md';
            
            root.innerHTML = `
                <div class="bg-gray-900 border border-terminalGreen rounded-lg p-6 ${maxWidthClass} w-full mx-4 shadow-2xl relative" role="dialog" aria-modal="true">
                    ${title ? `<h3 class="text-lg font-bold text-terminalGreen mb-4">${title}</h3>` : ''}
                    <div class="mb-6 text-gray-300 overflow-hidden break-words">
                        ${body}
                    </div>
                    ${footer ? `<div class="flex justify-end space-x-3 mt-4">${footer}</div>` : ''}
                </div>
            `;
            
            this.currentResolve = resolve;
            this.currentButtons = [{resolveValue: false}]; // Default cancel behavior for ESC
            
            this.open(root);
        });
    }

    close() {
        const root = document.getElementById('hermes-modal-root');
        this.closeModal(root, this.currentResolve, null);
    }
    
    showModal({ title, message, icon = '', buttons = [] }) {
        return new Promise((resolve) => {
            const root = document.getElementById('hermes-modal-root');
            const buttonsHtml = buttons.map((btn, idx) => `
                <button data-idx="${idx}" class="${btn.class}">${btn.label}</button>
            `).join('');
            
            root.innerHTML = `
                <div class="bg-gray-900 border border-terminalGreen rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl relative" role="dialog" aria-modal="true">
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
            
            this.currentResolve = resolve;
            this.currentButtons = buttons;
            
            this.open(root);
            
            const btnElements = root.querySelectorAll('button');
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
