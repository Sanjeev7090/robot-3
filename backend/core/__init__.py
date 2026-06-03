"""core package — exports the DataManager singleton."""
from .data_manager import dm, DataManager, TTLCache

__all__ = ["dm", "DataManager", "TTLCache"]
