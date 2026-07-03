use hermes_crypto_wasm::core_api::HermesCore;
use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn test_encrypt_decrypt_backup_roundtrip() {
    let mut core = HermesCore::new();

    let result_before_unlock = core.encrypt_backup(b"test data");
    assert!(
        result_before_unlock.is_err(),
        "Debe fallar si la bóveda está bloqueada"
    );

    let salt_hex = core.generate_vault_salt();
    assert!(core.unlock_vault("password_dummy", &salt_hex));

    let plaintext = b"Hello Hermes Backup Data! This is a test of the AEAD HKDF system.";

    let ciphertext = core.encrypt_backup(plaintext).expect("Falló el cifrado");

    // Longitud = 10 (magic) + 16 (salt) + 24 (nonce) + plaintext.len() + 16 (tag)
    assert_eq!(ciphertext.len(), 10 + 16 + 24 + plaintext.len() + 16);

    assert_eq!(&ciphertext[..10], b"HERMESBK\x01\x02");

    // Descifrar con sesión desbloqueada (opt_password = None)
    let decrypted = core
        .decrypt_backup(&ciphertext, None)
        .expect("Falló el descifrado");
    assert_eq!(
        decrypted, plaintext,
        "El texto descifrado debe coincidir con el original"
    );

    // Descifrar con password explícito (simulando restauración externa)
    let decrypted_pwd = core
        .decrypt_backup(&ciphertext, Some("password_dummy".to_string()))
        .expect("Falló el descifrado con pwd");
    assert_eq!(decrypted_pwd, plaintext);
}

#[wasm_bindgen_test]
fn test_decrypt_backup_tamper_detection() {
    let mut core = HermesCore::new();
    let salt_hex = core.generate_vault_salt();
    core.unlock_vault("password_dummy", &salt_hex);

    let plaintext = b"Sensitive backup information";
    let mut ciphertext = core.encrypt_backup(plaintext).expect("Falló el cifrado");

    let last_idx = ciphertext.len() - 1;
    ciphertext[last_idx] ^= 0x01; // flip last bit (MAC o ciphertext)

    let decrypt_result = core.decrypt_backup(&ciphertext, None);
    assert!(
        decrypt_result.is_err(),
        "Debe fallar si los datos fueron alterados"
    );
}

#[wasm_bindgen_test]
fn test_encrypt_backup_random_nonce() {
    let mut core = HermesCore::new();
    let salt_hex = core.generate_vault_salt();
    core.unlock_vault("password_dummy", &salt_hex);

    let plaintext = b"Same message twice";

    let ciphertext1 = core.encrypt_backup(plaintext).unwrap();
    let ciphertext2 = core.encrypt_backup(plaintext).unwrap();

    assert_ne!(ciphertext1, ciphertext2, "Ciphertexts deben ser distintos");

    let dec1 = core.decrypt_backup(&ciphertext1, None).unwrap();
    let dec2 = core.decrypt_backup(&ciphertext2, None).unwrap();
    assert_eq!(
        dec1, dec2,
        "Ambos ciphertexts deben descifrar al mismo plaintext"
    );
}

#[wasm_bindgen_test]
fn test_decrypt_backup_wrong_password() {
    let mut core = HermesCore::new();
    let salt_hex = core.generate_vault_salt();
    core.unlock_vault("password_dummy", &salt_hex);

    let plaintext = b"Top Secret Data";
    let ciphertext = core.encrypt_backup(plaintext).unwrap();

    let decrypt_result = core.decrypt_backup(&ciphertext, Some("wrong_password".to_string()));
    assert!(
        decrypt_result.is_err(),
        "Debe fallar si se restaura con password incorrecto"
    );
}
