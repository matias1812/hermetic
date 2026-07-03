// screenshot_detector.js
// Detección best-effort de intentos de captura de pantalla.
//
// LIMITACIONES (inherentes a la web):
//   - No existe API nativa para PREVENIR capturas de pantalla en el navegador.
//   - Los métodos implementados son de DETECCIÓN, no de prevención.
//   - Los navegadores modernos restringen el acceso a getDisplayMedia sin interacción.
//
// MÉTODOS DE DETECCIÓN:
//   1. Teclas de atajo conocidas (PrintScreen, Cmd+Shift+3/4/5, Win+PrtSc)
//   2. Visibility API (pestaña oculta → posible captura o cambio de ventana)

// NOTA: NO importamos de state.js para evitar importación circular.
// showToast se inyecta globalmente desde auth_ui.js tras el login.
function _toast(msg, isError = true) {
    if (typeof window._hermesShowToast === 'function') {
        window._hermesShowToast(msg, isError);
    } else {
        console.warn('[ScreenshotDetector]', msg);
    }
}

export class ScreenshotDetector {
    /**
     * @param {Function} onAttempt  Callback (method: string) invocado al detectar intento.
     */
    constructor(onAttempt) {
        this.isViewingEphemeral = false;
        this.currentImageId     = null;
        this.onAttempt          = onAttempt || (() => {});
        this._keydownHandler    = null;
        this._visibilityHandler = null;
        this._active            = false;
    }

    /** Iniciar detección global. Debe llamarse una vez tras el login. */
    startDetection() {
        if (this._active) return;
        this._active = true;

        // ── Método 1: Teclas de atajo ──────────────────────────────────
        this._keydownHandler = (e) => {
            if (!this.isViewingEphemeral) return;

            const isScreenshot =
                e.key === 'PrintScreen' ||
                (e.ctrlKey  && e.key === 'PrintScreen') ||
                (e.metaKey  && e.shiftKey && ['3', '4', '5', 's', 'S'].includes(e.key)) ||
                (e.ctrlKey  && e.shiftKey && e.key === 'S') ||  // Windows Snipping Tool shortcut
                (e.metaKey  && e.ctrlKey  && e.shiftKey && ['3', '4'].includes(e.key));

            if (isScreenshot) {
                e.preventDefault();   // Bloquear la acción (no siempre funciona)
                this._onAttemptDetected('keyboard_shortcut');
            }
        };
        document.addEventListener('keydown', this._keydownHandler, true);

        // ── Método 2: Visibility API ───────────────────────────────────
        // Si la pestaña queda oculta mientras se ve una imagen efímera,
        // puede indicar un Alt-Tab para capturar o un screenshot del SO.
        this._visibilityHandler = () => {
            if (document.hidden && this.isViewingEphemeral) {
                this._onAttemptDetected('tab_hidden');
            }
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);
    }

    /** Detener detección (uso en logout / wipe). */
    stopDetection() {
        if (!this._active) return;
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler, true);
            this._keydownHandler = null;
        }
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
        this._active = false;
        this.disableProtection();
    }

    /** Activar protección para una imagen efímera específica. */
    enableProtection(imageId) {
        this.isViewingEphemeral = true;
        this.currentImageId     = imageId;
        document.body.classList.add('ephemeral-protected');
    }

    /** Desactivar protección. */
    disableProtection() {
        this.isViewingEphemeral = false;
        this.currentImageId     = null;
        document.body.classList.remove('ephemeral-protected');
    }

    // ─────────────────────────────────────────
    // PRIVADO
    // ─────────────────────────────────────────

    _onAttemptDetected(method) {
        console.warn(`[ScreenshotDetector] Intento detectado: ${method}`);

        // Desactivar protección (cerramos la imagen efímera)
        const imageId = this.currentImageId;
        this.disableProtection();

        // Notificar al callback (lo que haga con el visor/chat es responsabilidad del caller)
        this.onAttempt(method, imageId);

        // Toast de advertencia local
        _toast(`⚠️ Captura detectada (${method}). Imagen efímera cerrada.`, true);
    }
}
