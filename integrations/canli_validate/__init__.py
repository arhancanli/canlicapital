"""Shared HTTP client for the Canli Capital validation API.

Talks to POST /api/v1/keys and POST /api/v1/validate/deflated-sharpe using only the
Python standard library (urllib), so importing this module never pulls in a third
party HTTP library, vectorbt, backtrader or freqtrade.

Environment variables:
  CANLI_API_BASE   base URL of the API (default https://canlicapital.com)
  CANLI_KEY        a key already issued by POST /api/v1/keys. If unset, resolve_key()
                   issues one on the fly and prints it once so it can be reused.

Every response from this client is the API's envelope as a plain dict: schema,
endpoint, generated_at, claim_class, capital_kind, canonical_human_page, limits,
sources, data, and on success a receipt, or on failure an error. print_envelope()
below is the one function that should be used to show a result to a person, because
it always prints the verdict together with the limits that bound it.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Iterable, Mapping, Optional

DEFAULT_BASE_URL = "https://canlicapital.com"
DEFAULT_LABEL = "integration-client"
USER_AGENT = "canli-validate-integrations/1.0"


class CanliApiError(RuntimeError):
    """Raised when the validation API returns an error envelope, or is unreachable.

    Carries the status code and the parsed error envelope (when there was one) so a
    caller can inspect envelope["error"]["code"] without re-parsing anything.
    """

    def __init__(self, message: str, *, status: Optional[int] = None, envelope: Optional[dict] = None):
        super().__init__(message)
        self.status = status
        self.envelope = envelope or {}

    @property
    def code(self) -> Optional[str]:
        return (self.envelope.get("error") or {}).get("code")


def _base_url(base_url: Optional[str] = None) -> str:
    return (base_url or os.environ.get("CANLI_API_BASE") or DEFAULT_BASE_URL).rstrip("/")


def _post(path: str, payload: Mapping[str, Any], *, key: Optional[str] = None, base_url: Optional[str] = None) -> dict:
    """POST JSON to the API and return the parsed envelope. Raises CanliApiError on any
    non-2xx response or network failure; the envelope from an error response (if the
    body parsed as JSON) is attached to the exception."""
    url = f"{_base_url(base_url)}{path}"
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            envelope = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            envelope = {}
        message = ((envelope.get("error") or {}).get("message")) or f"HTTP {exc.code} from {url}"
        raise CanliApiError(message, status=exc.code, envelope=envelope) from exc
    except urllib.error.URLError as exc:
        raise CanliApiError(f"Could not reach {url}: {exc.reason}", status=None) from exc


def issue_key(label: str = DEFAULT_LABEL, *, base_url: Optional[str] = None) -> dict:
    """POST /api/v1/keys with {"label": label} and return the parsed envelope.

    On success envelope["data"]["key"] is the ck_live_... key, shown only this once.
    Raises CanliApiError (code "issuance_exhausted") once the caller's daily key quota
    is used up; envelope["limits"] on that error still names the quota in force.
    """
    return _post("/api/v1/keys", {"label": label}, base_url=base_url)


def resolve_key(label: str = DEFAULT_LABEL, *, base_url: Optional[str] = None) -> str:
    """Return CANLI_KEY from the environment, or issue a fresh key labelled `label`.

    Prints the new key once (the API never shows it again) so a user can export
    CANLI_KEY and skip issuing a new key on every run.
    """
    env_key = os.environ.get("CANLI_KEY")
    if env_key:
        return env_key
    envelope = issue_key(label, base_url=base_url)
    key = (envelope.get("data") or {}).get("key")
    if not key:
        raise CanliApiError("Key issuance response had no key", envelope=envelope)
    print(f"Issued a new Canli key for label '{label}'. Set CANLI_KEY={key} to reuse it next time.")
    return key


def validate_returns(
    returns: Iterable[float],
    periods_per_year: float,
    trials: int,
    key: Optional[str] = None,
    label: str = DEFAULT_LABEL,
    *,
    cross_trial_sharpe_sd_annualized: float = 0.5,
    base_url: Optional[str] = None,
) -> dict:
    """POST a return series to /api/v1/validate/deflated-sharpe in return-series mode.

    `trials` is sent as effective_independent_trials, the count of variants tried
    before this one. `cross_trial_sharpe_sd_annualized` has no per-strategy analogue
    when only a single equity curve is available; it defaults to 0.5, the same value
    the API's own documentation example uses, and is echoed back in the envelope's
    derived_inputs so the assumption is never hidden. `label` tags the request so the
    API's source breakdown by label works without any separate tracking parameter; if
    `key` is not given it is also used to issue (or reuse) a key via resolve_key().
    """
    if not key:
        key = resolve_key(label, base_url=base_url)
    payload = {
        "returns": [float(r) for r in returns],
        "periods_per_year": float(periods_per_year),
        "effective_independent_trials": int(trials),
        "cross_trial_sharpe_sd_annualized": float(cross_trial_sharpe_sd_annualized),
        "label": label,
    }
    return _post("/api/v1/validate/deflated-sharpe", payload, key=key, base_url=base_url)


def print_envelope(envelope: Mapping[str, Any]) -> None:
    """Print a validation envelope the way a person should read one: the verdict in
    words, then every limits sentence, then the receipt url and badge embed if
    present. Never prints only the number, because a bare Sharpe or probability
    without its limits is exactly the kind of claim this API exists to prevent."""
    error = envelope.get("error")
    if error:
        code = error.get("code", "error")
        message = error.get("message", "")
        print(f"Validation failed ({code}): {message}")
    else:
        data = envelope.get("data") or {}
        reading = data.get("plain_reading")
        if reading:
            print(f"Verdict: {reading}")
        else:
            result = data.get("result")
            if result:
                print(f"Result: {json.dumps(result)}")
            else:
                print("Verdict: (this response carried no plain-language reading)")

    limits = envelope.get("limits") or []
    if limits:
        print("Limits:")
        for sentence in limits:
            print(f"  - {sentence}")

    receipt = envelope.get("receipt") or {}
    if receipt.get("url"):
        print(f"Receipt: {receipt['url']}")

    badge = (envelope.get("data") or {}).get("badge_markdown") or receipt.get("badge_markdown")
    if badge:
        print(f"Badge embed: {badge}")
