"""Bounded output comparisons, not executable benchmarks or intelligence rankings."""

import asyncio
import time

from .arena_datasets import canonical_json
from .providers import ProviderError
from .store import uid

RUN_SECONDS = 180


async def run_arena(providers, cases, template, snapshot=None):
    deadline = time.monotonic() + RUN_SECONDS
    result = {
        "id": uid(),
        "dataset": snapshot["id"] if snapshot else "core-v1",
        "created": time.time(),
        "results": [],
        "schema_version": 1,
        "template": template,
        "grading": "exact/json-canonical-v1; objective output match only; not a comprehensive intelligence benchmark",
    }
    if snapshot:
        result["dataset_snapshot"] = snapshot
    for provider in providers:
        outcomes = []
        for item in cases:
            started = time.perf_counter()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                outcomes.append(
                    {
                        "id": item["id"],
                        "passed": False,
                        "attempted": False,
                        "error": "Run time budget exceeded",
                    }
                )
                continue
            try:
                async with asyncio.timeout(min(90, remaining)):
                    response = await provider.generate_text(
                        [{"role": "user", "content": template.replace("{task}", item["task"])}]
                    )
                match = item.get("match", "json" if item["id"] == "json" else "exact")
                if match == "json":
                    try:
                        passed = canonical_json(response) == canonical_json(item["expected"])
                    except (ValueError, RecursionError):
                        passed = False
                else:
                    passed = response.strip() == item["expected"]
                outcomes.append(
                    {
                        "id": item["id"],
                        "passed": passed,
                        "attempted": True,
                        "response": response[:1000],
                        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                    }
                )
            except (ProviderError, TimeoutError):
                outcomes.append(
                    {
                        "id": item["id"],
                        "passed": False,
                        "attempted": True,
                        "error": "Provider failed",
                    }
                )
        result["results"].append(
            {
                "model": provider.model.id,
                "provider": provider.model.provider,
                "model_identifier": provider.model.model,
                "demo": provider.model.demo,
                "score": sum(case["passed"] for case in outcomes) / len(outcomes),
                "cases": outcomes,
            }
        )
    return result
