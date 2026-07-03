// Animación limpia, sosegada y anclada al centro
class EyeInstance {
    constructor(svg, index) {
        this.svg = svg;
        this.index = index;
        
        this.iris = svg.querySelector('.eye-iris');
        this.pupil = svg.querySelector('.eye-pupil');
        this.glare = svg.querySelector('.eye-glare');
        this.lidTop = svg.querySelector('.eye-lid-top');
        this.lidBottom = svg.querySelector('.eye-lid-bottom');
        this.clipPath = svg.querySelector('.eye-clip-path');
        
        this.currentX = 0;
        this.currentY = 0;
        
        this.lidControlY = 4;
        this.pupilOpacity = 1;
        
        this.microX = 0;
        this.microY = 0;
        this.nextMicro = Date.now() + Math.random() * 500;
        
        this.isBlinking = false;
        
        this.EYE_CENTER_X = 12;
        this.EYE_CENTER_Y = 11;
        
        // 🎯 LÍMITE DE ANCLAJE
        // Aquí le decimos cuánto puede alejarse la pupila del centro absoluto (en unidades viewBox)
        // 1.8 es perfecto para que mire de reojo sin intentar "salirse" de la cuenca.
        this.MAX_RADIUS = 1.8;
    }

    update(targetPos, isCalm) {
        const rect = this.svg.getBoundingClientRect();
        if (rect.width === 0) return;

        // 1. Microsacadas muy leves
        if (Date.now() > this.nextMicro && !isCalm) {
            this.microX = (Math.random() - 0.5) * 0.15;
            this.microY = (Math.random() - 0.5) * 0.15;
            this.nextMicro = Date.now() + 200 + Math.random() * 400;
        }

        const eyeCenterX = rect.left + rect.width / 2;
        const eyeCenterY = rect.top + rect.height / 2;
        
        const scaleX = 24 / rect.width;
        const scaleY = 24 / rect.height;
        
        // Sensibilidad súper baja (0.1) para que necesites mover el ratón bastante para que reaccione
        const dx = (targetPos.x - eyeCenterX) * scaleX * 0.1;
        const dy = (targetPos.y - eyeCenterY) * scaleY * 0.1;
        
        let targetX = 0;
        let targetY = 0;
        
        if (!isCalm && !this.isBlinking) {
            const rawDist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            
            // 🎯 ANCLAJE AL MEDIO DEL OJO
            // Limita la distancia a un círculo rígido, evitando paseos largos y confusos
            const clampedDist = Math.min(rawDist, this.MAX_RADIUS);
            
            // Si la distancia es ínfima, lo dejamos al centro para mayor paz
            if (rawDist > 0.05) {
                targetX = (Math.cos(angle) * clampedDist) + this.microX;
                targetY = (Math.sin(angle) * clampedDist) + this.microY;
            }
        }

        // 4. Inercia sosegada
        this.currentX += (targetX - this.currentX) * 0.15;
        this.currentY += (targetY - this.currentY) * 0.15;

        // 5. Aplicar posición 
        const finalX = this.EYE_CENTER_X + this.currentX;
        const finalY = this.EYE_CENTER_Y + this.currentY;
        
        if (this.iris) {
            this.iris.setAttribute('cx', finalX);
            this.iris.setAttribute('cy', finalY);
        }
        if (this.pupil) {
            this.pupil.setAttribute('cx', finalX);
            this.pupil.setAttribute('cy', finalY);
        }
        if (this.glare) {
            this.glare.setAttribute('cx', finalX - 0.4);
            this.glare.setAttribute('cy', finalY - 0.6);
        }

        // 6. Párpado
        let targetLidY = 4;
        if (isCalm || this.isBlinking) {
            targetLidY = 18;
        } else {
            // El párpado solo se mueve sutilmente si la mirada baja
            targetLidY = 4 + (this.currentY * 0.5);
            targetLidY = Math.max(2, Math.min(10.5, targetLidY));
        }

        const lidSpeed = this.isBlinking ? 0.6 : (isCalm ? 0.08 : 0.2);
        this.lidControlY += (targetLidY - this.lidControlY) * lidSpeed;

        // 7. Opacidad
        const targetOp = (isCalm || this.lidControlY > 14) ? 0 : 1;
        this.pupilOpacity += (targetOp - this.pupilOpacity) * 0.3;
        
        if (this.iris) this.iris.style.opacity = this.pupilOpacity * 0.25;
        if (this.pupil) this.pupil.style.opacity = this.pupilOpacity;
        if (this.glare) this.glare.style.opacity = this.pupilOpacity * 0.5;

        // 8. Actualizar Paths
        const lidPath = `M4 11 Q12 ${this.lidControlY} 20 11`;
        if (this.lidTop) this.lidTop.setAttribute('d', lidPath);
        
        const clipD = `M4 11 Q12 ${this.lidControlY} 20 11 Q12 18 4 11`;
        if (this.clipPath) this.clipPath.setAttribute('d', clipD);
    }
}

