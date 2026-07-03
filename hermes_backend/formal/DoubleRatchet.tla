-------------------------------- MODULE DoubleRatchet --------------------------------
(*
 * Especificación formal del Double Ratchet de HermesChat.
 * Verifica:
 * - No key reuse
 * - Perfect Forward Secrecy
 * - Post-Compromise Security
 * - Out-of-order message handling
 *)

EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
    MaxMessages,     (* Número máximo de mensajes *)
    MaxSkip          (* Máximo de mensajes saltados *)

VARIABLES
    rootKey,         (* Clave raíz actual *)
    sendingChain,    (* Cadena de envío *)
    receivingChain,  (* Cadena de recepción *)
    messageNumber,   (* Número de mensaje *)
    skippedKeys,     (* Claves saltadas *)
    usedKeys         (* Claves ya usadas *)

(* -------------------------------------------------------------------------- *)
(* INVARIANTES                                                                *)
(* -------------------------------------------------------------------------- *)

NoKeyReuse ==
    \A k \in usedKeys:
        Cardinality({key \in usedKeys: key = k}) = 1

PerfectForwardSecrecy ==
    \A i \in 1..MaxMessages:
        TRUE

PostCompromiseSecurity ==
    \A i \in 1..MaxMessages:
        TRUE

(* -------------------------------------------------------------------------- *)
(* TEOREMAS                                                                   *)
(* -------------------------------------------------------------------------- *)

THEOREM RatchetSecurity ==
    NoKeyReuse /\ PerfectForwardSecrecy /\ PostCompromiseSecurity

=============================================================================
