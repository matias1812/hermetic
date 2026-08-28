// frontend/src/js/app_initializer.js
import { autoBackupTrigger } from './auto_backup_trigger.js';
import { IconSystem } from './icon_system.js';
import { eventBus } from './events/event_bus.js';
import { reconciliationManager } from './recovery/reconciliation_manager.js';



export class AppInitializer {
    /**
     * Inicializador COMPLETO de la aplicación.
     *
     * FLUJO AL CARGAR:
     * 1. Sincronizar y enganchar auto-backup y reemplazo de iconos SVG
     *
     * Nota: la hidratación del store (outbox) requiere que
     * state.storage.setUserId() ya haya corrido, así que se hace en
     * auth_ui.js::doLoginTransition, no acá (acá no hay sesión todavía).
     */

    async initialize() {
        console.log('🚀 Initializing Hermetic AppInitializer...');
        try {
            // Reemplazo y observación continua de iconos SVG
            IconSystem.initObserver();
            autoBackupTrigger.initialize();

            console.log('✅ Hermetic fully initialized');
        } catch (error) {
            console.error('❌ Initialization failed:', error);
        }
    }
}

export const appInitializer = new AppInitializer();

// Global Sidebar UI Helpers for redesign
if (typeof window !== 'undefined') {
    window.setSidebarTab = function(tabName) {
        const tabs = ['all', 'groups', 'contacts'];
        tabs.forEach(t => {
            const btn = document.getElementById(`tab-${t}`);
            if (btn) {
                if (t === tabName) {
                    btn.className = 'flex-1 pb-1.5 text-center font-bold text-terminalGreen border-b-2 border-terminalGreen transition-all tracking-wider';
                } else {
                    btn.className = 'flex-1 pb-1.5 text-center text-gray-500 hover:text-gray-300 border-b-2 border-transparent transition-all tracking-wider';
                }
            }
        });

        const groupsSec = document.getElementById('groups-section');
        const contactsSec = document.getElementById('contacts-section');
        const reqSec = document.getElementById('requests-section');
        const pendSec = document.getElementById('pending-section');

        if (tabName === 'all') {
            if (groupsSec) groupsSec.style.display = '';
            if (contactsSec) contactsSec.style.display = '';
            if (reqSec) reqSec.style.display = '';
            if (pendSec) pendSec.style.display = '';
        } else if (tabName === 'groups') {
            if (groupsSec) groupsSec.style.display = '';
            if (contactsSec) contactsSec.style.display = 'none';
            if (reqSec) reqSec.style.display = 'none';
            if (pendSec) pendSec.style.display = 'none';
        } else if (tabName === 'contacts') {
            if (groupsSec) groupsSec.style.display = 'none';
            if (contactsSec) contactsSec.style.display = '';
            if (reqSec) reqSec.style.display = '';
            if (pendSec) pendSec.style.display = '';
        }
    };

    let filterTimeout = null;
    window.filterSidebarContent = function(query) {
        if (filterTimeout) clearTimeout(filterTimeout);
        filterTimeout = setTimeout(() => {
            const q = (query || '').toLowerCase().trim();
            const contactItems = document.querySelectorAll('#contacts-list > div');
            contactItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(q) ? '' : 'none';
            });

            const groupItems = document.querySelectorAll('#groups-list > div');
            groupItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(q) ? '' : 'none';
            });
        }, 150);
    };
}

