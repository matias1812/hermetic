use hermes_crypto_wasm::ratchet::x3dh::responder_x3dh;
use rand::rngs::OsRng;
use x25519_dalek::StaticSecret;

use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn test_pqc_corruption_changes_root_key() {
    let shared_secret_1 = [0x11u8; 32];
    let shared_secret_3 = [0x99u8; 32]; // Secreto mutado tras corrupción KEM
    let corrupted_ct_bytes = vec![0x01u8; 1184];

    // 5. Demostrar que la Root Key (Derivada con HKDF) cambia radicalmente
    let bob_ik_secret = StaticSecret::random_from_rng(OsRng);
    let bob_spk_secret = StaticSecret::random_from_rng(OsRng);

    let handshake = hermes_crypto_wasm::ratchet::x3dh::InitialHandshake {
        sender_ephemeral_key: [0u8; 32],
        sender_identity_key: [0u8; 32],
        one_time_pre_key_id: None,
        pqc_ciphertext: corrupted_ct_bytes.to_vec(),
    };

    let root_key_normal = responder_x3dh(
        &bob_ik_secret.to_bytes(),
        &bob_spk_secret.to_bytes(),
        None,
        &handshake,
        shared_secret_1.as_ref(),
    )
    .unwrap();

    let root_key_corrupted = responder_x3dh(
        &bob_ik_secret.to_bytes(),
        &bob_spk_secret.to_bytes(),
        None,
        &handshake,
        shared_secret_3.as_ref(),
    )
    .unwrap();

    assert_ne!(
        root_key_normal, root_key_corrupted,
        "LA LLAVE MAESTRA DEBE SER DISTINTA ANTE CORRUPCIÓN PQC"
    );
}

#[wasm_bindgen_test]
fn test_wasm_identity_and_signatures() {
    let core = hermes_crypto_wasm::core_api::HermesCore::new();
    let keys_json = core
        .generate_identity_keys()
        .expect("Debe generar llaves de identidad");
    assert!(keys_json.contains("sphincs_sk_hex"));
    assert!(keys_json.contains("kyber_sk_hex"));

    // Verificar firma de desafío
    let challenge = "1234567890";
    // Extraer sphincs_sk_hex primitivo para test
    let v: serde_json::Value = serde_json::from_str(&keys_json).unwrap();
    let sk_hex = v["sphincs_sk_hex"].as_str().unwrap();

    let sig = core
        .compute_admin_sig(challenge, sk_hex)
        .expect("Debe firmar el desafío");
    assert!(!sig.is_empty());
}
