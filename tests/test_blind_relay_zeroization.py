"""
Antes: BlindRelay guardaba encrypted_data como bytes (inmutable). _destroy_blob()
copiaba a un bytearray temporal, zeroizaba SOLO la copia, y la descartaba — el
bytes() original (el ciphertext real) nunca se sobrescribía en memoria, pese a que
el log decía "zeroized and destroyed". Ahora se guarda como bytearray real y se
zeroiza en sitio. Esto también podía romper fetch_blobs_for_receiver si no se
copiaba ANTES de destruir (el receptor recibiría puros ceros) — se prueba eso.
"""
import asyncio
import unittest

from hermes_backend.network_core.blind_relay import BlindRelay


class TestBlindRelayZeroization(unittest.TestCase):
    def test_fetch_returns_real_data_not_zeros(self):
        async def run():
            relay = BlindRelay(ttl_seconds=300)
            payload = bytearray(b"\xAA\xBB\xCC\xDD" * 8)
            await relay.relay_blob("sender_hash", "receiver_hash", payload)

            retrieved = await relay.fetch_blobs_for_receiver("receiver_hash")
            self.assertEqual(len(retrieved), 1)
            self.assertEqual(retrieved[0]["encrypted_data"], bytes(payload))
            self.assertNotEqual(retrieved[0]["encrypted_data"], b"\x00" * 32)

            # El blob debe haber sido destruido del store tras la entrega
            self.assertEqual(relay.pending_blobs, {})

        asyncio.run(run())

    def test_destroy_actually_zeroizes_the_stored_bytearray(self):
        async def run():
            relay = BlindRelay(ttl_seconds=300)
            payload = bytearray(b"\x11\x22\x33\x44" * 8)
            blob_id = await relay.relay_blob("sender_hash", "receiver_hash", payload)

            # Capturamos la referencia interna ANTES de destruir, para probar que el
            # buffer real (no una copia) queda en ceros.
            internal_ref = relay.pending_blobs[blob_id]["encrypted_data"]
            self.assertIsInstance(internal_ref, bytearray)
            self.assertNotEqual(bytes(internal_ref), b"\x00" * 32)

            await relay._destroy_blob(blob_id)

            self.assertEqual(bytes(internal_ref), b"\x00" * 32)  # mismo objeto, ahora en ceros
            self.assertNotIn(blob_id, relay.pending_blobs)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
