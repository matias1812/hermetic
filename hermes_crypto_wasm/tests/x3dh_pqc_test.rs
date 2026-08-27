// BACKLOG.md #4 — generate_prekey_bundle/create_session_from_bundle/accept_session_handshake
// (X3DH híbrido) generaban un ML-KEM-768 pk real para el bundle, pero nunca guardaban la
// clave de decapsulación, y del lado de Alice el "encapsulate" estaba simulado con bytes
// aleatorios + SHA-256(ciphertext) -- un valor que CUALQUIERA que viera el ciphertext en
// tránsito podía recalcular sin ninguna clave privada. Cero protección PQC real, aunque el
// código "funcionaba" (ambos lados computaban el mismo hash del mismo ciphertext público).
//
// Este test prueba directamente sobre las funciones puras de x3dh.rs (no a través de la
// superficie wasm-bindgen de HermesCore, que solo es el wiring) que:
//   1. Con el fix real (ML-KEM-768 encapsulate/decapsulate real), Alice y Bob derivan la
//      MISMA root key híbrida.
//   2. Una clave de decapsulación distinta (aunque ik/spk/handshake sean idénticos) deriva
//      una root key DISTINTA -- lo que solo es posible si el secreto compartido depende de
//      verdad de la clave privada de decapsulación, no solo del ciphertext público.
use hermes_crypto_wasm::ratchet::x3dh::{generate_prekey_bundle, initiator_x3dh, responder_x3dh};
use ml_kem::kem::{Decapsulate, Encapsulate};
use ml_kem::{DecapsulationKey, EncapsulationKey, KeyExport, MlKem768};
use rand::rngs::OsRng;
use rand::RngCore;
use x25519_dalek::StaticSecret;

// wasm_bindgen_test (no #[test] nativo): este entorno de desarrollo no tiene toolchain
// nativo para Windows (falta dlltool.exe para x86_64-pc-windows-gnu, no hay MSVC
// instalado), mismo motivo por el que hybrid_test.rs ya usa este runner. Se ejecuta con
// `wasm-pack test --node` contra el target wasm32, que sí es el target real de despliegue.
use wasm_bindgen_test::*;

fn random_seed64() -> [u8; 64] {
    let mut seed = [0u8; 64];
    RngCore::fill_bytes(&mut OsRng, &mut seed);
    seed
}

fn random_bytes32() -> [u8; 32] {
    let mut b = [0u8; 32];
    RngCore::fill_bytes(&mut OsRng, &mut b);
    b
}

#[wasm_bindgen_test]
fn test_real_ml_kem_encapsulation_matches_end_to_end() {
    // --- Bob genera su PreKeyBundle real (incluye pk ML-KEM-768 real) ---
    let bob_ik = StaticSecret::random_from_rng(OsRng).to_bytes();
    let bob_sign = random_bytes32();
    let bob_mldsa_seed = random_bytes32();

    let bob_pqc_seed = random_seed64();
    let bob_dk = DecapsulationKey::<MlKem768>::from_seed(bob_pqc_seed.into());
    let bob_ek = bob_dk.encapsulation_key();
    let bob_pqc_pk_bytes = bob_ek.to_bytes().to_vec();

    let (bundle, bob_spk_sec, _opk) =
        generate_prekey_bundle(&bob_ik, &bob_sign, &bob_mldsa_seed, None, &bob_pqc_pk_bytes);

    // --- Alice: ML-KEM-768 encapsulate real contra bundle.pqc_public_key (lo que
    // create_session_from_bundle hace ahora en core_api.rs) ---
    let pk_array = bundle
        .pqc_public_key
        .as_slice()
        .try_into()
        .expect("longitud de pk ML-KEM-768");
    let ek = EncapsulationKey::<MlKem768>::new(&pk_array).expect("pk ML-KEM-768 válida");
    let (ct, alice_ss) = ek.encapsulate();

    let alice_ik = StaticSecret::random_from_rng(OsRng).to_bytes();
    let (alice_sk, handshake) = initiator_x3dh(&alice_ik, &bundle, ct.as_slice(), &alice_ss)
        .expect("X3DH del emisor debe completar");

    // --- Bob: ML-KEM-768 decapsulate real con SU semilla real (lo que
    // accept_session_handshake hace ahora en core_api.rs) ---
    let bob_ss = bob_dk
        .decapsulate_slice(&handshake.pqc_ciphertext)
        .expect("decapsulate debe aceptar un ciphertext bien formado");
    let bob_sk = responder_x3dh(&bob_ik, &bob_spk_sec, None, &handshake, &bob_ss)
        .expect("X3DH del receptor debe completar");

    assert_eq!(
        alice_sk, bob_sk,
        "Alice y Bob deben derivar la misma root key híbrida a partir del mismo handshake real"
    );

    // --- Prueba negativa: una clave de decapsulación DISTINTA (mismo ik/spk/handshake)
    // debe derivar una root key DISTINTA. Esto es exactamente lo que el código viejo NO
    // podía demostrar: sha256(ciphertext) es idéntico sin importar qué clave privada tenga
    // quien lo calcula, así que un atacante que solo ve el ciphertext en tránsito podía
    // reproducir el mismo "secreto compartido" que Bob sin poseer ninguna clave privada.
    let wrong_seed = random_seed64();
    let wrong_dk = DecapsulationKey::<MlKem768>::from_seed(wrong_seed.into());
    let wrong_ss = wrong_dk
        .decapsulate_slice(&handshake.pqc_ciphertext)
        .expect("decapsulate con clave incorrecta igual retorna un valor (rechazo implícito FO)");
    let wrong_sk = responder_x3dh(&bob_ik, &bob_spk_sec, None, &handshake, &wrong_ss)
        .expect("X3DH debe completar incluso con el secreto PQC equivocado (no hay MAC previo)");

    assert_ne!(
        bob_sk, wrong_sk,
        "Una clave de decapsulación distinta a la real de Bob DEBE derivar una root key distinta -- \
         si esto fallara, el secreto compartido no dependería de verdad de la clave privada ML-KEM"
    );
}
