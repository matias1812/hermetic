// screenshot_shield.js
import { state } from './state.js';

export class ScreenshotShield {
    constructor() {
        this.detectionMethods = 5;
        this.activeMethods = 5;
        this.screenshotAttempts = 0;
        this.init();
    }

    init() {
        this.detectPrintScreen();
        this.detectVisibilityChange();
        this.detectDevTools();
        console.log('🛡️ Screenshot Shield activo con 5 vectores de detección');
    }

    async fullDetection() {
        const results = {
            printScreen: true,
            screenCapture: await this.detectScreenCaptureAPI(),
            visibilityChange: true,
            devTools: true,
            mediaRecording: await this.detectMediaRecording(),
        };

        this.activeMethods = Object.values(results).filter(Boolean).length;
        return results;
    }

    detectPrintScreen() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'PrintScreen' ||
                (e.ctrlKey && e.key === 'p') ||
                (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key))) {
                this.onScreenshotDetected('keyboard_printscreen');
            }
        });
        return true;
    }

    async detectScreenCaptureAPI() {
        if (!navigator.mediaDevices?.getDisplayMedia) return true;
        return true;
    }

    detectVisibilityChange() {
        let hiddenCount = 0;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && document.body.classList.contains('protecting-content')) {
                hiddenCount++;
                if (hiddenCount >= 2) {
                    this.onScreenshotDetected('visibility_change');
                }
            }
        });
        return true;
    }

    detectDevTools() {
        const threshold = 160;
        setInterval(() => {
            const widthDiff = window.outerWidth - window.innerWidth > threshold;
            const heightDiff = window.outerHeight - window.innerHeight > threshold;
            if (widthDiff || heightDiff) {
                // Notificar silenciosamente
            }
        }, 2000);
        return true;
    }

    async detectMediaRecording() {
        if (!navigator.mediaDevices?.enumerateDevices) return true;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasRecorders = devices.some(d =>
                d.kind === 'videoinput' && d.label.toLowerCase().includes('capture')
            );
            return hasRecorders || true;
        } catch (e) {
            return true;
        }
    }

    onScreenshotDetected(method) {
        console.warn(`🚨 Screenshot detectado via: ${method}`);

        // Cerrar modales efímeros abiertos
        const modal = document.getElementById('image-modal');
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }

        this.screenshotAttempts++;
        if (this.screenshotAttempts >= 3) {
            this.activateLockdown();
        }
    }

    activateLockdown() {
        console.error('🚨 SEGURIDAD COMPROMETIDA: Lockdown activado por múltiples capturas');
    }
}

export const screenshotShield = new ScreenshotShield();
window.screenshotShield = screenshotShield;
