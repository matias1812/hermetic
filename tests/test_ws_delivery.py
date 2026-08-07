import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from hermes_backend.network_core.api import BlindWSManager

@pytest.mark.asyncio
async def test_ws_manager_multi_connection_and_disconnect():
    manager = BlindWSManager()
    client_id = "test_user_hash_123"

    ws1 = AsyncMock()
    ws2 = AsyncMock()

    # Connect ws1 and ws2 for same user
    await manager.connect(client_id, ws1)
    await manager.connect(client_id, ws2)

    assert manager.is_user_online(client_id) is True
    assert len(manager.active_connections[client_id]) == 2

    # Disconnect ws1 (e.g. old socket closing)
    manager.disconnect(client_id, ws1)

    # User should STILL be online because ws2 is active!
    assert manager.is_user_online(client_id) is True
    assert ws2 in manager.active_connections[client_id]

    # Test send_blob sends to active socket ws2
    result = await manager.send_blob(client_id, {"type": "relayed_blob", "data": "hello"})
    assert result is True
    ws2.send_text.assert_called_once()

    # Disconnect ws2
    manager.disconnect(client_id, ws2)
    assert manager.is_user_online(client_id) is False
    assert client_id not in manager.active_connections
