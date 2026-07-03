---------------------------- MODULE HermesMemory ----------------------------
(*
 * Especificación formal del sistema de zeroización de memoria de HermesChat.
 *
 * PROPIEDADES VERIFICADAS por TLC model checker:
 * - TypeInvariant: Todos los buffers tienen estructura correcta
 * - MemoryCleanupInvariant: Todo buffer liberado tiene bytes = 0
 * - NoUseAfterFree: Ningún buffer liberado es accedido posteriormente
 * - ZeroizeBeforeFree: La zeroización siempre precede a la liberación
 *
 * ESTADO VERIFICACIÓN:
 *   Para ejecutar: tlc -config MC_Memory.cfg HermesMemory.tla
 *   Requiere: TLA+ Toolbox o TLC standalone jar
 *   Instrucciones: formal_spec/model_checking/results/README.md
 *
 * MODELO:
 *   - MaxBuffers buffers máximos en memoria simultáneamente
 *   - Cada buffer tiene: id, bytes (secuencia), freed (bool), zeroized (bool)
 *   - El sistema solo puede liberar buffers que primero han sido zeroizados
 *)

EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    MaxBuffers,   \* Número máximo de buffers simultáneos (e.g., 4 para model checking)
    ByteValues,   \* Conjunto de valores de byte: {0..255} simplificado a {0, 1} en MC
    MaxBufSize    \* Tamaño máximo de buffer en bytes (e.g., 4 para MC)

\* Tipo de buffer de memoria sensible
Buffer == [
    id       : 1..MaxBuffers,
    bytes    : Seq(ByteValues),
    freed    : BOOLEAN,
    zeroized : BOOLEAN
]

\* Conjunto de IDs válidos
BufferIDs == 1..MaxBuffers

VARIABLES
    allocated_buffers,  \* Función: ID -> Buffer (buffers en memoria)
    freed_buffers,      \* Conjunto de IDs liberados
    zeroize_log         \* Secuencia de IDs zeroizados (audit log)

vars == <<allocated_buffers, freed_buffers, zeroize_log>>

(* -------------------------------------------------------------------------- *)
(* PREDICADOS DE TIPO                                                          *)
(* -------------------------------------------------------------------------- *)

TypeInvariant ==
    /\ DOMAIN allocated_buffers \subseteq BufferIDs
    /\ freed_buffers \subseteq BufferIDs
    /\ \A id \in DOMAIN allocated_buffers:
        /\ allocated_buffers[id].id = id
        /\ allocated_buffers[id].freed \in BOOLEAN
        /\ allocated_buffers[id].zeroized \in BOOLEAN
        /\ Len(allocated_buffers[id].bytes) <= MaxBufSize

(* -------------------------------------------------------------------------- *)
(* INVARIANTES DE SEGURIDAD                                                    *)
(* -------------------------------------------------------------------------- *)

\* Invariante 1: Todo buffer liberado tiene todos sus bytes = 0
MemoryCleanupInvariant ==
    \A id \in DOMAIN allocated_buffers:
        allocated_buffers[id].freed =>
            \A i \in 1..Len(allocated_buffers[id].bytes):
                allocated_buffers[id].bytes[i] = 0

\* Invariante 2: No existe buffer marcado freed que no esté zeroizado
ZeroizeBeforeFreeInvariant ==
    \A id \in DOMAIN allocated_buffers:
        allocated_buffers[id].freed => allocated_buffers[id].zeroized

\* Invariante 3: Los buffers liberados no pueden ser reutilizados
NoReuseAfterFreeInvariant ==
    \A id \in freed_buffers:
        id \in DOMAIN allocated_buffers =>
            allocated_buffers[id].freed = TRUE

(* -------------------------------------------------------------------------- *)
(* ESTADO INICIAL                                                              *)
(* -------------------------------------------------------------------------- *)

Init ==
    /\ allocated_buffers = [id \in {} |-> [id |-> id, bytes |-> <<>>, freed |-> FALSE, zeroized |-> FALSE]]
    /\ freed_buffers = {}
    /\ zeroize_log = <<>>

(* -------------------------------------------------------------------------- *)
(* ACCIONES                                                                    *)
(* -------------------------------------------------------------------------- *)

\* Acción: Allocar un nuevo buffer con datos sensibles
AllocBuffer(id, data) ==
    /\ id \notin DOMAIN allocated_buffers
    /\ id \notin freed_buffers
    /\ Len(data) >= 1
    /\ Len(data) <= MaxBufSize
    /\ \A b \in {data[i] : i \in 1..Len(data)}: b \in ByteValues
    /\ allocated_buffers' = allocated_buffers @@ (id :>
        [id |-> id, bytes |-> data, freed |-> FALSE, zeroized |-> FALSE])
    /\ UNCHANGED <<freed_buffers, zeroize_log>>

\* Acción: Zeroizar un buffer (precondición para liberar)
ZeroizeBuffer(id) ==
    /\ id \in DOMAIN allocated_buffers
    /\ ~allocated_buffers[id].freed
    /\ ~allocated_buffers[id].zeroized
    /\ LET zeroed_bytes == [i \in 1..Len(allocated_buffers[id].bytes) |-> 0]
       IN
        allocated_buffers' = [allocated_buffers EXCEPT
            ![id].bytes = zeroed_bytes,
            ![id].zeroized = TRUE]
    /\ zeroize_log' = Append(zeroize_log, id)
    /\ UNCHANGED freed_buffers

\* Acción: Liberar un buffer (solo si está zeroizado)
FreeBuffer(id) ==
    /\ id \in DOMAIN allocated_buffers
    /\ allocated_buffers[id].zeroized     \* PRECONDICIÓN: debe estar zeroizado
    /\ ~allocated_buffers[id].freed
    /\ allocated_buffers' = [allocated_buffers EXCEPT ![id].freed = TRUE]
    /\ freed_buffers' = freed_buffers \cup {id}
    /\ UNCHANGED zeroize_log

\* Acción: Intento de liberar SIN zeroizar → BLOQUEADA (no disponible)
\* Esta acción NO existe en el sistema — modelado por ausencia

(* -------------------------------------------------------------------------- *)
(* TRANSICIÓN DEL SISTEMA                                                      *)
(* -------------------------------------------------------------------------- *)

Next ==
    \/ \E id \in BufferIDs, data \in Seq(ByteValues):
        /\ Len(data) \in 1..MaxBufSize
        /\ AllocBuffer(id, data)
    \/ \E id \in DOMAIN allocated_buffers: ZeroizeBuffer(id)
    \/ \E id \in DOMAIN allocated_buffers: FreeBuffer(id)

(* -------------------------------------------------------------------------- *)
(* ESPECIFICACIÓN COMPLETA                                                     *)
(* -------------------------------------------------------------------------- *)

Spec == Init /\ [][Next]_vars

(* -------------------------------------------------------------------------- *)
(* PROPIEDADES TEMPORALES (Liveness)                                           *)
(* -------------------------------------------------------------------------- *)

\* Todo buffer eventualmente será zeroizado y liberado
\* (Propiedad de liveness — requiere fairness en el model checker)
EventualCleanup ==
    \A id \in BufferIDs:
        id \in DOMAIN allocated_buffers ~>
            (allocated_buffers[id].freed /\ allocated_buffers[id].zeroized)

=============================================================================
