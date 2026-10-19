import pytest
from fastapi.testclient import TestClient
from modax.api import create_app
from modax.config import Settings


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, allow_signup=True))) as c:
        yield c
