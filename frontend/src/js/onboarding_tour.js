// frontend/src/js/onboarding_tour.js
import { showToast } from './state.js';

export class HermesTour {
    constructor() {
        this.sections = [
            // ── SECTION 1: BIENVENIDA ──
            {
                id: 'welcome',
                section: '🜁 BIENVENIDA',
                title: 'Bienvenido a Hermetic',
                content: `
                    <div class="tour-content">
                        <p class="mb-3 text-sm text-gray-200">Hermetic es un sistema de mensajería <span class="text-cyan-400 font-bold">Zero-Knowledge</span> diseñado para que <strong class="text-white">NADIE</strong> pueda leer tus mensajes ni interceptar tu información.</p>
                        <div class="bg-cyan-950/20 border border-cyan-500/30 rounded p-3 my-3 text-xs leading-relaxed">
                            <h4 class="font-bold text-cyan-300 mb-2">🔒 ¿Qué nos hace impenetrables?</h4>
                            <ul class="space-y-2 text-gray-300">
                                <li class="flex items-start gap-2">
                                    <span class="text-cyan-400 shrink-0">▸</span>
                                    <span><strong class="text-white">Cifrado Post-Cuántico</strong> — Usamos algoritmos ML-KEM-1024 y SPHINCS+ resistentes a ataques cuánticos.</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <span class="text-cyan-400 shrink-0">▸</span>
                                    <span><strong class="text-white">Servidor Ciego</strong> — El servidor solo retransmite bloques cifrados que le es imposible descifrar.</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                `,
                target: null,
                position: 'center'
            },

            // ── SECTION 2: CABECERA Y AGREGAR CONTACTOS ──
            {
                id: 'add_contact',
                section: '👥 CONTACTOS CIFRADOS',
                title: 'Establece Túneles Seguros',
                content: `
                    <div class="tour-content text-xs space-y-3 text-gray-300">
                        <p class="text-sm text-gray-200">Para chatear con alguien, primero debes establecer un <strong class="text-cyan-400">canal Zero-Knowledge E2E</strong>:</p>
                        <div class="space-y-2">
                            <div class="flex items-start gap-2 bg-gray-900/60 rounded p-2 border border-gray-800">
                                <span class="text-cyan-400 font-bold text-sm shrink-0">1.</span>
                                <p>Presiona este icono <strong class="text-white">[ + ]</strong> para abrir el buscador de contactos.</p>
                            </div>
                            <div class="flex items-start gap-2 bg-gray-900/60 rounded p-2 border border-gray-800">
                                <span class="text-cyan-400 font-bold text-sm shrink-0">2.</span>
                                <p>Ingresa el alias exacto de tu contacto e inicia la solicitud de llave criptográfica.</p>
                            </div>
                            <div class="flex items-start gap-2 bg-gray-900/60 rounded p-2 border border-gray-800">
                                <span class="text-cyan-400 font-bold text-sm shrink-0">3.</span>
                                <p>Una vez aceptado, el túnel post-cuántico queda blindado entre ambos.</p>
                            </div>
                        </div>
                    </div>
                `,
                target: '#btn-open-add-modal',
                position: 'bottom'
            },

            // ── SECTION 3: AJUSTES Y BACKUP ──
            {
                id: 'profile_settings',
                section: '⚙️ PERFIL Y SEGURIDAD',
                title: 'Ajustes, Backups y Autodestrucción',
                content: `
                    <div class="tour-content text-xs space-y-3 text-gray-300">
                        <p class="text-sm text-gray-200">Al hacer clic en tu icono de perfil accedes al centro de control:</p>
                        <ul class="space-y-2">
                            <li class="flex items-start gap-2">
                                <span class="text-yellow-400 shrink-0">💾</span>
                                <span><strong class="text-white">Gestión de Backups:</strong> Configura respaldos automáticos o manuales cifrados para no perder tus chats.</span>
                            </li>
                            <li class="flex items-start gap-2">
                                <span class="text-red-400 shrink-0">💥</span>
                                <span><strong class="text-white">Botón de Pánico / Deshabilitar:</strong> Opciones para borrar tu huella digital o cerrar sesión destruyendo llaves en memoria.</span>
                            </li>
                        </ul>
                    </div>
                `,
                target: '#btn-profile',
                position: 'bottom'
            },

            // ── SECTION 4: BOTÓN DEL TOUR ──
            {
                id: 'tour_button',
                section: '❓ GUÍA RÁPIDA',
                title: '¿Dudas en el camino?',
                content: `
                    <div class="tour-content text-xs space-y-2 text-gray-300">
                        <p class="text-sm text-gray-200">Siempre tendrás este botón <strong class="text-cyan-400">[ ? ]</strong> a tu disposición al lado de los ajustes.</p>
                        <p>Si alguna vez necesitas recordar cómo funciona la criptografía, las llaves maestras o las herramientas de mensajería, simplemente presiona aquí y el tour se reactivará al instante.</p>
                    </div>
                `,
                target: '#btn-start-tour',
                position: 'bottom'
            },

            // ── SECTION 5: PESTAÑAS Y GRUPOS ──
            {
                id: 'sidebar_tabs',
                section: '💬 FILTROS Y GRUPOS',
                title: 'Organización y Grupos Privados',
                content: `
                    <div class="tour-content text-xs space-y-2 text-gray-300">
                        <p class="text-sm text-gray-200">Usa estas pestañas para filtrar tus conversaciones entre chats individuales (1:1) y <strong class="text-purple-400">Grupos Privados</strong>.</p>
                        <div class="bg-purple-950/20 border border-purple-500/30 rounded p-2.5 mt-2">
                            <p class="text-purple-300 font-bold mb-1">👥 Cifrado Grupal Simétrico</p>
                            <p class="text-[11px] leading-relaxed">Al crear un grupo desde la sección de grupos, se genera una llave simétrica compartida de manera totalmente segura entre los miembros elegidos.</p>
                        </div>
                    </div>
                `,
                target: '#tab-groups',
                position: 'bottom'
            },

            // ── SECTION 6: RESPONSABILIDAD DE SEGURIDAD ──
            {
                id: 'security_warning',
                section: '⚠️ SEGURIDAD CRÍTICA',
                title: 'Tu Responsabilidad Única',
                content: `
                    <div class="tour-content">
                        <div class="bg-red-950/30 border border-red-500/40 rounded p-3 my-1 text-xs">
                            <p class="text-red-400 font-bold mb-1.5 text-sm">⚠️ ALERTA DE ZERO-KNOWLEDGE</p>
                            <p class="text-gray-300 mb-2">Al no guardar tus claves en nuestros servidores:</p>
                            <ul class="space-y-1.5 text-gray-300">
                                <li class="flex items-start gap-2">
                                    <span class="text-red-400 shrink-0">✗</span>
                                    <span>Si pierdes tu contraseña, <strong class="text-red-300">NADIE puede recuperarla</strong>.</span>
                                </li>
                                <li class="flex items-start gap-2">
                                    <span class="text-red-400 shrink-0">✗</span>
                                    <span>Si borras la caché o el navegador sin un respaldo, <strong class="text-red-300">pierdes tus datos</strong>.</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                `,
                target: null,
                position: 'center'
            },

            // ── SECTION 7: LLAVE MAESTRA ──
            {
                id: 'master_key',
                section: '🔑 LLAVE MAESTRA',
                title: '¿Qué es la Llave Maestra BIP39?',
                content: `
                    <div class="tour-content">
                        <div class="bg-yellow-950/20 border border-yellow-500/30 rounded p-3 text-xs space-y-2.5">
                            <p class="text-yellow-300 font-bold text-sm">🔑 Tu Salvavidas de 12 Palabras</p>
                            <p class="text-gray-300">En el panel de backups puedes generar tu <strong class="text-white">Llave Maestra</strong>. Funciona de la siguiente manera:</p>
                            <ol class="list-decimal pl-5 space-y-1.5 text-gray-300 mt-1">
                                <li><strong class="text-white">Generar Frase</strong> — Crea una combinación criptográfica única de 12 palabras.</li>
                                <li><strong class="text-white">Respaldo Físico</strong> — Escríbelas en papel y guárdalas fuera de internet.</li>
                                <li><strong class="text-white">Exportación Hermética</strong> — Tu respaldo se cifra herméticamente con esa llave.</li>
                                <li><strong class="text-white">Restauración</strong> — En otro dispositivo o navegador, ingresas tus 12 palabras y recuperas tu sesión completa.</li>
                            </ol>
                        </div>
                    </div>
                `,
                target: null,
                position: 'center'
            },

            // ── SECTION 8: LISTO ──
            {
                id: 'complete',
                section: '✅ LISTO',
                title: '¡Estás Listo para Operar!',
                content: `
                    <div class="tour-content text-xs space-y-3 text-gray-300">
                        <div class="space-y-1.5 bg-green-950/20 border border-green-500/30 p-3 rounded text-green-300 font-mono">
                            <p>✅ Identidad criptográfica activa</p>
                            <p>✅ Cifrado post-cuántico verificado</p>
                            <p>✅ Canal Zero-Knowledge operativo</p>
                        </div>
                        <p class="text-center text-gray-400 text-[11px]">Ahora selecciona o agrega un contacto para abrir la barra de mensajes efímeros, audios dinámicos y chat post-cuántico.</p>
                    </div>
                `,
                target: null,
                position: 'center'
            }
        ];
        
        this.currentStep = 0;
        this.isActive = false;
    }
    
