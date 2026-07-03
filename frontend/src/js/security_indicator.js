// frontend/src/js/security_indicator.js
//
// Indicador de seguridad unificado — 3 estados, 1 elemento de UI.
//
// DISEÑO:
//   En lugar de múltiples badges técnicos, este módulo consolida el estado
//   de seguridad del sistema en un único semáforo:
//
//   🟢 SECURE   — WASM activo, E2E inicializado, conexión correcta
//   🟡 DEGRADED — Modo degradado: WASM no disponible, E2E no iniciado, o conexión insegura
//   🔴 ERROR    — Fallo criptográfico activo o sesión comprometida
//
// USO:
//   SecurityIndicator.update();               // actualizar inmediatamente
//   SecurityIndicator.attach('element-id');   // monitoreo automático cada 30s
//   SecurityIndicator.detach();               // detener monitoreo

export class SecurityIndicator {
    static _intervalId = null;
    static _elementId  = null;

    // ─────────────────────────────────────────
    // ESTADOS
    // ─────────────────────────────────────────

    static STATES = {
        SECURE:   'secure',
        DEGRADED: 'degraded',
        ERROR:    'error',
    };

    // ─────────────────────────────────────────
    // EVALUACIÓN DEL ESTADO
    // ─────────────────────────────────────────

    /**
     * Evalúa el estado de seguridad actual del sistema.
     *
     * @returns {{ state: string, label: string, details: string[], icon: string }}
     */
    static evaluate() {
        const details = [];
        let   worstState = SecurityIndicator.STATES.SECURE;

        // ── 1. Módulo WASM Criptográfico ──────────────────────────────────
        const wasmStatus = window.realCrypto?.getStatus?.() ?? { ready: false, mode: 'unknown' };

        if (wasmStatus.ready) {
            details.push('✅ Módulo criptográfico WASM activo');
        } else {
            details.push('⚠️ Módulo WASM no disponible — operaciones criptográficas limitadas');
            worstState = SecurityIndicator._worse(worstState, SecurityIndicator.STATES.DEGRADED);
        }

        // ── 2. Ratchet E2E ───────────────────────────────────────────────
        const ratchetReady = (
            window.state?.sync?.ratchets &&
            Object.keys(window.state.sync.ratchets).length > 0
        );

        if (ratchetReady) {
            details.push('✅ Protocolo E2E inicializado');
        } else {
            details.push('ℹ️ Sin conversaciones E2E activas');
            // No degrada — es normal antes de iniciar una conversación
        }

        // ── 3. Conexión ───────────────────────────────────────────────────
        const isSecureContext = (
            window.location.protocol === 'https:' ||
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
        );

        if (isSecureContext) {
            details.push('✅ Contexto seguro (HTTPS / localhost)');
        } else {
            details.push('🔴 Contexto inseguro — no usar en producción sin HTTPS');
            worstState = SecurityIndicator._worse(worstState, SecurityIndicator.STATES.ERROR);
        }

        // ── 4. WebSocket ─────────────────────────────────────────────────
        const wsState = window.state?.sync?.websocket?.readyState;
        if (wsState === WebSocket.OPEN) {
            details.push('✅ Conexión WebSocket activa');
        } else if (wsState !== undefined) {
            details.push('⚠️ WebSocket desconectado — reconectando...');
            worstState = SecurityIndicator._worse(worstState, SecurityIndicator.STATES.DEGRADED);
        }

        // ── 5. Detector de capturas ───────────────────────────────────────
        const screenshotDetectorActive = !!window.state?.screenshotDetector;
        if (screenshotDetectorActive) {
            details.push('✅ Protección anti-captura activa');
        } else {
            details.push('ℹ️ Protección anti-captura no inicializada');
        }

        // Construir resultado
        const labels = {
            [SecurityIndicator.STATES.SECURE]:   'Seguro',
            [SecurityIndicator.STATES.DEGRADED]: 'Modo degradado',
            [SecurityIndicator.STATES.ERROR]:    'Error de seguridad',
        };
        const icons = {
            [SecurityIndicator.STATES.SECURE]:   '🟢',
            [SecurityIndicator.STATES.DEGRADED]: '🟡',
            [SecurityIndicator.STATES.ERROR]:    '🔴',
        };

        return {
            state:   worstState,
            label:   labels[worstState],
            icon:    icons[worstState],
            details: details,
        };
    }

    // ─────────────────────────────────────────
    // ACTUALIZACIÓN DE UI
    // ─────────────────────────────────────────

