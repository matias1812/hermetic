// frontend/src/js/security/payload_validator.js
// Validador Estricto de Cargas Útiles (Payloads) y Defensa Anti-Prototype Pollution / DOM Clobbering

export class PayloadValidator {
    static MAX_DEPTH = 15;
    static MAX_ELEMENTS = 500;
    static MAX_STRING_LENGTH = 512 * 1024; // 512 KB máx para soportar notas de audio/imágenes efímeras en base64

    /**
     * Valida y desinfecta un objeto JSON recibido desde WebSocket o descifrado de red.
     * Elimina claves peligrosas (__proto__, constructor, prototype) recursivamente.
     * @param {any} obj - Objeto o valor a validar.
     * @param {number} depth - Profundidad máxima de recursión para evitar ataques DoS.
     * @returns {any} Objeto seguro desinfectado o null si viola límites de seguridad.
     */
    static sanitizePayload(obj, depth = 0) {
        if (depth > this.MAX_DEPTH) {
            console.warn('[PayloadValidator] Rechazado payload: excede profundidad máxima de recursión.');
            return null;
        }
        if (obj === null || obj === undefined) return obj;
        
        if (typeof obj !== 'object') {
            if (typeof obj === 'string') {
                if (obj.length > this.MAX_STRING_LENGTH) {
                    console.warn('[PayloadValidator] Rechazada cadena: excede longitud máxima permitida.');
                    return null;
                }
                // Eliminar bytes nulos que podrían causar vulnerabilidades en C/Rust o truncamiento
                return obj.replace(/\0/g, '');
            }
            return obj;
        }

        if (Array.isArray(obj)) {
            if (obj.length > this.MAX_ELEMENTS) {
                console.warn('[PayloadValidator] Rechazado array: excede cantidad máxima de elementos.');
                return null;
            }
            return obj.map(item => this.sanitizePayload(item, depth + 1));
        }

        const keys = Object.keys(obj);
        if (keys.length > this.MAX_ELEMENTS) {
            console.warn('[PayloadValidator] Rechazado objeto: excede cantidad máxima de claves.');
            return null;
        }

        const cleanObj = Object.create(null); // Objeto sin prototipo (__proto__ es nulo por diseño)
        for (const key of keys) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                console.warn('[PayloadValidator] Bloqueado intento de Prototype Pollution con clave:', key);
                continue;
            }
            cleanObj[key] = this.sanitizePayload(obj[key], depth + 1);
        }

        // Convertir de nuevo a Object estándar si se requiere por compatibilidad
        return Object.assign({}, cleanObj);
    }

    /**
     * Valida que un envelope de red contenga los campos criptográficos mínimos requeridos y tipos primitivos correctos.
     * @param {object} envelope - Sobre criptográfico de entrada.
     * @returns {boolean} True si el envelope es estructuralmente válido.
     */
    static validateEnvelope(envelope) {
        if (!envelope || typeof envelope !== 'object') return false;
        if (typeof envelope.sender_id !== 'string' || !envelope.sender_id.trim()) return false;
        if (typeof envelope.receiver_id !== 'string' || !envelope.receiver_id.trim()) return false;
        
        // Evitar IDs maliciosos o reservados
        const sender = envelope.sender_id.trim();
        if (sender === '__proto__' || sender === 'constructor' || sender === 'prototype') return false;
        
        return true;
    }
}
