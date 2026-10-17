"""Bounded process for parsing uploaded documents; no source execution."""

import base64
import json
import sys

try:
    import resource

    resource.setrlimit(resource.RLIMIT_CPU, (12, 12))
    resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024, 384 * 1024 * 1024))
except ImportError:
    pass

from .platform import extract_document

try:
    body = json.loads(sys.stdin.buffer.read(400000))
    kind, text = extract_document(body["filename"], base64.b64decode(body["data"], validate=True))
    print(json.dumps({"kind": kind, "text": text}))
except Exception:
    print(json.dumps({"error": "Document parsing failed or exceeded resource limits"}))
    sys.exit(1)
