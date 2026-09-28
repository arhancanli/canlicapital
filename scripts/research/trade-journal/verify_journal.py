"""An independent verifier for canli.trade-journal.v0, written from standards/trade-journal/README.md.

It shares no code with js/trade-journal-core.js: the point of it is a second reading of the standard
in another language, so that the JavaScript verifier agreeing with it means the standard, not one
implementation, decides what a valid journal is.

    uv run --with cryptography python verify_journal.py <journal.jsonl>          # one result as JSON
    uv run --with cryptography python verify_journal.py --many <dir> <out.json>  # every *.jsonl in dir
    uv run --with cryptography python verify_journal.py --record <vectors dir> <corrupted dir> <out.json.gz>

--record writes this verifier's verdicts on the named vectors and on the corrupted corpus (from
`node scripts/research/trade-journal/corpus.mjs corrupted <dir>`) as the fixture the JavaScript
tests compare against, gzipped with a zero timestamp so a rerun writes the same bytes.
"""
import gzip
import io
import base64
import binascii
import hashlib
import json
import pathlib
import re
import sys
from datetime import datetime

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

PREFIX = b'{"entry":'
SIG_MARK = b',"sig":"'
MEMBERS = {"v", "seq", "ts", "kind", "payload", "prev"}
TS_FORM = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
KINDS = {"config", "decision", "check", "order", "ack", "fill", "cancel", "reconcile", "mark", "correction"}


class Bad(Exception):
    def __init__(self, code):
        self.code = code


def is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def values_ok(value):
    """ASCII member names; every number finite and below 1e15 in magnitude; no integral value spelled as a float."""
    if isinstance(value, dict):
        return all(k.isascii() and values_ok(v) for k, v in value.items())
    if isinstance(value, list):
        return all(values_ok(v) for v in value)
    if isinstance(value, float):
        return value == value and abs(value) < 1e15 and not value.is_integer()
    if isinstance(value, int) and not isinstance(value, bool):
        return abs(value) < 10 ** 15
    return True


def reject_constant(name):
    raise ValueError(f"{name} is not JSON")


def positive(x):
    return is_number(x) and x > 0


def payload_ok(kind, p, seq, line0):
    if not isinstance(p, dict):
        return False
    if kind == "config":
        if line0:
            key = p.get("journal_key")
            try:
                raw = base64.b64decode(key, validate=True) if isinstance(key, str) else None
            except (binascii.Error, ValueError):
                return False
            return raw is not None and len(raw) == 32 and base64.b64encode(raw).decode() == key
        return isinstance(p.get("limits_digest"), str) and bool(DIGEST.match(p["limits_digest"]))
    if kind == "decision":
        return "decision_id" in p
    if kind == "check":
        return all(k in p for k in ("decision_seq", "limits_digest", "result_sha256"))
    if kind == "order":
        return (all(k in p for k in ("client_order_id", "symbol", "venue")) and p.get("side") in ("buy", "sell")
                and positive(p.get("qty")) and p.get("type") in ("market", "limit"))
    if kind == "ack":
        return "client_order_id" in p and "status" in p
    if kind == "fill":
        return ("client_order_id" in p and "symbol" in p and p.get("side") in ("buy", "sell")
                and positive(p.get("qty")) and positive(p.get("price")))
    if kind == "cancel":
        return "client_order_id" in p or p.get("all") is True
    if kind == "reconcile":
        return p.get("status") in ("AGREE", "DIVERGENT", "ORPHAN", "MISSING")
    if kind == "mark":
        return (isinstance(p.get("marks"), dict) and all(positive(v) for v in p["marks"].values())
                and "source" in p)
    if kind == "correction":
        c = p.get("corrects_seq")
        return isinstance(c, int) and not isinstance(c, bool) and 0 <= c < seq and "reason" in p
    return False


