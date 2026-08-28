#![no_main]

use libfuzzer_sys::fuzz_target;
use hermes_crypto_wasm::core_api::HermesCore;
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
    // The current API might just require initializing and feeding data to stress the parsing.
    let mut core = HermesCore::new();
    
    // Ignore result of session init (it will fail, but we just want to stress the parser)
    // There is no SessionInitOptions in the root anymore, we will just fuzz decrypt_message.
    let _ = core.decrypt_message("dummy_session", data); // Fuzz with random payload
});
