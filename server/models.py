"""
Pydantic models for WebSocket message validation.
"""

from enum import Enum

from pydantic import BaseModel


class DrawState(str, Enum):
    """Possible states for a drawing event."""

    DRAW = "DRAW"
    ERASE = "ERASE"
    IDLE = "IDLE"


class DrawMessage(BaseModel):
    """
    Message schema received from the Tracker client via WebSocket.

    Attributes:
        x: Horizontal coordinate (normalized 0.0–1.0 or pixel value).
        y: Vertical coordinate (normalized 0.0–1.0 or pixel value).
        state: Current drawing state — DRAW, ERASE, or IDLE.
    """

    x: float
    y: float
    state: DrawState
