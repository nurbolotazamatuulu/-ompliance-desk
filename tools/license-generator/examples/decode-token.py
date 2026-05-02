#!/usr/bin/env python3
"""
Decode and verify a ComplianceDesk license JWT.

⚠ DEBUG / TROUBLESHOOTING TOOL ONLY.
   Not for regular production workflow — backend validates tokens at runtime
   per AD-4 (license validation in Phase 1 module).
   Use this when investigating issues with issued tokens.

Usage:
    python decode-token.py <token-string>
    python decode-token.py --file licenses/tenant-1.jwt
    python decode-token.py <token> --key ../keys/public_key.pem
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import jwt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("token", nargs="?", help="JWT token string (or use --file)")
    parser.add_argument("--file", help="Read token from file")
    parser.add_argument("--key", default="keys/public_key.pem", help="Path to public key (default: keys/public_key.pem — invoke from tools/license-generator/)")
    parser.add_argument("--no-verify", action="store_true", help="Skip signature verification (decode payload only)")
    args = parser.parse_args()

    if args.file:
        token = Path(args.file).read_text().strip()
    elif args.token:
        token = args.token.strip()
    else:
        parser.error("Provide token as positional arg or --file")

    if args.no_verify:
        payload = jwt.decode(token, options={"verify_signature": False})
        print("⚠  SIGNATURE NOT VERIFIED (--no-verify)")
    else:
        key_path = Path(args.key)
        if not key_path.exists():
            print(f"ERROR: public key not found at {key_path}", file=sys.stderr)
            return 1
        public_key = key_path.read_bytes()
        try:
            payload = jwt.decode(token, public_key, algorithms=["RS256"])
            print("✅ Signature valid")
        except jwt.ExpiredSignatureError:
            print("⚠  Signature valid BUT TOKEN EXPIRED — decoding payload anyway:")
            payload = jwt.decode(token, public_key, algorithms=["RS256"], options={"verify_exp": False})
        except jwt.InvalidTokenError as e:
            print(f"❌ Invalid token: {e}", file=sys.stderr)
            return 1

    print()
    print("Payload:")
    print(json.dumps(payload, indent=2, ensure_ascii=False))

    # Human-readable expiry
    if "exp" in payload:
        exp_dt = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        delta = exp_dt - now
        status = "✅ active" if delta.total_seconds() > 0 else "❌ EXPIRED"
        print()
        print(f"Expiry: {exp_dt.isoformat()}  ({status}; {abs(delta).days} days {'remaining' if delta.total_seconds() > 0 else 'past expiry'})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