const EyeAnimator = {
    eyes: [],
    mousePos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    isCalm: false,
    overridePos: null,

    init() {
        this.setupSVGs();
        
        window.addEventListener('mousemove', (e) => {
            if (!this.overridePos) {
                this.mousePos.x = e.clientX;
                this.mousePos.y = e.clientY;
            }
        });

        requestAnimationFrame(() => this.render());
        
        this.blinkLoop();
        setTimeout(() => this.introAnimation(), 800);

        this.attachHooks();
    },

    setupSVGs() {
        const authIcons = document.querySelectorAll('.auth-icon');
        
        authIcons.forEach((container, index) => {
            const originalSvg = container.querySelector('svg');
            if (!originalSvg) return;

            const strokeColor = originalSvg.getAttribute('stroke') || 'currentColor';
            const clipId = `eye-clip-${index}`;
            
            // Un SVG limpio sin modo debug y con tamaños armónicos
            container.innerHTML = `
                <svg width="150" height="150" viewBox="0 0 24 24" fill="none" class="animated-eye-svg" style="stroke: ${strokeColor};">
                    <defs>
                        <clipPath id="${clipId}">
                            <path class="eye-clip-path" d="M4 11 Q12 4 20 11 Q12 18 4 11" />
                        </clipPath>
                    </defs>
                    
                    <g clip-path="url(#${clipId})">
                        <circle class="eye-iris" cx="12" cy="11" r="2.1" fill="${strokeColor}" opacity="0.25" stroke="none" />
                        <circle class="eye-pupil" cx="12" cy="11" r="1.1" fill="${strokeColor}" stroke="none" />
                        <circle class="eye-glare" cx="11.6" cy="10.4" r="0.4" fill="white" opacity="0.5" stroke="none" />
                    </g>
                    
                    <path class="eye-lid-bottom" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 11 Q12 18 20 11" />
                    <path class="eye-lid-top" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 11 Q12 4 20 11" />
                    
                    <g class="eye-lashes" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" opacity="0.6">
                        <path d="M8 13.5 l-1.2 2.2" />
                        <path d="M12 14.5 l0 2.2" />
                        <path d="M16 13.5 l1.2 2.2" />
                        <path d="M8.5 5.5 l-1.2 -1.8" />
                        <path d="M12 4.5 l0 -1.8" />
                        <path d="M15.5 5.5 l1.2 -1.8" />
                    </g>
                </svg>
            `;
            
            this.eyes.push(new EyeInstance(container.querySelector('svg'), index));
        });
    },

    // 🎯 Animación de Intro rediseñada a tu medida
    async introAnimation() {
        this.setCalm(); // Despierta sereno
        
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const w2 = window.innerWidth / 2;
        const h2 = window.innerHeight / 2;
        
        // Offset gigante para que mire completamente hacia un lado
        // Al multiplicar dx en el update por 0.1, necesitamos un offset grande para forzar el límite.
        const offset = window.innerWidth * 2; 

        await wait(600);
        this.wakeUp();
        this.blink(200);
        
        // 1. Mira a la Izquierda puro
        this.overridePos = { x: w2 - offset, y: h2 };
        await wait(700);
        
        // 2. Mira al Centro
        this.overridePos = { x: w2, y: h2 };
        await wait(500);

        // 3. Mira a la Derecha puro
        this.overridePos = { x: w2 + offset, y: h2 };
        await wait(700);
        
        this.blink(150);
        
        // 4. Suelta el ancla y sigue al ratón
        this.overridePos = null; 
    },

    blinkLoop() {
        if (!this.isCalm) {
            const rand = Math.random();
            if (rand < 0.2) {
                this.blink(100);
                setTimeout(() => this.blink(100), 180);
            } else if (rand < 0.3) {
                this.blink(250);
            } else {
                this.blink(100);
            }
        }
        setTimeout(() => this.blinkLoop(), Math.random() * 4000 + 1500);
    },

    blink(duration = 100) {
        if (this.isCalm) return;
        this.eyes.forEach(eye => {
            eye.isBlinking = true;
            setTimeout(() => {
                eye.isBlinking = false;
            }, duration);
        });
    },

    setCalm() {
        this.isCalm = true;
        this.eyes.forEach(eye => eye.isBlinking = false);
    },

    wakeUp() {
        this.isCalm = false;
    },

    render() {
        const target = this.overridePos || this.mousePos;
        this.eyes.forEach(eye => eye.update(target, this.isCalm));
        requestAnimationFrame(() => this.render());
    },
    
    attachHooks() {
        const triggerCalmElements = [
            'btn-login', 'btn-register', 'btn-select-account'
        ];
        
        triggerCalmElements.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('click', () => {
                this.setCalm();
                setTimeout(() => this.wakeUp(), 2500);
            });
        });
        
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.account-item') || e.target.closest('button[id^="btn-select-account"]')) {
                this.setCalm();
                setTimeout(() => this.wakeUp(), 1500);
            }
        });

        document.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('focus', () => {
                if (this.isCalm) this.wakeUp();
            });
        });
    }
};

window.HermesEye = EyeAnimator;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.HermesEye.init();
    }, 100);
});
