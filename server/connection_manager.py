"""
WebSocket Connection Manager.

Handles the lifecycle of active WebSocket connections: connecting,
disconnecting, and broadcasting messages to all peers.
"""

import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages active WebSocket connections.

    Thread-safety note: FastAPI runs on a single asyncio event loop,
    so a plain set is safe here — no lock required.
    """

    def __init__(self) -> None:
        self._active_connections: set[WebSocket] = set()

    @property
    def active_count(self) -> int:
        """Return the number of currently connected clients."""
        return len(self._active_connections)

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self._active_connections.add(websocket)
        logger.info(
            "Client connected: %s — Total: %d",
            websocket.client,
            self.active_count,
        )

    def disconnect(self, websocket: WebSocket) -> None:
        """Unregister a WebSocket connection."""
        self._active_connections.discard(websocket)
        logger.info(
            "Client disconnected: %s — Total: %d",
            websocket.client,
            self.active_count,
        )

    async def broadcast(self, message: str, *, exclude: WebSocket | None = None) -> None:
        """
        Send a text message to every connected client.

        Args:
            message: The raw JSON string to broadcast.
            exclude: Optional WebSocket to skip (typically the sender).
        """
        stale: list[WebSocket] = []

        for connection in self._active_connections:
            if connection is exclude:
                continue
            try:
                await connection.send_text(message)
            except Exception:
                logger.warning("Failed to send to %s — marking stale", connection.client)
                stale.append(connection)

        # Clean up any connections that broke mid-broadcast.
        for connection in stale:
            self.disconnect(connection)
