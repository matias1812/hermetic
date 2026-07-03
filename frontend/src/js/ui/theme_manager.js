export class HermesThemeManager {
    constructor() {
        this.currentUserId = null;
        this.ledColor = '#00ff66';
        this.matrixBg = true;
        this.transparency = 55;
        this.canvas = null;
        this.ctx = null;
        this.animFrame = null;
        
        this.init();
    }

    init() {
        // Al arrancar en la pantalla de login/signup, aplicamos el tema de la landing page
        this.applyLedColor('#00ff66', 55);
        this.setupMatrixCanvas();
        this.startMatrix();
    }

    onLogin(userId) {
        this.currentUserId = userId || (typeof userId === 'string' ? userId : userId?.alias) || 'default';
        this.ledColor = localStorage.getItem('hermes_led_color_' + this.currentUserId) || '#00ff66';
        this.matrixBg = localStorage.getItem('hermes_matrix_bg_' + this.currentUserId) === 'true';
        this.transparency = parseInt(localStorage.getItem('hermes_transparency_' + this.currentUserId) || '55', 10);

        this.applyLedColor(this.ledColor, this.transparency);
        if (this.matrixBg) {
            this.startMatrix();
        } else {
            this.stopMatrix();
        }
        this.updateUI();
    }

    onLogout() {
        this.currentUserId = null;
        this.ledColor = '#00ff66';
        this.matrixBg = true;
        this.transparency = 55;
        this.applyLedColor('#00ff66', 55);
        this.startMatrix();
    }

    setLedColor(hex) {
        this.ledColor = hex;
        if (this.currentUserId) {
            localStorage.setItem('hermes_led_color_' + this.currentUserId, hex);
        }
        this.applyLedColor(hex, this.transparency);
        if (this.customColorInput) {
            this.customColorInput.value = hex;
        }
    }

    setTransparency(val) {
        this.transparency = parseInt(val, 10);
        if (this.currentUserId) {
            localStorage.setItem('hermes_transparency_' + this.currentUserId, val);
        }
        const disp = document.getElementById('transparency-val-display');
        if (disp) disp.textContent = `${val}%`;
        this.applyLedColor(this.ledColor, this.transparency);
    }

    hexToRgb(hex) {
        let c = (hex || '#00ff66').replace('#', '');
        if (c.length === 3) {
            c = c[0]+c[0] + c[1]+c[1] + c[2]+c[2];
        }
        const num = parseInt(c, 16);
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
    }

    applyLedColor(hex, alphaPercent = 55) {
        let styleEl = document.getElementById('hermes-led-override');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'hermes-led-override';
            document.head.appendChild(styleEl);
        }

        const { r, g, b } = this.hexToRgb(hex);
        const alpha = (100 - alphaPercent) / 100; // Si transparencia es 55%, opacidad es 0.45

        styleEl.innerHTML = `
            :root {
                --led-color: ${hex} !important;
                --led-rgb: ${r}, ${g}, ${b} !important;
            }
            .text-terminalGreen { color: ${hex} !important; }
            .border-terminalGreen { border-color: ${hex} !important; }
            .border-terminalGreen\\/30 { border-color: rgba(${r}, ${g}, ${b}, 0.3) !important; }
            .border-terminalGreen\\/40 { border-color: rgba(${r}, ${g}, ${b}, 0.4) !important; }
            .border-terminalGreen\\/50 { border-color: rgba(${r}, ${g}, ${b}, 0.5) !important; }
            .border-terminalGreen\\/60 { border-color: rgba(${r}, ${g}, ${b}, 0.6) !important; }
            .bg-terminalGreen { background-color: ${hex} !important; }
            .bg-terminalGreen\\/10 { background-color: rgba(${r}, ${g}, ${b}, 0.1) !important; }
            .bg-terminalGreen\\/20 { background-color: rgba(${r}, ${g}, ${b}, 0.2) !important; }
            .accent-terminalGreen { accent-color: ${hex} !important; }
            .shadow-terminalGreen { box-shadow: 0 0 15px ${hex} !important; }
            
            /* Animación y Luz Neón de Fondo y Marcos Levitantes */
            @keyframes smoothLevitationCustom {
                0% { transform: translateY(0px); box-shadow: 0 0 35px rgba(${r}, ${g}, ${b}, 0.4), 0 10px 40px rgba(0, 0, 0, 0.95); border-color: rgba(${r}, ${g}, ${b}, 0.5); }
                50% { transform: translateY(-5px); box-shadow: 0 0 65px rgba(${r}, ${g}, ${b}, 0.85), 0 20px 55px rgba(0, 0, 0, 0.98); border-color: rgba(${r}, ${g}, ${b}, 0.95); }
                100% { transform: translateY(0px); box-shadow: 0 0 35px rgba(${r}, ${g}, ${b}, 0.4), 0 10px 40px rgba(0, 0, 0, 0.95); border-color: rgba(${r}, ${g}, ${b}, 0.5); }
            }
            
            .led-levitating-container, #view-chat, #header-contenedor {
                animation: smoothLevitationCustom 5s ease-in-out infinite !important;
                border-color: rgba(${r}, ${g}, ${b}, 0.7) !important;
                box-shadow: 0 0 45px rgba(${r}, ${g}, ${b}, 0.55) !important;
            }

            /* Nivel de Transparencia Configurable para los Paneles de la App */
            #view-chat {
                background-color: rgba(4, 5, 10, ${Math.max(0.15, alpha)}) !important;
                backdrop-filter: blur(6px) !important;
            }
            #sidebar-panel {
                background-color: rgba(12, 14, 22, ${Math.min(0.85, alpha + 0.1)}) !important;
            }
            #chat-panel, #chat-messages {
                background-color: transparent !important;
            }
            #sidebar-panel > div:first-child, #chat-panel header, #chat-footer {
                background-color: rgba(10, 11, 16, ${Math.max(0.25, alpha)}) !important;
                border-color: rgba(${r}, ${g}, ${b}, 0.35) !important;
            }
            .msg-bubble-self {
                background-color: rgba(6, 16, 10, ${Math.min(0.95, Math.max(0.75, alpha + 0.35))}) !important;
                border-color: rgba(${r}, ${g}, ${b}, 0.6) !important;
                box-shadow: 0 0 15px rgba(${r}, ${g}, ${b}, 0.2) !important;
            }
            .msg-bubble-other {
                background-color: rgba(14, 16, 22, ${Math.min(0.95, Math.max(0.80, alpha + 0.40))}) !important;
                border-color: rgba(180, 190, 210, 0.35) !important;
            }

            /* Transparencia dinámica y LED NEÓN en los paneles modales (Configuración, Perfil, etc.) */
            #settings-modal > div, .auth-view {
                background-color: rgba(8, 10, 16, ${Math.max(0.35, alpha)}) !important;
                border-color: ${hex} !important;
                box-shadow: 0 0 45px rgba(${r}, ${g}, ${b}, 0.45), inset 0 0 15px rgba(${r}, ${g}, ${b}, 0.15) !important;
            }
            #settings-modal > div > div:first-child {
                border-bottom-color: rgba(${r}, ${g}, ${b}, 0.4) !important;
            }
            #btn-close-settings-modal:hover {
                border-color: ${hex} !important;
                color: ${hex} !important;
                box-shadow: 0 0 12px rgba(${r}, ${g}, ${b}, 0.5) !important;
            }

            /* Sincronizar todos los componentes y elementos de la app con el color seleccionado */
            .encryption-indicator, #mk-btn-text, #btn-save-alias, #btn-add-contact {
                color: ${hex} !important;
                border-color: rgba(${r}, ${g}, ${b}, 0.4) !important;
            }

            /* Scrollbar LED adaptado */
            ::-webkit-scrollbar-thumb {
                background: rgba(${r}, ${g}, ${b}, 0.45) !important;
                box-shadow: 0 0 8px rgba(${r}, ${g}, ${b}, 0.6) !important;
            }
            ::-webkit-scrollbar-thumb:hover {
                background: rgba(${r}, ${g}, ${b}, 0.85) !important;
            }

            /* Selección de texto */
            *::selection {
                background-color: ${hex} !important;
                color: #000000 !important;
            }
        `;
    }

    toggleMatrixBg(enabled) {
        this.matrixBg = enabled;
        if (this.currentUserId) {
            localStorage.setItem('hermes_matrix_bg_' + this.currentUserId, enabled ? 'true' : 'false');
        }
        if (enabled) {
            this.startMatrix();
        } else {
            this.stopMatrix();
        }
    }

    setupMatrixCanvas() {
        this.canvas = document.getElementById('matrix-app-bg');
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'matrix-app-bg';
            this.canvas.className = 'fixed inset-0 pointer-events-none z-[-1] transition-opacity duration-700 opacity-0';
            document.body.prepend(this.canvas);
        }
        this.ctx = this.canvas.getContext('2d');
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
    }

    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.cols = Math.floor(this.canvas.width / 16);
        this.drops = [];
        for (let i = 0; i < this.cols; i++) {
            this.drops[i] = Math.random() * -100;
        }
    }

    startMatrix() {
        if (!this.canvas) this.setupMatrixCanvas();
        this.canvas.style.opacity = '0.65';
        this.matrixBg = true;
        const checkbox = document.getElementById('toggle-matrix-bg');
        if (checkbox) checkbox.checked = true;

        if (this.animFrame) cancelAnimationFrame(this.animFrame);

        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコサシスセソタチツテトナニヌネノ◊⚡🛡️§¶∇∆';
        const draw = () => {
            if (!this.matrixBg) return;
            this.ctx.fillStyle = 'rgba(4, 5, 10, 0.12)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.font = '15px "Courier New", monospace';
            for (let i = 0; i < this.drops.length; i++) {
                const char = chars[Math.floor(Math.random() * chars.length)];
                
                this.ctx.fillStyle = '#ffffff';
                this.ctx.shadowBlur = 8;
                this.ctx.shadowColor = this.ledColor;
                this.ctx.fillText(char, i * 16, this.drops[i] * 16);

                this.ctx.fillStyle = this.ledColor;
                this.ctx.shadowBlur = 0;
                this.ctx.fillText(char, i * 16, (this.drops[i] - 1) * 16);

                if (this.drops[i] * 16 > this.canvas.height && Math.random() > 0.975) {
                    this.drops[i] = 0;
                }
                this.drops[i] += 0.85 + Math.random() * 0.3;
            }
            this.animFrame = requestAnimationFrame(draw);
        };
        draw();
    }

    stopMatrix() {
        this.matrixBg = false;
        if (this.canvas) {
            this.canvas.style.opacity = '0';
        }
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame);
            this.animFrame = null;
        }
        const checkbox = document.getElementById('toggle-matrix-bg');
        if (checkbox) checkbox.checked = false;
    }

    updateUI() {
        const checkbox = document.getElementById('toggle-matrix-bg');
        if (checkbox) checkbox.checked = this.matrixBg;
        
        const slider = document.getElementById('app-transparency-slider');
        if (slider) slider.value = this.transparency;

        const disp = document.getElementById('transparency-val-display');
        if (disp) disp.textContent = `${this.transparency}%`;

        this.customColorInput = document.getElementById('custom-led-color');
        if (this.customColorInput) {
            this.customColorInput.value = this.ledColor;
        }
    }
}

export const hermesTheme = new HermesThemeManager();
window.hermesTheme = hermesTheme;
