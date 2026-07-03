export class AuthValidator {
    /**
     * Validador en tiempo real del formulario de registro.
     */
    constructor() {
        this.setupPasswordStrengthMeter();
        this.setupPasswordMatchChecker();
        this.setupSubmitEnabler();
    }
    
    /**
      * Medidor de fortaleza de contraseña.
      */
    setupPasswordStrengthMeter() {
        const passwordInput = document.getElementById('register-password');
        const strengthMeter = document.getElementById('password-strength');
        const strengthBar = document.getElementById('strength-bar');
        const strengthText = document.getElementById('strength-text');
        
        if (!passwordInput) return;

        passwordInput.addEventListener('input', () => {
            const password = passwordInput.value;
            
            if (password.length === 0) {
                strengthMeter.classList.add('hidden');
                return;
            }
            
            strengthMeter.classList.remove('hidden');
            
            let score = 0;
            
            // Longitud
            if (password.length >= 12) score += 25;
            else if (password.length >= 8) score += 15;
            
            // Complejidad
            if (/[A-Z]/.test(password)) score += 15;
            if (/[a-z]/.test(password)) score += 15;
            if (/[0-9]/.test(password)) score += 15;
            if (/[^A-Za-z0-9]/.test(password)) score += 20;
            
            // Variedad de caracteres
            const uniqueChars = new Set(password).size;
            if (uniqueChars >= 10) score += 10;
            
            // Actualizar barra
            strengthBar.className = 'strength-bar';
            if (score >= 80) {
                strengthBar.classList.add('strength-very-strong');
                strengthText.textContent = '🔒 Muy fuerte';
            } else if (score >= 60) {
                strengthBar.classList.add('strength-strong');
                strengthText.textContent = '✅ Fuerte';
            } else if (score >= 40) {
                strengthBar.classList.add('strength-medium');
                strengthText.textContent = '⚠️ Media';
            } else {
                strengthBar.classList.add('strength-weak');
                strengthText.textContent = '❌ Débil';
            }
        });
    }
    
    /**
      * Verificador de coincidencia de contraseñas.
      */
    setupPasswordMatchChecker() {
        const passwordInput = document.getElementById('register-password');
        const confirmInput = document.getElementById('register-password-confirm');
        const indicator = document.getElementById('password-match-indicator');
        
        if (!confirmInput) return;

        confirmInput.addEventListener('input', () => {
            const pass = passwordInput.value;
            const confirm = confirmInput.value;
            
            if (confirm.length === 0) {
                indicator.classList.add('hidden');
                return;
            }
            
            indicator.classList.remove('hidden');
            
            if (pass === confirm) {
                indicator.textContent = '✅ Las contraseñas coinciden';
                indicator.className = 'match-indicator match-ok';
            } else {
                indicator.textContent = '❌ Las contraseñas NO coinciden';
                indicator.className = 'match-indicator match-fail';
            }
        });
    }
    
    /**
      * Habilitar botón de registro solo cuando todo es válido.
      */
    setupSubmitEnabler() {
        const aliasInput = document.getElementById('register-alias');
        const passwordInput = document.getElementById('register-password');
        const confirmInput = document.getElementById('register-password-confirm');
        const termsCheck = document.getElementById('register-terms');
        const submitBtn = document.getElementById('register-submit');
        
        if (!aliasInput || !submitBtn) return;

        function checkAllValid() {
            const aliasValid = aliasInput.value.trim().length >= 3;
            const passwordValid = passwordInput.value.length >= 12;
            const confirmValid = passwordInput.value === confirmInput.value;
            const termsAccepted = termsCheck.checked;
            
            console.log("[AuthValidator] Validation state:", {
                aliasValid,
                aliasVal: aliasInput.value,
                passwordValid,
                passwordLen: passwordInput.value.length,
                confirmValid,
                termsAccepted
            });
            
            const allValid = aliasValid && passwordValid && confirmValid && termsAccepted;
            submitBtn.disabled = !allValid;
            
            if (!allValid) {
                submitBtn.style.opacity = '0.5';
                submitBtn.style.cursor = 'not-allowed';
            } else {
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
            }
        }
        
        [aliasInput, passwordInput, confirmInput, termsCheck].forEach(el => {
            if (el) {
                el.addEventListener('input', checkAllValid);
                el.addEventListener('change', checkAllValid);
            }
        });
    }
}
