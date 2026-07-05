"""
Airwall — WebSocket Message Broker

A lightweight FastAPI server that acts as a real-time message broker.
Tracker clients send drawing events via WebSocket; the server broadcasts
them to all connected Projector clients.
"""

import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from connection_manager import ConnectionManager
from models import DrawMessage

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("airwall")

# ---------------------------------------------------------------------------
# App & CORS
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Airwall Broker",
    version="0.1.0",
    description="Real-time WebSocket message broker for drawing events.",
)

# Allow connections from any local origin (localhost + LAN IPs).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Connection Manager (singleton)
# ---------------------------------------------------------------------------
manager = ConnectionManager()

# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check() -> dict:
    """Simple liveness probe — also reports active connection count."""
    return {
        "status": "ok",
        "connections": manager.active_count,
    }


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------


@app.websocket("/ws/draw")
async def websocket_draw(websocket: WebSocket) -> None:
    """
    Main WebSocket endpoint.

    Flow:
        1. Accept the incoming connection.
        2. Listen for JSON messages from the Tracker.
        3. Validate each message against the DrawMessage schema.
        4. Broadcast valid messages to every *other* connected client.
        5. On disconnect, clean up the connection.
    """
    await manager.connect(websocket)

    try:
        while True:
            raw = await websocket.receive_text()

            # Validate the payload — drop malformed messages silently.
            try:
                message = DrawMessage.model_validate_json(raw)
            except ValidationError as exc:
                logger.warning("Invalid message from %s: %s", websocket.client, exc.error_count())
                await websocket.send_text(
                    '{"error": "Invalid message format"}'
                )
                continue

            # Re-serialize to guarantee a canonical JSON string.
            await manager.broadcast(message.model_dump_json(), exclude=websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        logger.exception("Unexpected error on connection %s", websocket.client)
        manager.disconnect(websocket)
