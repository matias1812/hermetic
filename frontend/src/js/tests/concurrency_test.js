import { EncryptedStorageManager } from '../storage_manager.js';

/**
 * Suite extendida de verificación de concurrencia e idempotencia sobre EncryptedStorageManager.unlock().
 * Cubre:
 * 1. Idempotencia real de la guarda de reentrada (_doUnlock corre una sola vez para N llamadas concurrentes).
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

        // BUG real encontrado al automatizar este test (nunca corrió en CI antes): la
        // afirmación original era `p1 === p2` sobre lo que devuelve `storage.unlock(...)`
        // dos veces seguidas. Eso es estructuralmente imposible de cumplir para CUALQUIER
        // `async function` en JS -- cada invocación de una función `async` siempre crea
        // una Promise nueva para esa llamada (aunque internamente ambas awaiteen/retornen
        // la misma promesa interna), así que `p1 !== p2` siempre, sin importar qué tan
        // buena sea la guarda de reentrada de `unlock()`. Lo que sí importa (y sí prueba
        // la idempotencia real) es que `_doUnlock` -- el trabajo pesado de verdad
        // (Argon2/WASM) -- se ejecute UNA sola vez para llamadas concurrentes, no 20.
        let doUnlockCalls = 0;
        const originalDoUnlock = storage._doUnlock.bind(storage);
        storage._doUnlock = (...args) => {
            doUnlockCalls++;
            return originalDoUnlock(...args);
        };

        const p1 = storage.unlock("CorrectSecretKey123!");
        const p2 = storage.unlock("CorrectSecretKey123!");

        // Lanzar 18 promesas adicionales en simultáneo -- las 20 (p1, p2 incluidas) deben
        // compartir la MISMA ejecución de _doUnlock en vuelo, sin awaitear p1/p2 antes
        // (eso resetearía la guarda y invalidaría la prueba de concurrencia real).
        const stressPromises = [p1, p2, ...Array.from({ length: 18 }, () => storage.unlock("CorrectSecretKey123!"))];
        const results = await Promise.all(stressPromises);

        if (doUnlockCalls !== 1) {
            console.error(`❌ [Caso 1 Fallido] _doUnlock se ejecutó ${doUnlockCalls} veces para 20 llamadas concurrentes (se esperaba 1 -- reentrada real).`);
            passedAll = false;
        } else {
            console.log("✅ [Caso 1] _doUnlock ejecutado una sola vez para 20 llamadas concurrentes (idempotencia real verificada).");
        }

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
        // BUG real encontrado al automatizar este test (nunca corría en CI antes): sin
        // esto, este caso heredaba en silencio el user_id que el Caso 1 ya había
        // persistido en sessionStorage (setUserId lo escribe ahí, y el constructor lo
        // relee como fallback) -- "sin setUserId" no bastaba para simular "sin ID de
        // usuario" porque sessionStorage sobrevive entre instancias en la misma sesión,
        // en el navegador real tanto como acá. Limpiar explícitamente antes de este caso
        // es lo que realmente aísla el escenario que el test dice estar probando.
        sessionStorage.removeItem('session_user_id_hash');
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
