import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def test_health():
    assert TestClient(main.app).get("/health").json() == {"status": "ok"}
