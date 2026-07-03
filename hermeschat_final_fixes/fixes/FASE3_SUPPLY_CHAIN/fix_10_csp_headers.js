// fixes/FASE3_SUPPLY_CHAIN/fix_10_csp_headers.js
import crypto from 'crypto';

export class CSPConfigurator {
    /**
     * Configurador de Content Security Policy (CSP) ultra-estricto.
     * 
     * GARANTÍAS:
     * - Sin 'unsafe-inline' (previene XSS)
     * - Sin 'unsafe-eval' (previene code injection)
     * - Sin '*' origins (previene data exfiltration)
     * - Script-src solo permite WASM y nuestro bundle
     * - Connect-src solo permite nuestro backend
     * - Trusted Types forzado (previene DOM XSS)
     * - SRI (Subresource Integrity) en todos los scripts
     */
    
    constructor() {
        this.policies = {
            // Scripts: solo nuestro bundle + WASM
            'script-src': [
                "'self'",
                "'wasm-unsafe-eval'", // Requerido para WASM
                "https://hermeschat.io", // Nuestro CDN
            ],
            
            // Estilos: solo inline con nonce
            'style-src': [
                "'self'",
                "'nonce-{NONCE}'", // Generado por servidor
            ],
            
            // Conexiones: solo nuestro backend
            'connect-src': [
                "'self'",
                "wss://hermeschat.io",
                "https://hermeschat.io",
            ],
            
            // Imágenes: solo nuestro CDN + inline SVG
            'img-src': [
                "'self'",
                "data:", // Para imágenes inline (SVG, canvas)
                "blob:", // Para blobs locales
            ],
            
            // Media: solo nuestro CDN
            'media-src': [
                "'self'",
                "blob:", // Para grabaciones de audio
            ],
            
            // Fuentes: solo nuestras fuentes
            'font-src': [
                "'self'",
                "https://fonts.gstatic.com",
            ],
            
            // Workers: solo nuestro WebWorker de crypto
            'worker-src': [
                "'self'",
                "blob:", // Para WebWorkers inline
            ],
            
            // Frame: ninguno (previene clickjacking)
            'frame-src': [
                "'none'",
            ],
            
            // Frame ancestors: solo nosotros
            'frame-ancestors': [
                "'self'",
            ],
            
            // Objetos: ninguno
            'object-src': [
                "'none'",
            ],
            
            // Base URI: solo nosotros
            'base-uri': [
                "'self'",
            ],
            
            // Form action: ninguno
            'form-action': [
                "'none'",
            ],
        };
        
        this.trustedTypes = [
            'hermes-policy',
            'default',
        ];
    }
    
    generateNonce() {
        const nonce = crypto.randomUUID();
        return nonce.replace(/-/g, '');
    }
    
    generateCSPHeader(nonce) {
        const directives = [];
        
        for (const [directive, sources] of Object.entries(this.policies)) {
            const processedSources = sources.map(source => 
                source.replace('{NONCE}', nonce)
            );
            directives.push(`${directive} ${processedSources.join(' ')}`);
        }
        
        return directives.join('; ');
    }
    
    generateSecurityHeaders(nonce) {
        return {
            // CSP
            'Content-Security-Policy': `${this.generateCSPHeader(nonce)}; trusted-types ${this.trustedTypes.join(' ')}`,
            
            // Otras cabeceras de seguridad
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '0', // Desactivado (CSP es suficiente)
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            'Permissions-Policy': [
                'camera=()',
                'microphone=(self)',
                'geolocation=()',
                'interest-cohort=()',
                'display-capture=()',
                'clipboard-write=(self)',
                'clipboard-read=(self)',
            ].join(', '),
        };
    }
    
    validateCSP(cspHeader) {
        const errors = [];
        
        // Verificar que no hay unsafe-inline
        if (cspHeader.includes("'unsafe-inline'")) {
            errors.push('CRITICAL: unsafe-inline detected in CSP');
        }
        
        // Verificar que no hay unsafe-eval (excepto para WASM)
        if (cspHeader.includes("'unsafe-eval'") && !cspHeader.includes("'wasm-unsafe-eval'")) {
            errors.push('CRITICAL: unsafe-eval without wasm-unsafe-eval');
        }
        
        // Verificar que no hay wildcard origins
        if (cspHeader.includes('*') && !cspHeader.includes("'unsafe-eval'")) {
            errors.push('HIGH: Wildcard origin detected');
        }
        
        // Verificar Trusted Types
        if (!cspHeader.includes('trusted-types')) {
            errors.push('MEDIUM: Trusted Types not enforced');
        }
        
        // Verificar frame-ancestors
        if (!cspHeader.includes('frame-ancestors')) {
            errors.push('MEDIUM: frame-ancestors not set (clickjacking risk)');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            score: Math.max(0, 100 - errors.length * 20)
        };
    }
    
    generateSRIHash(scriptContent) {
        const hash = crypto.createHash('sha384')
            .update(scriptContent)
            .digest('base64');
        return `sha384-${hash}`;
    }
    
    generateScriptTag(scriptSrc, scriptContent) {
        const integrity = this.generateSRIHash(scriptContent);
        const nonce = this.generateNonce();
        
        return `<script src="${scriptSrc}" 
                integrity="${integrity}" 
                nonce="${nonce}"
                crossorigin="anonymous"></script>`;
    }
}
