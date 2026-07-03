// frontend/src/js/x3dh.js
//
// Extended Triple Diffie-Hellman (X3DH) — Módulo independiente.
//
// PROPÓSITO:
//   Protocolo de establecimiento de sesión para iniciar conversaciones nuevas
//   de forma autenticada con forward secrecy. Diseñado para coexistir con el
//   sistema KyberKEM existente (Opción A — módulo complementario).
//
//   X3DH resuelve el problema del handshake inicial cuando el receptor está
//   offline: el emisor puede cifrar usando pre-keys publicadas previamente,
//   y el receptor puede derivar la misma clave compartida cuando se conecte.
//
// ESTÁNDAR:
//   Signal Protocol X3DH Specification
//   https://signal.org/docs/specifications/x3dh/
//
// CURVA:
//   P-256 (secp256r1) via Web Crypto API.
//   Nota: Signal usa X25519 — P-256 es funcionalmente equivalente pero más
//   compatible con la Web Crypto API estándar (no requiere librerías externas).
//
// PROPIEDADES:
//   ✅ Autenticación mutua (IK de ambas partes participan)
//   ✅ Forward secrecy (EK ephemeral descartada tras el intercambio)
//   ✅ Protección post-compromiso (combinada con Double Ratchet)
//   ✅ Seguridad ante receptor offline (SPK + OPK pre-publicadas)
//
// INTEGRACIÓN CON EL SISTEMA EXISTENTE:
//   El resultado de X3DH (shared secret) puede usarse como clave inicial
//   para RealDoubleRatchet.init(sk, pk, isAlice), reemplazando o
//   complementando el handshake KyberKEM actual.
//
// ARQUITECTURA DE CLAVES:
//
//   Alice (emisor)               Bob (receptor, puede estar offline)
//   ─────────────────────────    ──────────────────────────────────────
//   IK_A  = Identity Key         IK_B  = Identity Key
//   EK_A  = Ephemeral Key        SPK_B = Signed PreKey
//                                OPK_B = One-Time PreKey (opcional)
//
//   DH1 = DH(IK_A, SPK_B)       (autenticidad de Bob via SPK firmada)
//   DH2 = DH(EK_A, IK_B)        (autenticidad de Alice via IK)
//   DH3 = DH(EK_A, SPK_B)       (forward secrecy de EK)
//   DH4 = DH(EK_A, OPK_B)       (si OPK disponible — unicidad de sesión)
//
//   SK  = HKDF(DH1 || DH2 || DH3 [|| DH4], salt="X3DH", info="HermesX3DH_v1")

import { hermesBridge } from './crypto_wasm_bridge.js';

export class X3DHKeyManager {
    static generatePreKeyBundleWasm(opkIdOpt = null) {
        return hermesBridge.generatePreKeyBundle(opkIdOpt);
    }
    
    // Todos los metodos de generacion individual de llaves (Identity, SPK, OPK)
    // han sido eliminados de JS. WASM gestiona sus propias llaves internamente
    // y solo devuelve el Bundle pre-firmado.
}

export class X3DH {
    static createSessionFromBundleWasm(contactId, bundle) {
        return hermesBridge.createSessionFromBundle(contactId, bundle);
    }

    static acceptSessionHandshakeWasm(contactId, handshake) {
        return hermesBridge.acceptSessionHandshake(contactId, handshake);
    }
}

window.X3DH = X3DH;
window.X3DHKeyManager = X3DHKeyManager;
