#!/usr/bin/env python3
"""
Bootstrap script: generate RSA 4096-bit key pair for license signing.

Run ONCE per ComplianceDesk vendor installation. Re-running OVERWRITES
existing keys — this invalidates all previously issued license tokens.

Usage:
    python generate-keys.py              # writes to keys/{private,public}_key.pem
    python generate-keys.py --force      # overwrite existing keys without prompt

Per AD-4: RS256 (RSA 4096-bit) is the chosen algorithm for license signing.
"""

import argparse
import os
import stat
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="Overwrite existing keys without prompt")
    parser.add_argument("--out-dir", default="keys", help="Output directory for keys (default: keys/)")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    private_path = out_dir / "private_key.pem"
    public_path = out_dir / "public_key.pem"

    if (private_path.exists() or public_path.exists()) and not args.force:
        print(f"ERROR: keys already exist in {out_dir}/", file=sys.stderr)
        print("Re-running would invalidate all previously issued license tokens.", file=sys.stderr)
        print("Use --force to overwrite (you must regenerate and re-issue all licenses).", file=sys.stderr)
        return 1

    print("Generating RSA 4096-bit key pair (this may take a few seconds)...")
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    public_key = private_key.public_key()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    private_path.write_bytes(private_pem)
    public_path.write_bytes(public_pem)

    # Restrict private key permissions to owner read-only
    os.chmod(private_path, stat.S_IRUSR)
    os.chmod(public_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)

    print()
    print(f"✅ Private key: {private_path} (mode 0400 — owner read only)")
    print(f"✅ Public key:  {public_path} (mode 0644)")
    print()
    print("NEXT STEPS:")
    print(f"  1. Backup private key: {private_path}")
    print("     Store securely (offline, encrypted). Loss = inability to issue new licenses.")
    print(f"  2. Copy public key to backend for license validation:")
    print(f"       cp {public_path} ../../backend/app/license/public_key.pem")
    print()
    print("⚠  Phase 1 NOTE: backend will embed the public key as a Python constant")
    print("   (backend/app/license/public_key.py with PUBLIC_KEY = '''...'''),")
    print("   making the .pem copy step obsolete. For now (Phase 0), the .pem file is fine.")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
