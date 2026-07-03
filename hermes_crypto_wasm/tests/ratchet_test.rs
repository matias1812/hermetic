use hermes_crypto_wasm::ratchet::dh_ratchet::DHRatchet;
use rand::rngs::OsRng;
use wasm_bindgen_test::*;
use x25519_dalek::{PublicKey, StaticSecret};

#[wasm_bindgen_test]
fn test_ratchet_replay_desync_behavior() {
    let shared_secret = [0x42u8; 32];

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

    let msg0 = alice.encrypt(b"hello 0", b"aad");
    let msg1 = alice.encrypt(b"hello 1", b"aad");

    let dec0 = bob.decrypt(&msg0, b"aad").expect("Bob debe descifrar msg0");
    assert_eq!(dec0, b"hello 0");
    assert_eq!(bob.state.message_number_recv, 1);

    let dec1 = bob.decrypt(&msg1, b"aad").expect("Bob debe descifrar msg1");
    assert_eq!(dec1, b"hello 1");
    assert_eq!(bob.state.message_number_recv, 2);

    // Grab state before replay
    let chain_key_before = bob.state.receiving_chain_key;
    let recv_num_before = bob.state.message_number_recv;

    // Now replay msg0!
    let res_replay = bob.decrypt(&msg0, b"aad");
    assert!(res_replay.is_err(), "Descifrar un replay debe fallar");

    // Check if Bob's state was illegally modified by the replay attempt!
    let chain_key_after = bob.state.receiving_chain_key;
    let recv_num_after = bob.state.message_number_recv;

    assert_eq!(recv_num_before, recv_num_after, "VULNERABILIDAD P2-M3 VERIFICADA: El número de mensaje receptor no debe cambiar al recibir un replay ilegítimo");
    assert_eq!(chain_key_before, chain_key_after, "VULNERABILIDAD P2-M3 VERIFICADA: La cadena de recepción no debe mutar al recibir un replay ilegítimo");
}
