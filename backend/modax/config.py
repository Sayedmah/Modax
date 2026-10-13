import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("MODAX_DATA_DIR", "var")))
    allow_signup: bool = field(default_factory=lambda: os.getenv("MODAX_ALLOW_SIGNUP") == "true")
    demo: bool = field(default_factory=lambda: os.getenv("MODAX_DEMO", "true") == "true")
    session_seconds: int = 86400
    max_body_bytes: int = 262144
    requests_per_minute: int = 120
    provider_url: str = field(default_factory=lambda: os.getenv("MODAX_PROVIDER_URL", ""))
    provider_key: str = field(default_factory=lambda: os.getenv("MODAX_PROVIDER_KEY", ""))
    provider_model: str = field(default_factory=lambda: os.getenv("MODAX_PROVIDER_MODEL", ""))
    ollama_url: str = field(default_factory=lambda: os.getenv("MODAX_OLLAMA_URL", ""))
    ollama_model: str = field(default_factory=lambda: os.getenv("MODAX_OLLAMA_MODEL", ""))
    docker_tests: bool = field(default_factory=lambda: os.getenv("MODAX_DOCKER_TESTS") == "true")
    test_image: str = field(default_factory=lambda: os.getenv("MODAX_TEST_IMAGE", ""))
    godot_binary: str = field(default_factory=lambda: os.getenv("MODAX_GODOT_BINARY", "godot"))
    comfy_url: str = field(default_factory=lambda: os.getenv("MODAX_COMFY_URL", ""))

    def __post_init__(self):
        object.__setattr__(self, "data_dir", Path(self.data_dir).absolute())
        for url in (self.provider_url, self.ollama_url, self.comfy_url):
            if url and not url.startswith(("https://", "http://localhost:", "http://127.0.0.1:")):
                raise ValueError("Provider endpoints require HTTPS or explicit loopback HTTP")
