#!/usr/bin/env python3
"""
Issue a ComplianceDesk license token (RS256-signed JWT).

Usage:
    python generate-license.py --tenant-id 1 --expires 2027-12-31 --sku CS+VO
    python generate-license.py --tenant-id 5 --expires 2026-06-30 --sku CS \\
        --add-ons risk_advanced_vasp,kyt_chainalysis --output licenses/tenant-5.jwt

Per AD-4: license is a self-contained signed JWT. No license server. Expired
tokens put the backend into read-only mode (Phase 1 implementation).

Per AD-5: SKU values are CS, VO, or CS+VO. Add-ons are independent.
"""

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import jwt

VALID_SKUS = {"CS", "VO", "CS+VO"}
VALID_ADDONS = {
    "risk_advanced_vasp",
    "kyt_chainalysis",
    "kyt_trm",
    "travel_rule_notabene",
    "regulator_audit_realtime",
    "emission_services",
}


def parse_expires(value: str) -> datetime:
    """Parse YYYY-MM-DD into UTC datetime at end of day."""
    try:
        date = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise argparse.ArgumentTypeError(f"Invalid date format: {value!r}. Expected YYYY-MM-DD.")
    # Set to end of day UTC for inclusive-of-day semantics
    return date.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)


def parse_sku(value: str) -> str:
    if value not in VALID_SKUS:
        raise argparse.ArgumentTypeError(f"Invalid sku: {value!r}. Expected one of {sorted(VALID_SKUS)}.")
    return value


def parse_addons(value: str) -> list[str]:
    if not value:
        return []
    addons = [a.strip() for a in value.split(",") if a.strip()]
    invalid = [a for a in addons if a not in VALID_ADDONS]
    if invalid:
        raise argparse.ArgumentTypeError(
            f"Invalid add-ons: {invalid}. Valid: {sorted(VALID_ADDONS)}"
        )
    return addons


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tenant-id", required=True, type=int, help="Tenant ID (integer)")
    parser.add_argument("--expires", required=True, type=parse_expires, help="Expiry date YYYY-MM-DD (UTC end-of-day)")
    parser.add_argument("--sku", required=True, type=parse_sku, help=f"SKU: one of {sorted(VALID_SKUS)}")
    parser.add_argument("--add-ons", default="", type=parse_addons, help=f"Comma-separated add-ons. Valid: {sorted(VALID_ADDONS)}")
    parser.add_argument("--key", default="keys/private_key.pem", help="Path to private key (default: keys/private_key.pem)")
    parser.add_argument("--output", help="Write JWT to this file (default: stdout)")
    parser.add_argument("--issuer", default="ComplianceDesk", help="Token issuer claim (default: ComplianceDesk)")
    args = parser.parse_args()

    key_path = Path(args.key)
    if not key_path.exists():
        print(f"ERROR: private key not found at {key_path}", file=sys.stderr)
        print("Run generate-keys.py first to bootstrap the key pair.", file=sys.stderr)
        return 1

    private_key = key_path.read_bytes()

    now = datetime.now(timezone.utc)
    payload = {
        "iss": args.issuer,
        "sub": f"tenant:{args.tenant_id}",
        "iat": int(now.timestamp()),
        "exp": int(args.expires.timestamp()),
        "tenant_id": args.tenant_id,
        "sku": args.sku,
        "add_ons": args.add_ons,
    }

    token = jwt.encode(payload, private_key, algorithm="RS256")

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(token + "\n")
        print(f"✅ License issued → {out_path}")
        print(f"   tenant_id={args.tenant_id} sku={args.sku} expires={args.expires.date()} add_ons={args.add_ons}")
    else:
        print(token)

    return 0


if __name__ == "__main__":
    sys.exit(main())
