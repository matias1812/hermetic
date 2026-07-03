use hermes_crypto_wasm::ratchet::dh_ratchet::DHRatchet;
use rand::rngs::OsRng;
use wasm_bindgen_test::*;
use x25519_dalek::{PublicKey, StaticSecret};

#[wasm_bindgen_test]
fn test_dh_ratchet_rotation_success() {
    let shared_secret = [0x55u8; 32];

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

    let alice_dh_initial = alice.state.dh_public;
    let bob_dh_initial = bob.state.dh_public;

    // 1. Alice envía a Bob
    let msg1 = alice.encrypt(b"ping", b"");
    bob.decrypt(&msg1, b"").unwrap();

    // 2. Bob responde a Alice
    let msg2 = bob.encrypt(b"pong", b"");
    alice.decrypt(&msg2, b"").unwrap();

    // 3. Alice responde a Bob
    let msg3 = alice.encrypt(b"ping 2", b"");
    bob.decrypt(&msg3, b"").unwrap();

    // Verificamos si las claves públicas DH cambiaron tras un ping-pong completo
    let alice_dh_after = alice.state.dh_public;
    let bob_dh_after = bob.state.dh_public;

    assert_ne!(alice_dh_initial, alice_dh_after, "FASE 5 VERIFICADA: Alice rota su clave DH pública tras recibir respuesta y contestar en el ping-pong");
    assert_ne!(
        bob_dh_initial, bob_dh_after,
        "FASE 5 VERIFICADA: Bob rota su clave DH pública al responder en el intercambio ping-pong"
    );
}
