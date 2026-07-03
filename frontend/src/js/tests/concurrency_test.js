import { EncryptedStorageManager } from '../storage_manager.js';

/**
 * Suite extendida de verificación de concurrencia e idempotencia sobre EncryptedStorageManager.unlock().
 * Cubre:
 * 1. Igualdad estricta de promesas en vuelo (p1 === p2).
 * 2. Estrés de concurrencia masiva (20 llamadas simultáneas en Promise.all).
 * 3. Limpieza y reinicio correcto de _unlockPromise tras fallo de autenticación.
 */
export async function runConcurrencyTest() {
    console.log("[Test Suite] Iniciando verificación extendida de concurrencia en EncryptedStorageManager...");
    let passedAll = true;

    // Caso 1: Igualdad de promesas y estrés de concurrencia (20x simultáneos)
    try {
        console.log("   --> Ejecutando Caso 1: Estrés de concurrencia masiva (20x simultáneos) e igualdad de promesas...");
        const storage = new EncryptedStorageManager();
        storage.setUserId("test_stress_hash_64_chars_dummy_hex_value_0123456789abcdef012345");

        const p1 = storage.unlock("CorrectSecretKey123!");
        const p2 = storage.unlock("CorrectSecretKey123!");

        if (p1 !== p2) {
            console.error("❌ [Caso 1 Fallido] p1 y p2 no son la misma instancia de Promise en vuelo.");
            passedAll = false;
        } else {
            console.log("✅ [Caso 1] p1 === p2 verificado (idempotencia estricta en vuelo).");
        }

        // Lanzar 18 promesas adicionales en simultáneo
        const stressPromises = [p1, p2, ...Array.from({ length: 18 }, () => storage.unlock("CorrectSecretKey123!"))];
        const results = await Promise.all(stressPromises);

        const allTrue = results.every(res => res === true);
        if (allTrue && results.length === 20) {
            console.log("✅ [Caso 1 Exitoso] 20 llamadas simultáneas resueltas sin error Wasm aliasing ni reentrada.");
        } else {
            console.error("❌ [Caso 1 Fallido] Al menos una llamada retornó false o falló:", results);
            passedAll = false;
        }
    } catch (err) {
        console.error("❌ [Caso 1 Fallido] Excepción durante estrés de concurrencia:", err);
        passedAll = false;
    }

    // Caso 2: Recuperación y reinicio del guard tras fallo
    try {
        console.log("   --> Ejecutando Caso 2: Limpieza de _unlockPromise tras fallo...");
        const storageErr = new EncryptedStorageManager();
        // Sin setUserId provocará error en _doUnlock
        
        let threwError = false;
        try {
            await storageErr.unlock("AnyPass");
        } catch (e) {
            threwError = true;
        }

        if (!threwError) {
            console.error("❌ [Caso 2 Fallido] Se esperaba error al desbloquear sin ID de usuario definido.");
            passedAll = false;
        } else if (storageErr._unlockPromise !== null) {
            console.error("❌ [Caso 2 Fallido] _unlockPromise no se restableció a null tras la excepción.");
            passedAll = false;
        } else {
            console.log("✅ [Caso 2 Exitoso] _unlockPromise restablecido a null tras la excepción (bloque finally verificado).");
        }
    } catch (err) {
        console.error("❌ [Caso 2 Fallido] Error inesperado en test de recuperación:", err);
        passedAll = false;
    }

    if (passedAll) {
        console.log("🎉 [Suite Completa] Todos los tests de concurrencia y recuperación superados con éxito.");
    }
    return passedAll;
}