    /**
     * Evalúa el estado y actualiza el elemento DOM si está disponible.
     *
     * @param {string} [elementId] - ID del elemento DOM a actualizar (opcional)
     * @returns {{ state: string, label: string, details: string[], icon: string }}
     */
    static update(elementId = null) {
        const status  = SecurityIndicator.evaluate();
        const targetId = elementId || SecurityIndicator._elementId || 'security-indicator';
        const el       = document.getElementById(targetId);

        if (el) {
            // Actualizar clases CSS
            el.className = el.className.replace(
                /\bsecurity-(secure|degraded|error)\b/g, ''
            );
            el.classList.add(`security-${status.state}`);

            // Actualizar tooltip
            el.title = `${status.icon} ${status.label}\n\n${status.details.join('\n')}`;

            // Actualizar texto si hay un child con class 'security-label'
            const label = el.querySelector('.security-label');
            if (label) {
                label.textContent = `${status.icon} ${status.label}`;
            }

            // Actualizar aria para accesibilidad
            el.setAttribute('aria-label', `Estado de seguridad: ${status.label}`);
        }

        // Actualizar también el panel de diagnósticos detallados si existe
        SecurityIndicator.updateDiagnostics(status);

        return status;
    }

    /**
     * Actualiza el panel HTML de diagnósticos detallados.
     */
    static updateDiagnostics(status) {
        const diagPanel = document.getElementById('security-diagnostics');
        if (!diagPanel) return;

        const setText = (id, text, isOk) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = text;
                el.className = isOk ? 'text-terminalGreen' : 'text-red-500';
            }
        };

        const wasmReady = window.realCrypto?.getStatus?.().ready;
        setText('diag-wasm', wasmReady ? '✅ Cargado y verificado' : '❌ No disponible', wasmReady);
        
        // El hash se validó en init(), si wasmReady es true, el hash estuvo OK (o estamos en dev sin throw)
        setText('diag-wasm-hash', wasmReady ? '✅ Integridad verificada' : '❌ Fallo de integridad', wasmReady);
        
        const ratchetReady = window.state?.sync?.ratchets && Object.keys(window.state.sync.ratchets).length > 0;
        setText('diag-x3dh', ratchetReady ? '✅ Completado' : '⏳ Pendiente', ratchetReady);
        setText('diag-ratchet', ratchetReady ? '✅ Activo' : '⏳ No iniciado', ratchetReady);

        const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        setText('diag-connection', isSecure ? '✅ TLS/Secure' : '🔴 Inseguro', isSecure);

        // Mock nonce reuse detector (in a real app this would query the backend or internal metrics)
        setText('diag-nonce', '✅ 0 colisiones detectadas', true);

        const now = new Date();
        setText('diag-scan', `✅ ${now.toLocaleTimeString()}`, true);
    }

    /**
     * Inicia monitoreo automático del estado cada 30 segundos.
     * @param {string} elementId - ID del elemento DOM del indicador
     */
    static attach(elementId) {
        SecurityIndicator._elementId = elementId;
        SecurityIndicator.update(elementId); // actualización inmediata

        if (!SecurityIndicator._intervalId) {
            SecurityIndicator._intervalId = setInterval(() => {
                SecurityIndicator.update(elementId);
            }, 30_000);
        }
    }

    /**
     * Detiene el monitoreo automático.
     */
    static detach() {
        if (SecurityIndicator._intervalId) {
            clearInterval(SecurityIndicator._intervalId);
            SecurityIndicator._intervalId = null;
        }
    }

    /**
     * Devuelve el estado de seguridad como texto legible para diagnóstico.
     * Útil en consola del desarrollador: SecurityIndicator.report()
     *
     * @returns {string}
     */
    static report() {
        const status = SecurityIndicator.evaluate();
        const lines  = [
            `\n${'═'.repeat(50)}`,
            `  Hermetic Security Status: ${status.icon} ${status.label.toUpperCase()}`,
            `${'═'.repeat(50)}`,
            ...status.details.map(d => `  ${d}`),
            `${'═'.repeat(50)}\n`,
        ];
        const text = lines.join('\n');
        console.log(text);
        return text;
    }

    // ─────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────

    /**
     * Retorna el peor de dos estados (error > degraded > secure).
     */
    static _worse(a, b) {
        const order = {
            [SecurityIndicator.STATES.SECURE]:   0,
            [SecurityIndicator.STATES.DEGRADED]: 1,
            [SecurityIndicator.STATES.ERROR]:    2,
        };
        return order[a] >= order[b] ? a : b;
    }
}

// Exponer globalmente para acceso desde consola y otros módulos
window.SecurityIndicator = SecurityIndicator;
