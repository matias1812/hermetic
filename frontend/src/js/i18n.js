// i18n.js
// Soporte de internacionalización para Hermetic

export const i18n = {
    es: {
        hero_title: 'Mensajería Zero-Knowledge',
        hero_subtitle: 'Resistente a Computación Cuántica',
        hero_cta: 'COMENZAR AHORA',
        about_title: '¿Qué es Hermetic?',
        security_title: 'Seguridad Comprobable',
        faq_title: 'Preguntas Frecuentes',
        footer: 'Hermetic — Zero-Knowledge Messaging'
    },
    en: {
        hero_title: 'Zero-Knowledge Messaging',
        hero_subtitle: 'Quantum-Resistant',
        hero_cta: 'START NOW',
        about_title: 'What is Hermetic?',
        security_title: 'Provable Security',
        faq_title: 'Frequently Asked Questions',
        footer: 'Hermetic — Zero-Knowledge Messaging'
    }
};

export function setLanguage(lang) {
    document.documentElement.lang = lang;
    const strings = i18n[lang] || i18n.es;
    Object.entries(strings).forEach(([key, value]) => {
        const el = document.querySelector(`[data-i18n="${key}"]`);
        if (el) el.textContent = value;
    });
    localStorage.setItem('hermes_lang', lang);
}

window.setLanguage = setLanguage;
