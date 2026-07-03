#![no_main]
use libfuzzer_sys::fuzz_target;
use hermes_crypto_wasm::core_api::HermesCore;

fuzz_target!(|data: &[u8]| {
    // 1. Intentamos convertir la basura binaria en un String UTF-8 (simulando JSON malformado)
    if let Ok(handshake_json) = std::str::from_utf8(data) {
        let mut core = HermesCore::new();
        
        // 2. Inicializamos secretos locales necesarios para el apretón de manos
        let _ = core.generate_prekey_bundle(Some("fuzz_opk".to_string()));
        
        // 3. Inyectamos la carga anómala (fuzzing) en el analizador criptográfico.
        // Esperamos que la función NO haga panic, sino que devuelva `false` (Fail-Closed).
        core.accept_session_handshake("fuzz_contact", handshake_json);
    }
});
