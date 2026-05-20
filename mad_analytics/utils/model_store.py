"""Model store — persist and load trained sklearn pipelines via joblib."""
from __future__ import annotations
import os
import joblib
from pathlib import Path
from typing import Any

MODELS_DIR = Path(os.environ.get("MAD_MODELS_DIR", Path(__file__).parent.parent / "models"))
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def save(name: str, obj: Any) -> Path:
    path = MODELS_DIR / f"{name}.joblib"
    joblib.dump(obj, path)
    return path


def load(name: str) -> Any:
    path = MODELS_DIR / f"{name}.joblib"
    if not path.exists():
        raise FileNotFoundError(
            f"Model '{name}' not found at {path}. Run training/train_{name}.py first."
        )
    return joblib.load(path)


def exists(name: str) -> bool:
    return (MODELS_DIR / f"{name}.joblib").exists()