    start(force = false) {
        if (!force && localStorage.getItem('hermes_tour_completed') === 'true') {
            return;
        }
        this.currentStep = 0;
        this.isActive = true;
        this.showStep();
    }
    
    showStep() {
        const step = this.sections[this.currentStep];
        const totalSteps = this.sections.length;
        
        let overlay = document.getElementById('tour-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'tour-overlay';
            overlay.id = 'tour-overlay';
            document.body.appendChild(overlay);
        }
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;backdrop-filter:blur(3px);transition:opacity 0.3s;';
        
        let tooltip = document.getElementById('tour-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'tour-tooltip';
            document.body.appendChild(tooltip);
        }
        tooltip.style.cssText = 'position:fixed;z-index:10001;background:linear-gradient(135deg,rgba(10,12,18,0.98),rgba(15,17,25,0.97));border:1.5px solid rgba(0,255,102,0.3);border-radius:14px;padding:0;max-width:420px;width:92vw;box-shadow:0 0 30px rgba(0,255,102,0.15),0 20px 60px rgba(0,0,0,0.7);backdrop-filter:blur(16px);animation:tour-fadeIn 0.35s ease;overflow:hidden;';
        
        // Build progress bar sections
        const sectionLabels = this.sections.map((s, i) => {
            const isActive = i === this.currentStep;
            const isDone = i < this.currentStep;
            return `<div style="flex:1;height:4px;border-radius:2px;background:${isDone ? '#00ff66' : isActive ? 'linear-gradient(90deg,#00ff66,#0e4d2a)' : 'rgba(255,255,255,0.08)'};transition:all 0.3s;"></div>`;
        }).join('');
        
        tooltip.innerHTML = `
            <!-- Section progress bar -->
            <div style="display:flex;gap:3px;padding:12px 16px 0;">
                ${sectionLabels}
            </div>
            
            <!-- Section label -->
            <div style="padding:8px 16px 0;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(0,255,102,0.6);letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">
                    ${step.section} · ${this.currentStep + 1}/${totalSteps}
                </span>
                <button onclick="window.hermesTour.skip()" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:16px;cursor:pointer;padding:2px 6px;transition:color 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.3)'">✕</button>
            </div>
            
            <!-- Title -->
            <h3 style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:800;color:#22d3ee;padding:8px 16px 4px;letter-spacing:0.3px;">${step.title}</h3>
            
            <!-- Content -->
            <div style="padding:0 16px 12px;max-height:55vh;overflow-y:auto;">${step.content}</div>
            
            <!-- Footer navigation -->
            <div style="padding:10px 16px 14px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;gap:8px;">
                ${this.currentStep > 0 ? 
                    `<button onclick="window.hermesTour.previous()" style="padding:7px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#ccc;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;border-radius:6px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">← ANTERIOR</button>` : 
                    `<span></span>`
                }
                ${this.currentStep < totalSteps - 1 ? 
                    `<button onclick="window.hermesTour.next()" style="padding:7px 18px;background:linear-gradient(135deg,#0891b2,#06b6d4);border:none;color:#000;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:800;border-radius:6px;cursor:pointer;transition:all 0.2s;box-shadow:0 0 12px rgba(6,182,212,0.3);" onmouseover="this.style.boxShadow='0 0 20px rgba(6,182,212,0.5)'" onmouseout="this.style.boxShadow='0 0 12px rgba(6,182,212,0.3)'">SIGUIENTE →</button>` :
                    `<button onclick="window.hermesTour.complete()" style="padding:7px 18px;background:linear-gradient(135deg,#059669,#10b981);border:none;color:#fff;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:800;border-radius:6px;cursor:pointer;transition:all 0.2s;box-shadow:0 0 12px rgba(16,185,129,0.4);" onmouseover="this.style.boxShadow='0 0 20px rgba(16,185,129,0.6)'" onmouseout="this.style.boxShadow='0 0 12px rgba(16,185,129,0.4)'">✓ COMENZAR A USAR HERMETIC</button>`
                }
            </div>
            
            <!-- Skip link -->
            <div style="text-align:center;padding:0 16px 12px;">
                <button onclick="window.hermesTour.skip()" style="background:none;border:none;color:rgba(255,255,255,0.25);font-family:'JetBrains Mono',monospace;font-size:9px;cursor:pointer;transition:color 0.2s;" onmouseover="this.style.color='rgba(255,255,255,0.5)'" onmouseout="this.style.color='rgba(255,255,255,0.25)'">[ SALTAR TOUR ]</button>
            </div>
        `;
        
        // Inject animation keyframe if not present
        if (!document.getElementById('tour-anim-style')) {
            const s = document.createElement('style');
            s.id = 'tour-anim-style';
            s.textContent = `@keyframes tour-fadeIn { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }`;
            document.head.appendChild(s);
        }
        
        // Remove previous highlights
        document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
        
        if (step.target) {
            const targetEl = document.querySelector(step.target);
            if (targetEl) {
                targetEl.classList.add('tour-highlight');
                this.positionTooltip(targetEl, step.position);
            } else {
                this.centerTooltip();
            }
        } else {
            this.centerTooltip();
        }
    }
    
