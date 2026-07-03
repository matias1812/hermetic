// frontend/src/js/ui/hermes_notifications.js
import { state } from '../state.js';
import { DOMSanitizer } from './dom_sanitizer.js';

/**
 * HermesNotifications - Sistema de notificaciones in-app premium
 * con estética cyberpunk, efecto LED parpadeante y levitación.
 */
export class HermesNotifications {
    constructor() {
        this.enabled = this._loadEnabled();
        this.container = null;
        this.queue = [];
        this.maxVisible = 3;
        this.originalTitle = document.title || "Hermetic";
        this.blinkInterval = null;

        window.addEventListener('focus', () => this.stopTitleBlink());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.stopTitleBlink();
        });

        if (this.enabled && "Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        this._ensureContainer();
        this._injectStyles();
    }

    _loadEnabled() {
        try {
            return localStorage.getItem('hermes_custom_notifications') === 'true';
        } catch { return false; }
    }

    setEnabled(val) {
        this.enabled = val;
        localStorage.setItem('hermes_custom_notifications', String(val));
        if (val && "Notification" in window) {
            if (Notification.permission !== "granted") {
                Notification.requestPermission().then(perm => {
                    if (perm === "granted") {
                        try { new Notification("🜁 HERMES: Notificaciones Activas", { body: "Ahora recibirás alertas fuera del navegador.", icon: "/favicon.ico" }); } catch(e){}
                    }
                });
            } else {
                try { new Notification("🜁 HERMES: Notificaciones Activas", { body: "Alertas de escritorio habilitadas.", icon: "/favicon.ico" }); } catch(e){}
            }
        }
    }

    startTitleBlink(senderName) {
        if (!this.originalTitle) {
            this.originalTitle = document.title || "Hermetic";
        }
        if (this.blinkInterval) return;
        
        let showAlert = true;
        this.blinkInterval = setInterval(() => {
            document.title = showAlert ? `⚡ ¡Nuevo mensaje de @${senderName}!` : `🜁 Hermetic — Mensaje Cifrado`;
            showAlert = !showAlert;
        }, 1000);
    }

    stopTitleBlink() {
        if (this.blinkInterval) {
            clearInterval(this.blinkInterval);
            this.blinkInterval = null;
        }
        if (this.originalTitle) {
            document.title = this.originalTitle;
        }
    }

    _ensureContainer() {
        if (document.getElementById('hermes-notif-container')) {
            this.container = document.getElementById('hermes-notif-container');
            return;
        }
        const c = document.createElement('div');
        c.id = 'hermes-notif-container';
        c.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:340px;width:100%;';
        document.body.appendChild(c);
        this.container = c;
    }

    _injectStyles() {
        if (document.getElementById('hermes-notif-styles')) return;
        const style = document.createElement('style');
        style.id = 'hermes-notif-styles';
        style.textContent = `
            @keyframes hermes-notif-fadeIn {
                from { opacity: 0; transform: translateX(80px) translateY(-10px); }
                to   { opacity: 1; transform: translateX(0) translateY(0); }
            }
            @keyframes hermes-notif-fadeOut {
                from { opacity: 1; transform: translateX(0) scale(1); }
                to   { opacity: 0; transform: translateX(100px) scale(0.95); }
            }
            @keyframes hermes-notif-levitate {
                0%, 100% { transform: translateY(0px); }
                50%      { transform: translateY(-4px); }
            }
            @keyframes hermes-led-pulse {
                0%, 100% { box-shadow: 0 0 4px rgba(0,255,102,0.3), inset 0 0 2px rgba(0,255,102,0.1); border-color: rgba(0,255,102,0.3); }
                50%      { box-shadow: 0 0 14px rgba(0,255,102,0.8), 0 0 28px rgba(0,255,102,0.3), inset 0 0 6px rgba(0,255,102,0.2); border-color: rgba(0,255,102,0.9); }
            }
            .hermes-notif {
                pointer-events: auto;
                animation: hermes-notif-fadeIn 0.45s cubic-bezier(0.16,1,0.3,1) forwards,
                           hermes-notif-levitate 3s ease-in-out 0.5s infinite;
                background: linear-gradient(135deg, rgba(15,16,23,0.97) 0%, rgba(20,22,30,0.95) 100%);
                border: 1.5px solid rgba(0,255,102,0.3);
                border-radius: 12px;
                padding: 12px 16px;
                backdrop-filter: blur(16px);
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                animation: hermes-notif-fadeIn 0.45s cubic-bezier(0.16,1,0.3,1) forwards,
                           hermes-notif-levitate 3s ease-in-out 0.5s infinite,
                           hermes-led-pulse 2s ease-in-out infinite;
            }
            .hermes-notif:hover {
                transform: translateY(-2px) scale(1.02);
                box-shadow: 0 0 20px rgba(0,255,102,0.5), 0 8px 24px rgba(0,0,0,0.6);
            }
            .hermes-notif.removing {
                animation: hermes-notif-fadeOut 0.35s ease forwards;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show an in-app notification & browser tab/desktop alert
     * @param {string} senderName - who sent the message
     * @param {string} [preview] - optional short preview text  
     */
    show(senderName, preview = '') {
        // 1. Alerta en cualquier pestaña del navegador (Parpadeo de título + Notificación nativa de escritorio)
        if (document.hidden || this.enabled) {
            this.startTitleBlink(senderName);
        }

        if ("Notification" in window) {
            if (Notification.permission === "granted" && (document.hidden || this.enabled)) {
                try {
                    const n = new Notification(`🜁 Nuevo mensaje de @${senderName}`, {
                        body: preview || 'Has recibido un mensaje cifrado Zero-Knowledge 🔒',
                        icon: '/favicon.ico'
                    });
                    n.onclick = () => {
                        window.focus();
                        n.close();
                    };
                } catch (e) {}
            }
        }

        // 2. Si las notificaciones in-app no están habilitadas, no mostramos el Toast flotante LED
        if (!this.enabled) return;
        this._ensureContainer();

        const notif = document.createElement('div');
        notif.className = 'hermes-notif';
        
        const safeName = DOMSanitizer.escapeHTML(senderName || '?');
        const initial = DOMSanitizer.escapeHTML((senderName || '?').substring(0, 2).toUpperCase());
        
        notif.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#0f1017,#1a1c2a);border:1.5px solid rgba(0,255,102,0.5);display:flex;align-items:center;justify-content:center;color:#00ff66;font-weight:800;font-size:13px;font-family:monospace;flex-shrink:0;box-shadow:0 0 8px rgba(0,255,102,0.3);">${initial}</div>
                <div style="min-width:0;flex-grow:1;">
                    <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#00ff66;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:2px;">@${safeName}</div>
                    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(255,255,255,0.5);letter-spacing:0.3px;">Nuevo mensaje cifrado 🔒</div>
                </div>
                <div style="width:8px;height:8px;border-radius:50%;background:#00ff66;box-shadow:0 0 8px rgba(0,255,102,0.8);flex-shrink:0;animation:hermes-led-pulse 1.5s ease-in-out infinite;"></div>
            </div>
        `;

        // Click to dismiss and open chat
        notif.addEventListener('click', () => {
            this._dismiss(notif);
            this.stopTitleBlink();
            // Try to open the sender's chat
            if (state.contacts?.contacts?.includes(senderName)) {
                state.activeContact = senderName;
                state.activeGroup = null;
                document.dispatchEvent(new CustomEvent('hermes:open_chat', { detail: { contact: senderName } }));
            }
        });

        this.container.appendChild(notif);

        // Auto-dismiss after 5 seconds
        setTimeout(() => this._dismiss(notif), 5000);
    }

    _dismiss(notif) {
        if (!notif || !notif.parentNode) return;
        notif.classList.add('removing');
        setTimeout(() => notif.remove(), 350);
    }
}

export const hermesNotifications = new HermesNotifications();
window.hermesNotifications = hermesNotifications;
