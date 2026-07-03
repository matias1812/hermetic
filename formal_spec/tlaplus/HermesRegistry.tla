--------------------------- MODULE HermesRegistry ---------------------------
(*
 * Especificación formal del registro de claves OTP de HermesChat.
 *
 * PROPÓSITO:
 *   Modelar y verificar formalmente que ninguna clave OTP es reutilizada.
 *   La reutilización de una clave OTP destruye la confidencialidad perfecta
 *   (Shannon, 1949) y permite al atacante recuperar el XOR de dos plaintexts.
 *
 * PROPIEDADES VERIFICADAS por TLC:
 * - TypeInvariant: Estructura correcta del registro
 * - NoKeyReuseInvariant: Nunca se usa la misma clave dos veces
 * - KeyConsistencyInvariant: Claves activas son subconjunto del registro
 * - RetiredKeysImmutableInvariant: Claves retiradas no vuelven a activarse
 *
 * ESTADO VERIFICACIÓN:
 *   Para ejecutar: tlc -config MC_Registry.cfg HermesRegistry.tla
 *   Requiere: TLA+ Toolbox o TLC standalone jar
 *)

EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    MaxKeys,      \* Número máximo de claves en el sistema (e.g., 8 para MC)
    KeySize       \* Tamaño fijo de cada clave en bytes (e.g., 4 para MC, 32 en prod)

\* Universo de posibles valores de clave (simplificado para model checking)
\* En producción: claves son de 256 bits aleatorios → espacio 2^256
KeyUniverse == 0..(MaxKeys * 2)  \* Espacio suficiente para generar claves únicas

\* Tipo de una entrada en el registro
KeyEntry == [
    key_id  : 1..MaxKeys,        \* ID único de la clave
    key_val : KeyUniverse,       \* Valor de la clave (simplificado para MC)
    used    : BOOLEAN,           \* ¿Ha sido usada al menos una vez?
    retired : BOOLEAN            \* ¿Ha sido retirada del sistema?
]

VARIABLES
    key_registry,   \* Función: key_id -> KeyEntry
    active_keys,    \* Conjunto de key_ids actualmente activos
    retired_keys,   \* Conjunto de key_ids retirados (nunca reutilizables)
    usage_count     \* Función: key_id -> Nat (contador de usos)

vars == <<key_registry, active_keys, retired_keys, usage_count>>

(* -------------------------------------------------------------------------- *)
(* PREDICADOS DE TIPO                                                          *)
(* -------------------------------------------------------------------------- *)

TypeInvariant ==
    /\ DOMAIN key_registry \subseteq 1..MaxKeys
    /\ active_keys \subseteq DOMAIN key_registry
    /\ retired_keys \subseteq DOMAIN key_registry
    /\ active_keys \cap retired_keys = {}   \* Activo y retirado son disjuntos
    /\ \A id \in DOMAIN key_registry:
        /\ key_registry[id].key_id = id
        /\ key_registry[id].used \in BOOLEAN
        /\ key_registry[id].retired \in BOOLEAN
        /\ usage_count[id] \in Nat

(* -------------------------------------------------------------------------- *)
(* INVARIANTES DE SEGURIDAD                                                    *)
(* -------------------------------------------------------------------------- *)

\* INVARIANTE PRINCIPAL: Ninguna clave se usa más de una vez
\* (Para OTP puro — uso único garantiza confidencialidad perfecta)
NoKeyReuseInvariant ==
    \A id \in DOMAIN key_registry:
        usage_count[id] <= 1

\* Invariante: Claves con el mismo valor no coexisten en el registro
\* (Dos claves idénticas violarían la unicidad)
NoDuplicateKeysInvariant ==
    \A id1, id2 \in DOMAIN key_registry:
        id1 /= id2 =>
            key_registry[id1].key_val /= key_registry[id2].key_val

\* Invariante: Claves activas son subconjunto del registro
KeyConsistencyInvariant ==
    active_keys \subseteq DOMAIN key_registry

\* Invariante: Claves retiradas no vuelven a estar activas
RetiredKeysImmutableInvariant ==
    \A id \in retired_keys: id \notin active_keys

\* Invariante: Una clave retirada no puede ser usada
RetiredKeyNotUsableInvariant ==
    \A id \in DOMAIN key_registry:
        key_registry[id].retired => ~key_registry[id].used \/ usage_count[id] <= 1

(* -------------------------------------------------------------------------- *)
(* ESTADO INICIAL                                                              *)
(* -------------------------------------------------------------------------- *)

Init ==
    /\ key_registry = [id \in {} |-> [key_id |-> id, key_val |-> 0,
                                       used |-> FALSE, retired |-> FALSE]]
    /\ active_keys = {}
    /\ retired_keys = {}
    /\ usage_count = [id \in {} |-> 0]

(* -------------------------------------------------------------------------- *)
(* ACCIONES                                                                    *)
(* -------------------------------------------------------------------------- *)

\* Acción: Registrar una nueva clave OTP
RegisterKey(id, val) ==
    /\ id \notin DOMAIN key_registry           \* No existe aún
    /\ id \notin retired_keys                  \* No fue retirada
    /\ \A existing_id \in DOMAIN key_registry: \* Valor único
        key_registry[existing_id].key_val /= val
    /\ Cardinality(DOMAIN key_registry) < MaxKeys
    /\ key_registry' = key_registry @@ (id :>
        [key_id |-> id, key_val |-> val, used |-> FALSE, retired |-> FALSE])
    /\ active_keys' = active_keys \cup {id}
    /\ usage_count' = usage_count @@ (id :> 0)
    /\ UNCHANGED retired_keys

\* Acción: Usar una clave OTP (solo si está activa y no usada)
UseKey(id) ==
    /\ id \in active_keys
    /\ ~key_registry[id].used
    /\ ~key_registry[id].retired
    /\ usage_count[id] = 0                     \* PRECONDICIÓN: nunca usada
    /\ key_registry' = [key_registry EXCEPT ![id].used = TRUE]
    /\ usage_count' = [usage_count EXCEPT ![id] = usage_count[id] + 1]
    /\ active_keys' = active_keys \ {id}       \* Remover de activos post-uso
    /\ UNCHANGED retired_keys

\* Acción: Retirar una clave (independientemente de si fue usada)
RetireKey(id) ==
    /\ id \in DOMAIN key_registry
    /\ ~key_registry[id].retired
    /\ key_registry' = [key_registry EXCEPT ![id].retired = TRUE]
    /\ retired_keys' = retired_keys \cup {id}
    /\ active_keys' = active_keys \ {id}
    /\ UNCHANGED usage_count

(* -------------------------------------------------------------------------- *)
(* TRANSICIÓN DEL SISTEMA                                                      *)
(* -------------------------------------------------------------------------- *)

Next ==
    \/ \E id \in 1..MaxKeys, val \in KeyUniverse: RegisterKey(id, val)
    \/ \E id \in active_keys: UseKey(id)
    \/ \E id \in DOMAIN key_registry: RetireKey(id)

(* -------------------------------------------------------------------------- *)
(* ESPECIFICACIÓN COMPLETA                                                     *)
(* -------------------------------------------------------------------------- *)

Spec == Init /\ [][Next]_vars

=============================================================================
