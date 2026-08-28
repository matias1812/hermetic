// Verifica en runtime real (wasm-pack test --node) que la migración de
// Key/Nonce::from_slice (deprecado) a TryFrom en core_api.rs/lib.rs no cambió el
// comportamiento de ninguna de las 5 funciones tocadas: siguen produciendo el mismo
// resultado (round-trip correcto) y siguen fallando cerrado (JsValue::Err, no panic)
// ante longitudes de clave/nonce inválidas -- antes esto último panicaba en el
// caso de datos que vienen de fuera (seal_for_contact/open_from_contact,
// decrypt_legacy_payload), ver BACKLOG.md.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use hermes_crypto_wasm::core_api::HermesCore;
use hermes_crypto_wasm::HermesEngineWasm;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn test_seal_open_from_contact_roundtrip() {
    let core = HermesCore::new();
    let identity_json = core
        .generate_identity_keys()
        .expect("keygen debe funcionar");
    let identity: serde_json::Value = serde_json::from_str(&identity_json).unwrap();
    let kyber_pk_hex = identity["kyber_pk_hex"].as_str().unwrap();
    let kyber_sk_hex = identity["kyber_sk_hex"].as_str().unwrap();

    let plaintext = b"mensaje real de prueba post-migracion TryFrom";
    let sealed_json = core
        .seal_for_contact(kyber_pk_hex, plaintext)
        .expect("seal_for_contact debe funcionar con Key/Nonce::try_from");

    let opened = core
        .open_from_contact(kyber_sk_hex, &sealed_json)
        .expect("open_from_contact debe descifrar lo que seal_for_contact selló");

    assert_eq!(
        opened, plaintext,
        "el plaintext debe sobrevivir el roundtrip intacto"
    );
}

#[wasm_bindgen_test]
fn test_open_from_contact_wrong_key_fails_closed_not_panic() {
    let core = HermesCore::new();
    let identity_json = core.generate_identity_keys().unwrap();
    let identity: serde_json::Value = serde_json::from_str(&identity_json).unwrap();
    let kyber_pk_hex = identity["kyber_pk_hex"].as_str().unwrap();

    let other_identity_json = core.generate_identity_keys().unwrap();
    let other_identity: serde_json::Value = serde_json::from_str(&other_identity_json).unwrap();
    let wrong_sk_hex = other_identity["kyber_sk_hex"].as_str().unwrap();

    let sealed_json = core.seal_for_contact(kyber_pk_hex, b"secreto").unwrap();

    // Con la clave de decapsulacion equivocada, debe fallar con Err (fail-closed),
    // nunca panicar ni devolver texto plano incorrecto.
    let result = core.open_from_contact(wrong_sk_hex, &sealed_json);
    assert!(
        result.is_err(),
        "abrir con la llave equivocada debe fallar, no panicar"
    );
}

#[wasm_bindgen_test]
fn test_decrypt_group_ephemeral_image_roundtrip_and_bad_lengths() {
    let core = HermesCore::new();

    // Cifrar directamente con aes_gcm (fuera de HermesCore) para simular exactamente
    // lo que el servidor le devuelve al cliente: clave/nonce/ciphertext en hex.
    let key_bytes = [0x42u8; 32];
    let nonce_bytes = [0x24u8; 12];
    let plaintext = b"data:image/png;base64,AAAA";

    let key = Key::<Aes256Gcm>::try_from(key_bytes.as_slice()).unwrap();
    let nonce = Nonce::try_from(nonce_bytes.as_slice()).unwrap();
    let cipher = Aes256Gcm::new(&key);
    let ciphertext = cipher.encrypt(&nonce, plaintext.as_slice()).unwrap();

    let key_hex = hex::encode(key_bytes);
    let nonce_hex = hex::encode(nonce_bytes);
    let ciphertext_hex = hex::encode(&ciphertext);

    let decrypted = core
        .decrypt_group_ephemeral_image(&key_hex, &nonce_hex, &ciphertext_hex)
        .expect("debe descifrar correctamente con clave/nonce validos");
    assert_eq!(decrypted, plaintext);

    // Longitud de clave invalida (31 bytes en vez de 32) -> Err explicito, ya
    // capturado por el chequeo de longitud existente ANTES de llegar a Key::try_from,
    // pero confirma que el camino sigue fail-closed tras la migracion.
    let short_key_hex = hex::encode([0x42u8; 31]);
    let err = core.decrypt_group_ephemeral_image(&short_key_hex, &nonce_hex, &ciphertext_hex);
    assert!(
        err.is_err(),
        "clave de 31 bytes debe rechazarse, no panicar"
    );
}

#[wasm_bindgen_test]
fn test_legacy_payload_roundtrip_and_bad_nonce_length_fails_closed() {
    let crypto = HermesEngineWasm::new();
    let session_key_hex = "deadbeef";

    let encrypted = crypto
        .encrypt_legacy_payload("hola mundo", session_key_hex, "alice", "bob")
        .expect("encrypt_legacy_payload debe funcionar con Key::try_from");

    let decrypted = crypto
        .decrypt_legacy_payload(&encrypted, session_key_hex)
        .expect("decrypt_legacy_payload debe descifrar lo que encrypt_legacy_payload genero");
    assert_eq!(decrypted, "hola mundo");

    // aes_nonce con longitud invalida (no 12 bytes) provisto desde "afuera" (simulando
    // un payload manipulado/corrupto) -- ANTES de la migracion esto panicaba dentro de
    // Nonce::from_slice; ahora debe devolver Err limpio.
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(
        &obj,
        &wasm_bindgen::JsValue::from_str("aes_nonce"),
        &wasm_bindgen::JsValue::from_str("aabbcc"),
    )
    .unwrap();
    js_sys::Reflect::set(
        &obj,
        &wasm_bindgen::JsValue::from_str("wrapped_otp_key"),
        &wasm_bindgen::JsValue::from_str("aabbcc"),
    )
    .unwrap();
    js_sys::Reflect::set(
        &obj,
        &wasm_bindgen::JsValue::from_str("sender_id"),
        &wasm_bindgen::JsValue::from_str("alice"),
    )
    .unwrap();
    js_sys::Reflect::set(
        &obj,
        &wasm_bindgen::JsValue::from_str("receiver_id"),
        &wasm_bindgen::JsValue::from_str("bob"),
    )
    .unwrap();
    js_sys::Reflect::set(
        &obj,
        &wasm_bindgen::JsValue::from_str("timestamp"),
        &wasm_bindgen::JsValue::from_f64(0.0),
    )
    .unwrap();

    let bad_nonce_result = crypto.decrypt_legacy_payload(&obj.into(), session_key_hex);
    assert!(
        bad_nonce_result.is_err(),
        "nonce de 3 bytes debe rechazarse limpio, no panicar"
    );
}
