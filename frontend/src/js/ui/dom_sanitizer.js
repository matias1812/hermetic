// frontend/src/js/ui/dom_sanitizer.js
// Módulo de Saneamiento y Escape de HTML/DOM para Mitigación de Intrusiones (XSS / DOM Clobbering)

export class DOMSanitizer {
    /**
     * Escapa caracteres especiales HTML (&, <, >, ", ', /) para prevenir inyecciones XSS.
     * @param {any} str - Cadena o valor a escapar.
     * @returns {string} Cadena segura para insertar en HTML o texto.
     */
    static escapeHTML(str) {
        if (str === null || str === undefined) return '';
        const s = String(str);
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        };
        return s.replace(/[&<>"'/]/g, (char) => map[char] || char);
    }

    /**
     * Escapa atributos HTML (ej. URLs o identificadores de datos).
     * @param {any} str - Cadena de atributo.
     * @returns {string} Cadena escapada para atributos.
     */
    static escapeAttribute(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[^a-zA-Z0-9_\-\.\/\?=&%:!#]/g, encodeURIComponent);
    }

    /**
     * Valida y purga identificadores para evitar Prototype Pollution o DOM Clobbering.
     * @param {string} id - ID de usuario, contacto o grupo.
     * @returns {string} ID purgado sin secuencias reservadas.
     */
    static sanitizeID(id) {
        if (!id || typeof id !== 'string') return 'unknown';
        const clean = id.trim();
        if (clean === '__proto__' || clean === 'constructor' || clean === 'prototype') {
            return 'sanitized_reserved_id';
        }
        return clean.replace(/[<>'"&/\\{}\(\)]/g, '');
    }

    /**
     * Crea un elemento DOM de forma segura asignando textContent sin interpretar HTML.
     * @param {string} tag - Etiqueta HTML (ej. 'div', 'span').
     * @param {string} text - Contenido de texto seguro.
     * @param {string} [className] - Clases CSS opcionales.
     * @returns {HTMLElement} Elemento DOM creado y seguro.
     */
    static createSafeElement(tag, text = '', className = '') {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== null && text !== undefined) el.textContent = String(text);
        return el;
    }
}
