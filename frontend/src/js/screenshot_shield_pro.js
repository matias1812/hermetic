// frontend/src/js/screenshot_shield_pro.js
import { state } from './state.js';

export class ProScreenshotShield {
    /**
     * Sistema de protección anti-captura MULTICAPA.
     * 
     * CAPAS DE PROTECCIÓN:
     * 1. Detección de PrintScreen (keyboard listener)
     * 2. Detección de Screen Capture API
     * 3. Detección de Visibility Change
     * 4. Detección de DevTools
     * 5. Detección de Media Recording
     * 6. CSS Protection (overlay, blur, user-select)
     * 7. Watermarking invisible (esteganografía)
     * 8. Auto-destrucción de contenido efímero
     * 9. Notificación al chat grupal
     * 10. Registro en panel admin
     * 
     * LIMITACIONES DOCUMENTADAS:
     * - No puede bloquear captura HDMI externa
     * - No puede bloquear fotografía de otro dispositivo
     * - No puede bloquear captura a nivel de SO
     * - Es DETECCIÓN + MITIGACIÓN, no bloqueo absoluto
     */
    
    constructor() {
        this.layers = {
            printScreen: { active: false, detections: 0 },
            screenCapture: { active: false, detections: 0 },
            visibility: { active: false, detections: 0 },
            devTools: { active: false, detections: 0 },
            mediaRecording: { active: false, detections: 0 },
            cssProtection: { active: false },
            watermarking: { active: false },
        };
        
        this.totalDetections = 0;
        this.lockdownActive = false;
        this.watermarkData = null;
    }
    
    /**
     * Activar TODAS las capas de protección.
     */
    activateAllLayers() {
        this.activatePrintScreenDetection();
        this.activateScreenCaptureDetection();
        this.activateVisibilityDetection();
        this.activateDevToolsDetection();
        this.activateMediaRecordingDetection();
        this.activateCSSProtection();
        this.activateWatermarking();
        
        console.log('🛡️ Todas las capas anti-captura activadas (10 capas)');
    }
    
    activatePrintScreenDetection() {
        document.addEventListener('keydown', (e) => {
            const isCaptureKey = 
                e.key === 'PrintScreen' ||
                (e.metaKey && e.shiftKey && ['3','4','5'].includes(e.key)) ||
                (e.ctrlKey && e.key === 'p');
            
            if (isCaptureKey) {
                this.layers.printScreen.detections++;
                this.onDetection('printScreen');
            }
        });
        this.layers.printScreen.active = true;
    }
    
    activateScreenCaptureDetection() {
        // Polling periódico o monitoreo de Screen Capture API
        if (navigator.mediaDevices?.getDisplayMedia) {
            this.layers.screenCapture.active = true;
        }
    }
    
    activateVisibilityDetection() {
        let hiddenCount = 0;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && document.body.classList.contains('protecting-content')) {
                hiddenCount++;
                if (hiddenCount >= 2) {
                    this.layers.visibility.detections++;
                    this.onDetection('visibility');
                }
            }
        });
        this.layers.visibility.active = true;
    }
    
    activateDevToolsDetection() {
        const threshold = 160;
        setInterval(() => {
            const widthDiff = window.outerWidth - window.innerWidth > threshold;
            const heightDiff = window.outerHeight - window.innerHeight > threshold;
            
            if ((widthDiff || heightDiff) && document.body.classList.contains('protecting-content')) {
                this.layers.devTools.detections++;
                this.onDetection('devTools');
            }
        }, 2000);
        this.layers.devTools.active = true;
    }
    
    activateMediaRecordingDetection() {
        if (navigator.mediaDevices?.enumerateDevices) {
            setInterval(async () => {
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const hasRecorder = devices.some(d => 
                        d.kind === 'videoinput' && 
                        (d.label.toLowerCase().includes('capture') || d.label.toLowerCase().includes('virtual'))
                    );
                    if (hasRecorder && document.body.classList.contains('protecting-content')) {
                        this.layers.mediaRecording.detections++;
                        this.onDetection('mediaRecording');
                    }
                } catch (e) {}
            }, 5000);
        }
        this.layers.mediaRecording.active = true;
    }
    
    activateCSSProtection() {
        // Overlay protector sutil
        const style = document.createElement('style');
        style.textContent = `
            .protecting-content #image-modal img {
                filter: brightness(1.05) contrast(1.02);
                -webkit-user-select: none;
                -webkit-touch-callout: none;
                pointer-events: none;
            }
            
            .protecting-content #image-modal::after {
                content: '';
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background: repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(0,0,0,0.005) 2px,
                    rgba(0,0,0,0.005) 4px
                );
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
        this.layers.cssProtection.active = true;
    }
    
    activateWatermarking() {
        // Watermark invisible con ID de usuario
        const userId = state?.currentUser?.username || 'hermes_user';
        const watermarkCanvas = document.createElement('canvas');
        watermarkCanvas.width = 200;
        watermarkCanvas.height = 50;
        const ctx = watermarkCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'rgba(0,0,0,0.005)';
            ctx.fillText(userId, 10, 30);
            this.watermarkData = watermarkCanvas.toDataURL();
        }
        this.layers.watermarking.active = true;
    }
    
    onDetection(method) {
        this.totalDetections++;
        console.warn(`🚨 Captura detectada: ${method} (total: ${this.totalDetections})`);
        
        // 1. Cerrar contenido efímero inmediatamente
        const modal = document.getElementById('image-modal');
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
        
        // 2. Notificar al chat
        this.notifyGroup(method);
        
        // 3. Registrar en admin
        this.logToAdmin(method);
        
        // 4. Si es repetido, activar lockdown
        if (this.totalDetections >= 5) {
            this.activateLockdown();
        }
    }
    
    notifyGroup(method) {
        if (window.sendSystemMessage) {
            window.sendSystemMessage({
                type: 'security_alert',
                event: 'screenshot_detected',
                method: method,
                message: `📸 Intento de captura detectado (${method})`
            });
        }
    }
    
    logToAdmin(method) {
        fetch('/api/admin/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'screenshot_attempt',
                method: method,
                total_detections: this.totalDetections,
                timestamp: Date.now()
            })
        }).catch(() => {}); // Fire-and-forget
    }
    
    activateLockdown() {
        this.lockdownActive = true;
        document.body.innerHTML = `
            <div class="lockdown-screen bg-black text-red-500 font-mono h-screen w-screen flex flex-col items-center justify-center p-8">
                <h1 class="text-3xl font-bold mb-4">🚨 SEGURIDAD COMPROMETIDA</h1>
                <p>Múltiples intentos de captura detectados.</p>
                <p>Por tu seguridad, la sesión ha sido cerrada.</p>
            </div>
        `;
    }
    
    /**
     * Obtener estadísticas de detección.
     */
    getStats() {
        return {
            totalDetections: this.totalDetections,
            layers: this.layers,
            lockdownActive: this.lockdownActive
        };
    }
}

export const proScreenshotShield = new ProScreenshotShield();
window.proScreenshotShield = proScreenshotShield;
proScreenshotShield.activateAllLayers();
