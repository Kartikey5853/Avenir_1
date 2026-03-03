"""
Custom application exceptions.
"""

class ExternalAPIError(Exception):
    """Raised when an external API (Overpass, etc.) fails after all retries."""
    def __init__(self, service: str, message: str):
        self.service = service
        self.message = message
        super().__init__(f"[{service}] {message}")
