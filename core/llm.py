"""
Token Factory client with a hard budget guard.

Everything that talks to a model goes through here. There is exactly one reason
this file exists beyond convenience: a runaway agent loop against a 1M-context
model is the only realistic way to destroy $50 of hackathon credits, and this is
where that is made impossible.
"""
from __future__ import annotations

import json
import random
import re
import time
from dataclasses import dataclass, field

from openai import OpenAI
from openai import APIStatusError, APIConnectionError, RateLimitError

from core.config import CONFIG

# USD per 1,000,000 tokens (input, output).
# Confirm against https://tokenfactory.nebius.com — `make models` lists what your
# account can actually see. Unknown models fall back to the most expensive tier,
# which fails safe: the budget guard trips early rather than late.
PRICES: dict[str, tuple[float, float]] = {
    "nvidia/nemotron-3-nano-30b": (0.06, 0.24),
    "nvidia/nemotron-3-super-120b-a12b": (0.30, 0.90),
    "nvidia/nemotron-3-ultra-550b-a55b": (1.00, 3.00),
}
_FALLBACK_PRICE = (1.00, 3.00)

_client = OpenAI(base_url=CONFIG.base_url, api_key=CONFIG.nebius_api_key)


class BudgetExceeded(RuntimeError):
    """Raised when a run exhausts its token or dollar ceiling."""


@dataclass
class Budget:
    """Per-run spend accounting. One instance per Run."""
    max_tokens: int = CONFIG.max_tokens_per_run
    max_usd: float = CONFIG.max_usd_per_run
    tokens_in: int = 0
    tokens_out: int = 0
    usd: float = 0.0
    calls: int = 0
    by_model: dict[str, dict] = field(default_factory=dict)

    def charge(self, model: str, tin: int, tout: int) -> None:
        pin, pout = PRICES.get(model, _FALLBACK_PRICE)
        cost = (tin / 1_000_000) * pin + (tout / 1_000_000) * pout
        self.tokens_in += tin
        self.tokens_out += tout
        self.usd += cost
        self.calls += 1
        slot = self.by_model.setdefault(model, {"calls": 0, "tokens_in": 0, "tokens_out": 0, "usd": 0.0})
        slot["calls"] += 1
        slot["tokens_in"] += tin
        slot["tokens_out"] += tout
        slot["usd"] += cost

        if self.tokens_in + self.tokens_out > self.max_tokens:
            raise BudgetExceeded(
                f"token ceiling hit: {self.tokens_in + self.tokens_out} > {self.max_tokens}"
            )
        if self.usd > self.max_usd:
            raise BudgetExceeded(f"cost ceiling hit: ${self.usd:.4f} > ${self.max_usd:.2f}")

    def snapshot(self) -> dict:
        return {
            "calls": self.calls,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "usd": round(self.usd, 6),
            "by_model": {k: {**v, "usd": round(v["usd"], 6)} for k, v in self.by_model.items()},
        }


def chat(
    model: str,
    messages: list[dict],
    budget: Budget,
    *,
    tools: list[dict] | None = None,
    temperature: float = 0.0,
    max_tokens: int = 1500,
    max_retries: int = 5,
):
    """One chat completion, charged to `budget`, with backoff on 429/5xx.

    Token Factory rate limits are dynamic rather than tiered: a cold account that
    fans out wide will get 429s. Keep concurrency <= 8 and let this retry.
    """
    last: Exception | None = None
    for attempt in range(max_retries):
        try:
            kwargs: dict = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"
            resp = _client.chat.completions.create(**kwargs)
            usage = getattr(resp, "usage", None)
            budget.charge(
                model,
                getattr(usage, "prompt_tokens", 0) or 0,
                getattr(usage, "completion_tokens", 0) or 0,
            )
            return resp
        except (RateLimitError, APIConnectionError) as exc:
            last = exc
        except APIStatusError as exc:
            if exc.status_code and 500 <= exc.status_code < 600:
                last = exc
            else:
                raise
        sleep = min(2 ** attempt, 20) + random.random()
        time.sleep(sleep)
    raise RuntimeError(f"model call failed after {max_retries} attempts: {last}")


_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", re.S)


def chat_json(model: str, messages: list[dict], budget: Budget, **kw) -> dict:
    """Chat completion that must return a JSON object.

    Tries native JSON mode first; falls back to fence extraction, then to a
    brace scan. Never returns a half-parsed object — raises instead, so a bad
    extraction shows up as a bad extraction rather than a silent empty verdict.
    """
    try:
        resp = _client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=kw.get("temperature", 0.0),
            max_tokens=kw.get("max_tokens", 1500),
            response_format={"type": "json_object"},
        )
        usage = getattr(resp, "usage", None)
        budget.charge(
            model,
            getattr(usage, "prompt_tokens", 0) or 0,
            getattr(usage, "completion_tokens", 0) or 0,
        )
        text = resp.choices[0].message.content or ""
    except (APIStatusError, TypeError):
        # Server does not support response_format for this model. Ask plainly.
        resp = chat(model, messages, budget, **kw)
        text = resp.choices[0].message.content or ""

    return parse_json(text)


def parse_json(text: str) -> dict:
    text = (text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = _FENCE.search(text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    raise ValueError(f"model did not return parseable JSON. Raw output:\n{text[:800]}")


def list_models() -> list[str]:
    """Used by `make models`. Confirms the exact IDs your account can call."""
    return sorted(m.id for m in _client.models.list().data)
