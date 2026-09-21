"""Configuration, loaded once from the environment."""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Config:
    nebius_api_key: str
    tavily_api_key: str | None

    base_url: str
    model_agent: str
    model_intent: str
    model_judge: str

    base_image: str

    max_tokens_per_run: int
    max_usd_per_run: float
    max_steps: int

    db_path: str

    # Feature 1 — self-refining loop
    refine_threshold: float
    max_refine_iterations: int

    @classmethod
    def load(cls) -> "Config":
        key = os.getenv("NEBIUS_API_KEY", "").strip()
        if not key:
            raise ConfigError(
                "NEBIUS_API_KEY is not set. Copy .env.example to .env and fill it in. "
                "Get a key at https://tokenfactory.nebius.com"
            )
        tavily = os.getenv("TAVILY_API_KEY", "").strip() or None
        return cls(
            nebius_api_key=key,
            tavily_api_key=tavily,
            base_url=os.getenv("BR_BASE_URL", "https://api.tokenfactory.nebius.com/v1/"),
            model_agent=os.getenv("BR_MODEL_AGENT", "nvidia/nemotron-3-ultra-550b-a55b"),
            model_intent=os.getenv("BR_MODEL_INTENT", "nvidia/nemotron-3-nano-30b"),
            model_judge=os.getenv("BR_MODEL_JUDGE", "nvidia/nemotron-3-super-120b-a12b"),
            base_image=os.getenv("BR_BASE_IMAGE", "ubuntu:24.04"),
            max_tokens_per_run=int(os.getenv("BR_MAX_TOKENS_PER_RUN", "400000")),
            max_usd_per_run=float(os.getenv("BR_MAX_USD_PER_RUN", "0.75")),
            max_steps=int(os.getenv("BR_MAX_STEPS", "20")),
            db_path=os.getenv("BR_DB_PATH", "blastradius.db"),
            refine_threshold=float(os.getenv("REFINE_THRESHOLD", "0.35")),
            max_refine_iterations=int(os.getenv("MAX_REFINE_ITERATIONS", "3")),
        )


CONFIG = Config.load()