def check_line(raw, n, prev_line, prev_ts, key):
    """Check one line (bytes, without its newline). Returns (ts, key) for the next line, or raises Bad."""
    if not raw.startswith(PREFIX) or not raw.endswith(b'"}'):
        raise Bad("shape")
    cut = raw.rfind(SIG_MARK)
    if cut < len(PREFIX):
        raise Bad("shape")
    entry_bytes = raw[len(PREFIX):cut]
    sig_text = raw[cut + len(SIG_MARK):-2]
    try:
        entry = json.loads(entry_bytes, parse_constant=reject_constant)
    except ValueError:
        raise Bad("shape")
    if not isinstance(entry, dict) or set(entry) != MEMBERS:
        raise Bad("shape")
    if (not values_ok(entry)
            or json.dumps(entry, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode() != entry_bytes):
        raise Bad("canonical")
    if entry["v"] != 1 or isinstance(entry["v"], bool):
        raise Bad("version")
    if not isinstance(entry["seq"], int) or isinstance(entry["seq"], bool) or entry["seq"] != n:
        raise Bad("seq")
    want_prev = None if n == 0 else "sha256:" + hashlib.sha256(prev_line).hexdigest()
    if entry["prev"] != want_prev:
        raise Bad("prev")
    ts = entry["ts"]
    if not isinstance(ts, str) or not TS_FORM.match(ts):
        raise Bad("ts")
    try:
        datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        raise Bad("ts")
    if prev_ts is not None and ts < prev_ts:
        raise Bad("ts")
    kind = entry["kind"]
    if kind not in KINDS or (n == 0 and kind != "config"):
        raise Bad("kind")
    if not payload_ok(kind, entry["payload"], n, n == 0):
        raise Bad("payload")
    if n == 0:
        try:
            key = Ed25519PublicKey.from_public_bytes(base64.b64decode(entry["payload"]["journal_key"]))
        except ValueError:
            raise Bad("payload")
    try:
        sig = base64.b64decode(sig_text, validate=True)
    except (binascii.Error, ValueError):
        raise Bad("signature")
    if len(sig) != 64 or base64.b64encode(sig) != sig_text:
        raise Bad("signature")
    try:
        key.verify(sig, entry_bytes)
    except InvalidSignature:
        raise Bad("signature")
    return ts, key


def verify(data):
    """Verify a journal's bytes: {valid, entries, first_bad_line, reason, head}."""
    if not data:
        return {"valid": False, "entries": 0, "first_bad_line": 0, "reason": "encoding", "head": None}
    lines = data.split(b"\n")
    ends_with_newline = lines[-1] == b""
    if ends_with_newline:
        lines = lines[:-1]
    prev_line, prev_ts, key = None, None, None
    for n, raw in enumerate(lines):
        last = n == len(lines) - 1
        try:
            raw.decode("utf-8")
            if b"\r" in raw or raw == b"" or (last and not ends_with_newline):
                raise UnicodeDecodeError("utf-8", raw, 0, 0, "")
        except UnicodeDecodeError:
            return {"valid": False, "entries": n, "first_bad_line": n, "reason": "encoding", "head": None}
        try:
            prev_ts, key = check_line(raw, n, prev_line, prev_ts, key)
        except Bad as bad:
            return {"valid": False, "entries": n, "first_bad_line": n, "reason": bad.code, "head": None}
        prev_line = raw
    return {"valid": True, "entries": len(lines), "first_bad_line": None, "reason": None,
            "head": "sha256:" + hashlib.sha256(prev_line).hexdigest()}


if __name__ == "__main__":
    if sys.argv[1] == "--record":
        vec, cor, out = (pathlib.Path(x) for x in sys.argv[2:5])
        verdicts = {"schema": "canli.trade-journal.v0 python verdicts",
                    "vectors": {p.name: verify(p.read_bytes()) for p in sorted(vec.glob("*.jsonl"))},
                    "corrupted": {p.name: verify(p.read_bytes()) for p in sorted(cor.glob("*.jsonl"))}}
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, compresslevel=9) as gz:
            gz.write(json.dumps(verdicts, sort_keys=True, separators=(",", ":")).encode())
        out.write_bytes(buf.getvalue())
        print(len(verdicts["vectors"]), "vectors,", len(verdicts["corrupted"]), "corrupted journals recorded")
    elif sys.argv[1] == "--many":
        folder, out = pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
        results = {p.name: verify(p.read_bytes()) for p in sorted(folder.glob("*.jsonl"))}
        out.write_text(json.dumps(results, sort_keys=True, separators=(",", ":")))
        print(len(results), "journals;", sum(r["valid"] for r in results.values()), "valid")
    else:
        print(json.dumps(verify(pathlib.Path(sys.argv[1]).read_bytes())))
