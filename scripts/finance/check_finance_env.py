#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# ///

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse


def parse_env_file(path: Path) -> dict[str, str]:
  if not path.exists():
    return {}
  loaded: dict[str, str] = {}
  for raw_line in path.read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#"):
      continue
    if line.startswith("export "):
      line = line[len("export ") :].strip()
    if "=" not in line:
      continue
    key, value = line.split("=", 1)
    key = key.strip()
    value = value.strip().strip("'").strip('"')
    if key:
      loaded[key] = value
  return loaded


def pick(env: dict[str, str], keys: Iterable[str], default: str | None = None) -> str | None:
  for key in keys:
    value = env.get(key, "").strip()
    if value:
      return value
  return default


def parse_bool(raw: str | None, default: bool) -> bool:
  if raw is None:
    return default
  normalized = raw.strip().lower()
  if normalized in {"1", "true", "yes", "on"}:
    return True
  if normalized in {"0", "false", "no", "off"}:
    return False
  return default


def parse_int(raw: str | None, default: int) -> int:
  if raw is None:
    return default
  try:
    return int(raw.strip())
  except Exception:
    return default


def valid_url(raw: str) -> bool:
  parsed = urlparse(raw)
  return bool(parsed.scheme and parsed.netloc)


@dataclass
class CheckResult:
  name: str
  ok: bool
  detail: str


def run_checks(env: dict[str, str]) -> tuple[list[CheckResult], list[str]]:
  results: list[CheckResult] = []
  errors: list[str] = []

  expert_mode = (pick(env, ["OPENFINCLAW_FIN_EXPERT_MODE", "FIN_EXPERT_SDK_MODE"], "stub") or "stub").lower()
  info_mode = (pick(env, ["OPENFINCLAW_FIN_INFO_MODE", "FIN_INFO_FEED_MODE"], "stub") or "stub").lower()

  if expert_mode not in {"stub", "live"}:
    errors.append(f"Invalid expert mode: {expert_mode} (expected stub/live)")
  if info_mode not in {"stub", "live"}:
    errors.append(f"Invalid info mode: {info_mode} (expected stub/live)")

  results.append(CheckResult("expert.mode", expert_mode in {"stub", "live"}, expert_mode))
  results.append(CheckResult("info.mode", info_mode in {"stub", "live"}, info_mode))

  expert_key = pick(env, ["OPENFINCLAW_FIN_EXPERT_API_KEY", "FIN_EXPERT_SDK_API_KEY"])
  expert_endpoint = pick(env, ["OPENFINCLAW_FIN_EXPERT_ENDPOINT", "FIN_EXPERT_SDK_ENDPOINT"])
  info_key = pick(env, ["OPENFINCLAW_FIN_INFO_API_KEY", "FIN_INFO_FEED_API_KEY"])
  info_endpoint = pick(env, ["OPENFINCLAW_FIN_INFO_ENDPOINT", "FIN_INFO_FEED_ENDPOINT"])

  if expert_mode == "live":
    ok = bool(expert_key) and bool(expert_endpoint) and valid_url(expert_endpoint)
    results.append(CheckResult("expert.live_credentials", ok, "apiKey+endpoint required in live mode"))
    if not ok:
      errors.append("Expert live mode requires FIN_EXPERT_SDK_API_KEY and FIN_EXPERT_SDK_ENDPOINT (valid URL)")
  else:
    results.append(CheckResult("expert.live_credentials", True, "stub mode"))

  if info_mode == "live":
    ok = bool(info_key) and bool(info_endpoint) and valid_url(info_endpoint)
    results.append(CheckResult("info.live_credentials", ok, "apiKey+endpoint required in live mode"))
    if not ok:
      errors.append("Info live mode requires FIN_INFO_FEED_API_KEY and FIN_INFO_FEED_ENDPOINT (valid URL)")
  else:
    results.append(CheckResult("info.live_credentials", True, "stub mode"))

  monitoring_enabled = parse_bool(
    pick(
      env,
      ["OPENFINCLAW_FIN_MONITORING_AUTO_EVALUATE", "FIN_MONITORING_AUTO_EVALUATE"],
    ),
    True,
  )
  monitoring_poll = parse_int(
    pick(
      env,
      ["OPENFINCLAW_FIN_MONITORING_POLL_INTERVAL_MS", "FIN_MONITORING_POLL_INTERVAL_MS"],
    ),
    300_000,
  )
  monitoring_ok = monitoring_poll >= 10_000
  results.append(
    CheckResult(
      "monitoring.poll_interval_ms",
      monitoring_ok,
      f"{monitoring_poll} (autoEvaluate={str(monitoring_enabled).lower()})",
    )
  )
  if not monitoring_ok:
    errors.append("Monitoring poll interval must be >= 10000 ms")

  return results, errors


def main() -> int:
  parser = argparse.ArgumentParser(description="Validate OpenFinclaw finance environment variables.")
  parser.add_argument("--env-file", default=".env.finance", help="Path to finance env file")
  parser.add_argument("--strict-file", action="store_true", help="Fail if env file does not exist")
  args = parser.parse_args()

  env_file = Path(args.env_file)
  file_values = parse_env_file(env_file)
  if args.strict_file and not env_file.exists():
    print(f"[FAIL] env file not found: {env_file}")
    return 1

  # Do not override existing process env values.
  merged = {**file_values, **os.environ}

  results, errors = run_checks(merged)

  print("Finance env validation (uv):")
  print(f"- env file: {env_file} ({'found' if env_file.exists() else 'missing, using process env only'})")
  for row in results:
    status = "PASS" if row.ok else "FAIL"
    print(f"- [{status}] {row.name}: {row.detail}")

  if errors:
    print("\nErrors:")
    for msg in errors:
      print(f"- {msg}")
    return 1

  print("\nAll finance environment checks passed.")
  return 0


if __name__ == "__main__":
  sys.exit(main())
