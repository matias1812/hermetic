#![no_main]

use libfuzzer_sys::fuzz_target;
use hermes_crypto_wasm::{HermesCore, SessionInitOptions};
use std::sync::Once;

static INIT: Once = Once::new();

fuzz_target!(|data: &[u8]| {
    INIT.call_once(|| {
        // En un fuzzer real podríamos configurar logs mínimos o similares
    });
    
    // We don't want to crash on standard library panics due to length, we want to fuzz the logic.
    // If the data is too small, just return.
    if data.len() < 32 {
        return;
    }

    // Try to parse the payload as JSON to attack the deserialize methods, or just feed it directly.
    // Let's create a dummy HermesCore state.
    let options = SessionInitOptions {
        remote_ik_public: vec![0; 32],
        remote_spk_public: vec![0; 32],
        remote_spk_signature: vec![0; 64],
        remote_pq_kem_public: vec![0; 1184],
    };
    
    // As we can't fully establish a session without valid signatures, we will try to feed
    // random mutated bytes into the parser.
    let mut core = HermesCore::new(vec![0; 32], vec![0; 32], vec![0; 32], vec![0; 1184]);
    // Ignore result of session init (it will fail, but we just want to stress the parser)
    let _ = core.init_session(options);
    
    // Attack the decrypt method
    let _ = core.decrypt_message(data.to_vec(), vec![0; 16]); // Fuzz with random payload, dummy nonce
});
