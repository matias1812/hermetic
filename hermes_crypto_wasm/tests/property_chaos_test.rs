use hermes_crypto_wasm::ratchet::dh_ratchet::DHRatchet;
use rand_core::OsRng;
use wasm_bindgen_test::*;
use x25519_dalek::{PublicKey, StaticSecret};

#[wasm_bindgen_test]
fn test_invariants_no_key_reuse() {
    let shared_secret = [0x77u8; 32];

    let bob_sk = StaticSecret::random_from_rng(OsRng);
    let bob_pk = PublicKey::from(&bob_sk);

    let alice_sk = StaticSecret::random_from_rng(OsRng);
    let alice_pk = PublicKey::from(&alice_sk);

    let mut alice = DHRatchet::new_with_role(
        &shared_secret,
        bob_pk,
        Some(alice_sk.to_bytes()),
        Some(alice_pk),
        true,
    );
    let mut bob = DHRatchet::new_with_role(
        &shared_secret,
        alice_pk,
        Some(bob_sk.to_bytes()),
        Some(bob_pk),
        false,
    );

    let mut used_ciphertexts = Vec::new();
    let mut used_nonces = Vec::new();

    // Alice envía 10 mensajes continuos
    for i in 0..10 {
        let msg_str = format!("burst message {}", i);
        let enc = alice.encrypt(msg_str.as_bytes(), b"aad");

        // Módulo C: Verificación de invariantes - unicidad de nonce y ciphertext
        assert!(
            !used_ciphertexts.contains(&enc.ciphertext),
            "INVARIANTE ROTO: Reutilización de ciphertext detectada"
        );
        assert!(
            !used_nonces.contains(&enc.nonce),
            "INVARIANTE ROTO: Reutilización de nonce detectada"
        );

        used_ciphertexts.push(enc.ciphertext.clone());
        used_nonces.push(enc.nonce);

        let dec = bob
            .decrypt(&enc, b"aad")
            .expect("Descifrado en ráfaga debe tener éxito");
        assert_eq!(dec, msg_str.as_bytes());
    }
}

#[wasm_bindgen_test]
fn test_network_simulation_packet_reordering_and_loss() {
    let shared_secret = [0x88u8; 32];
    let bob_sk = StaticSecret::random_from_rng(OsRng);
    let bob_pk = PublicKey::from(&bob_sk);
    let alice_sk = StaticSecret::random_from_rng(OsRng);
    let alice_pk = PublicKey::from(&alice_sk);

    let mut alice = DHRatchet::new_with_role(
        &shared_secret,
        bob_pk,
        Some(alice_sk.to_bytes()),
        Some(alice_pk),
        true,
    );
    let mut bob = DHRatchet::new_with_role(
        &shared_secret,
        alice_pk,
        Some(bob_sk.to_bytes()),
        Some(bob_pk),
        false,
    );

    // Alice envía 5 mensajes en una ráfaga
    let m0 = alice.encrypt(b"msg 0", b"");
    let m1 = alice.encrypt(b"msg 1", b"");
    let m2 = alice.encrypt(b"msg 2", b"");
    let m3 = alice.encrypt(b"msg 3", b"");
    let m4 = alice.encrypt(b"msg 4", b"");

    // Simulación de red: reordenamiento (llega m2 antes que m0 y m1)
    let dec2 = bob
        .decrypt(&m2, b"")
        .expect("Descifrado de m2 (salto de m0 y m1) debe tener éxito");
    assert_eq!(dec2, b"msg 2");

    // Ahora llegan m0 y m1 fuera de orden desde skipped_keys
    let dec0 = bob
        .decrypt(&m0, b"")
        .expect("Descifrado de m0 (skipped key) debe tener éxito");
    assert_eq!(dec0, b"msg 0");

    let dec1 = bob
        .decrypt(&m1, b"")
        .expect("Descifrado de m1 (skipped key) debe tener éxito");
    assert_eq!(dec1, b"msg 1");

    // Simulación de pérdida permanente de m3: llega m4 directamente
    let dec4 = bob
        .decrypt(&m4, b"")
        .expect("Descifrado de m4 tras pérdida de m3 debe tener éxito");
    assert_eq!(dec4, b"msg 4");
}

#[wasm_bindgen_test]
fn test_fuzzing_boundary_corrupted_messages() {
    let shared_secret = [0x99u8; 32];
    let bob_sk = StaticSecret::random_from_rng(OsRng);
    let bob_pk = PublicKey::from(&bob_sk);
    let alice_sk = StaticSecret::random_from_rng(OsRng);
    let alice_pk = PublicKey::from(&alice_sk);

    let mut alice = DHRatchet::new_with_role(
        &shared_secret,
        bob_pk,
        Some(alice_sk.to_bytes()),
        Some(alice_pk),
        true,
    );
    let mut bob = DHRatchet::new_with_role(
        &shared_secret,
        alice_pk,
        Some(bob_sk.to_bytes()),
        Some(bob_pk),
        false,
    );

    let mut enc = alice.encrypt(b"fuzz target", b"auth");

    // Corrupción en ciphertext
    enc.ciphertext[0] ^= 0xFF;
    assert!(
        bob.decrypt(&enc, b"auth").is_err(),
        "Módulo E: El sistema debe rechazar ciphertext corrupto sin pánico"
    );

    // Corrupción en AAD
    enc.ciphertext[0] ^= 0xFF; // restaurar
    assert!(
        bob.decrypt(&enc, b"wrong_auth").is_err(),
        "Módulo E: El sistema debe rechazar AAD inválido sin pánico"
    );
}
