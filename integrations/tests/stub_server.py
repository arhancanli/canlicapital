"""A minimal stdlib HTTP server that mimics the Canli validation API for tests.

Not a test module itself (its name does not match unittest's "test*.py" discovery
pattern), so `python3 -m unittest discover` never tries to run it directly. Every
test that needs the API binds one of these to 127.0.0.1 on an ephemeral port for the
duration of the test: no real network call ever leaves the machine and no real API
key is ever used.

Behaviour mimicked, matching api/v1/keys.js and api/_lib/handler.js:
  POST /api/v1/keys                     -> 201 with a key, then 429 issuance_exhausted
  POST /api/v1/validate/deflated-sharpe  -> 401 without a bearer key, else 200 with an
                                             envelope carrying limits and a receipt
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

LIMITS_TEXT = [
    "This verdict is about the series exactly as submitted. The service never saw the "
    "data source, its costs, survivorship, or any lookahead in how the series was built.",
    "A deflated Sharpe or overfitting probability above or below any threshold is not "
    "admission to anything and is not a forecast.",
    "The receipt is content-hashed and reproducible from the open-source core it names. "
    "It is not signed.",
    "Quotas: 1000 validations per key per UTC day, 5 keys per client per UTC day, "
    "1048576 bytes per request, 20000 observations per series, 200 variants per matrix.",
]


def make_envelope(endpoint: str, data=None, error=None, receipt=None) -> dict:
    body = {
        "schema": "canli.api.v1",
        "endpoint": f"/api/v1/{endpoint}",
        "generated_at": "2026-09-06T00:00:00Z",
        "claim_class": "USER_SUBMITTED_SCENARIO",
        "capital_kind": "NOT_APPLICABLE_USER_SUBMITTED",
        "canonical_human_page": "https://canlicapital.com/developers",
        "limits": list(LIMITS_TEXT),
        "sources": [],
        "data": data or {},
    }
    if receipt:
        body["receipt"] = receipt
    if error:
        body["error"] = error
    return body


class StubHandler(BaseHTTPRequestHandler):
    server_version = "CanliStub/1.0"

    def log_message(self, format, *args):  # noqa: A002 - silence per-request logging in test output
        pass

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return {}

    def do_POST(self):  # noqa: N802 - BaseHTTPRequestHandler naming convention
        payload = self._read_json_body()

        if self.path == "/api/v1/keys":
            return self._handle_keys(payload)
        if self.path == "/api/v1/validate/deflated-sharpe":
            return self._handle_validate(payload)
        self._send_json(404, {"error": {"code": "not_found", "message": "no such route"}})

    def _handle_keys(self, payload: dict) -> None:
        state = self.server.state
        with state["lock"]:
            state["keys_issued"] += 1
            count = state["keys_issued"]
        if count > state["keys_per_client_per_day"]:
            body = make_envelope(
                "keys",
                error={
                    "code": "issuance_exhausted",
                    "message": f"At most {state['keys_per_client_per_day']} keys per client per UTC day",
                },
            )
            return self._send_json(429, body)
        body = make_envelope(
            "keys",
            data={
                "key": f"ck_live_stubkey{count:08d}",
                "label": payload.get("label"),
                "keys_remaining_today": max(0, state["keys_per_client_per_day"] - count),
                "note": "Store this key now. Only its hash is kept and it cannot be shown again.",
            },
        )
        self._send_json(201, body)

    def _handle_validate(self, payload: dict) -> None:
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            body = make_envelope(
                "validate/deflated-sharpe",
                error={
                    "code": "unauthorized",
                    "message": "Send Authorization: Bearer ck_live_... from POST /api/v1/keys",
                },
            )
            return self._send_json(401, body)

        state = self.server.state
        with state["lock"]:
            state["validations"] += 1
            seq = state["validations"]

        returns = payload.get("returns", [])
        data = {
            "input_mode": "return_series",
            "derived_inputs": {
                "observations": len(returns),
                "periods_per_year": payload.get("periods_per_year"),
                "effective_independent_trials": payload.get("effective_independent_trials"),
            },
            "result": {"psr_against_zero": 0.6, "deflated_sharpe_ratio": 0.55},
            "plain_reading": (
                "Counting only sample uncertainty, the probability this Sharpe is above "
                "zero is 60.0 percent. Deflated for the best-by-luck Sharpe the declared "
                "search would produce, it is 55.0 percent. Neither number is a forecast."
            ),
            "receipt_stored": True,
        }
        host = self.headers.get("Host", "127.0.0.1")
        receipt_id = f"{seq:024x}"
        receipt = {
            "id": receipt_id,
            "url": f"http://{host}/api/v1/receipts/{receipt_id}",
            "input_sha256": "sha256:stub",
            "output_sha256": "sha256:stub",
        }
        body = make_envelope("validate/deflated-sharpe", data=data, receipt=receipt)
        self._send_json(200, body)


def start_stub_server(keys_per_client_per_day: int = 1) -> tuple:
    """Start the stub on an ephemeral localhost port. Returns (server, thread, base_url).

    `keys_per_client_per_day` controls how many POST /api/v1/keys calls succeed before
    the stub starts returning 429 issuance_exhausted, so tests can exercise that path
    without waiting on a real quota.
    """
    server = HTTPServer(("127.0.0.1", 0), StubHandler)
    server.state = {
        "lock": threading.Lock(),
        "keys_issued": 0,
        "validations": 0,
        "keys_per_client_per_day": keys_per_client_per_day,
    }
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    return server, thread, base_url


def stop_stub_server(server: HTTPServer, thread: threading.Thread) -> None:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