    centerTooltip() {
        const tooltip = document.getElementById('tour-tooltip');
        if (!tooltip) return;
        tooltip.style.top = '50%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translate(-50%, -50%)';
    }
    
    positionTooltip(target, position) {
        const tooltip = document.getElementById('tour-tooltip');
        if (!tooltip) return;
        tooltip.style.transform = 'none';
        
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const margin = 16;
        let top, left;
        
        switch (position) {
            case 'right':
                top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
                left = targetRect.right + margin;
                break;
            case 'left':
                top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
                left = targetRect.left - tooltipRect.width - margin;
                break;
            case 'top':
                top = targetRect.top - tooltipRect.height - margin;
                left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
                break;
            case 'bottom':
            default:
                top = targetRect.bottom + margin;
                left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
                break;
        }
        
        // Screen bounds
        if (left < 16) left = 16;
        if (left + tooltipRect.width > window.innerWidth - 16) left = window.innerWidth - tooltipRect.width - 16;
        if (top < 16) top = 16;
        if (top + tooltipRect.height > window.innerHeight - 16) top = window.innerHeight - tooltipRect.height - 16;
        
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }
    
    next() {
        if (this.currentStep < this.sections.length - 1) {
            this.currentStep++;
            this.showStep();
        }
    }
    
    previous() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep();
        }
    }
    
    skip() {
        this.cleanup();
        localStorage.setItem('hermes_tour_completed', 'true');
        showToast("Tour finalizado. Puedes volver a verlo desde tu perfil.");
    }
    
    complete() {
        this.cleanup();
        localStorage.setItem('hermes_tour_completed', 'true');
        showToast("✅ ¡Bienvenido a Hermetic! Sistema de alta seguridad listo.");
    }
    
    cleanup() {
        document.getElementById('tour-overlay')?.remove();
        document.getElementById('tour-tooltip')?.remove();
        document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
        this.isActive = false;
    }
}

export const hermesTour = new HermesTour();
window.hermesTour = hermesTour;
