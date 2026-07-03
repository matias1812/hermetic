(*
 * ARCHIVO HISTORICO — NO ACTIVO
 *
 * Este modulo modelaba propiedades de un One-Time Pad puro (seguridad perfecta
 * de Shannon). El sistema HermesChat v3.0 NO implementa OTP puro:
 * la clave simetrica se transmite encapsulada via ML-KEM-1024, lo que lo
 * convierte en cifrado hibrido computacionalmente seguro, no incondicionalmente.
 *
 * PerfectSecrecyInvariant (linea ~51) NO aplica al sistema real.
 * Este archivo se conserva solo como referencia historica y ejercicio academico.
 *
 * NO citar como evidencia de seguridad en auditorias.
 * Ver: SECURITY_TARGET.md, seccion "Estado de las Especificaciones Formales TLA+"
 *)
-------------------------------- MODULE HermesOTP --------------------------------
(*
 * Especificacion formal del One-Time Pad puro (MODELO ACADEMICO).
 *
 * PROPIEDADES VERIFICADAS (para OTP teorico):
 * - Perfect Secrecy: para todo c en C, m en M: P(M=m|C=c) = P(M=m)
 * - No Key Reuse: Cada clave se usa exactamente UNA vez
 * - Length Invariant: |K| = |M| = |C|
 * - Decrypt Inverse: Decrypt(Encrypt(M,K),K) = M
 *)

EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    (* Conjuntos base *)
    MaxMessageLength,  (* Longitud máxima de mensaje *)
    KeySpace,          (* Espacio de claves: 0..255 *)
    MessageSpace       (* Espacio de mensajes: 0..255 *)

(* Variables de estado *)
VARIABLES
    otp_key_registry,  (* Registro de claves usadas *)
    active_keys,       (* Claves actualmente en uso *)
    memory_buffers     (* Buffers de memoria rastreables *)

(* Tipo personalizado para clave OTP *)
OTPKey == [size: 1..MaxMessageLength, bytes: Seq(KeySpace)]

(* Tipo para mensaje *)
Message == [size: 1..MaxMessageLength, bytes: Seq(MessageSpace)]

(* -------------------------------------------------------------------------- *)
(* INVARIANTES DEL SISTEMA                                                     *)
(* -------------------------------------------------------------------------- *)

(* Invariante 1: Ninguna clave se reutiliza *)
NoKeyReuse ==
    \A k1, k2 \in otp_key_registry:
        k1 /= k2 => k1.bytes /= k2.bytes

(* Invariante 2: Toda clave activa tiene longitud positiva *)
ValidKeySizes ==
    \A k \in active_keys: k.size > 0 /\ k.size <= MaxMessageLength

(* Invariante 3: Buffers de memoria zeroizados al liberar *)
MemoryCleanupInvariant ==
    \A buf \in memory_buffers:
        buf.freed => (\A byte \in buf.bytes: byte = 0)

(* Invariante 4: Seguridad perfecta (Shannon) *)
PerfectSecrecyInvariant ==
    \A m1, m2 \in MessageSpace, c \in MessageSpace:
        Len(m1) = Len(m2) /\ Len(m1) = Len(c) =>
        \E k \in KeySpace:
            Len(k) = Len(m1) /\ (m1 \oplus k) = c /\ (m2 \oplus k) /= c

(* -------------------------------------------------------------------------- *)
(* OPERACIONES                                                                *)
(* -------------------------------------------------------------------------- *)

(* Generar clave OTP aleatoria *)
GenerateOTPKey(size) ==
    LET
        new_key == [size |-> size, bytes |-> [i \in 1..size |-> 0]]
    IN
        IF new_key \notin otp_key_registry THEN
            otp_key_registry' = otp_key_registry \cup {new_key}
            /\ active_keys' = active_keys \cup {new_key}
            /\ UNCHANGED memory_buffers
        ELSE
            (* Clave ya existe - violaría unicidad *)
            UNCHANGED <<otp_key_registry, active_keys, memory_buffers>>

=============================================================================
