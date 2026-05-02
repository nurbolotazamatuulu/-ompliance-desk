# License Generator (AD-4)

CLI tool for issuing **ComplianceDesk** license tokens. Per [03-architecture.md AD-4](../../docs/vasp-expansion/03-architecture.md), licenses are signed JSON Web Tokens (RS256, RSA 4096-bit) — self-contained, no license server.

This tool is **internal to the ComplianceDesk vendor** and is not distributed to clients.

---

## Bootstrap (one-time per vendor installation)

```bash
cd tools/license-generator
pip install -r requirements.txt

# Generate the RSA 4096-bit signing key pair
python generate-keys.py
# → keys/private_key.pem (mode 0400 — owner read only)
# → keys/public_key.pem (mode 0644)

# Distribute public key to backend for license validation (Phase 0)
cp keys/public_key.pem ../../backend/app/license/public_key.pem
```

> **⚠ Phase 1 transition note:** when the backend license validation module is implemented (Phase 1), the public key will be **embedded directly into Python source code** as a constant:
>
> ```python
> # backend/app/license/public_key.py
> PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
> MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAr...
> -----END PUBLIC KEY-----"""
> ```
>
> This makes the distribution model more robust — the key cannot be tampered with at runtime by replacing a `.pem` file. The `cp` step above will become obsolete; only the constant will exist in code. For Phase 0 (current), the `.pem` file approach is fine for testing.

---

## Issue a license

```bash
python generate-license.py \
  --tenant-id 1 \
  --expires 2027-12-31 \
  --sku CS+VO \
  --add-ons risk_advanced_vasp,kyt_chainalysis
```

Output (JWT to stdout):
```
eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJDb21w...
```

Or write to file:
```bash
python generate-license.py \
  --tenant-id 5 \
  --expires 2026-06-30 \
  --sku CS \
  --output licenses/afg-tenant-5.jwt
```

### Arguments

| Flag | Required | Description |
|---|---|---|
| `--tenant-id` | yes | Integer ID of the tenant. Must match `tenants.id` in production. |
| `--expires` | yes | Expiry date `YYYY-MM-DD` (UTC end-of-day). |
| `--sku` | yes | One of `CS`, `VO`, `CS+VO` (per AD-5). |
| `--add-ons` | no | Comma-separated; valid values: `risk_advanced_vasp`, `kyt_chainalysis`, `kyt_trm`, `travel_rule_notabene`, `regulator_audit_realtime`, `emission_services`. |
| `--output` | no | Write to file. Default: stdout. |
| `--key` | no | Private key path. Default: `keys/private_key.pem`. |
| `--issuer` | no | `iss` claim. Default: `ComplianceDesk`. |

### JWT payload

```json
{
  "iss": "ComplianceDesk",
  "sub": "tenant:1",
  "iat": 1746230400,
  "exp": 1830038399,
  "tenant_id": 1,
  "sku": "CS+VO",
  "add_ons": ["risk_advanced_vasp", "kyt_chainalysis"]
}
```

When the license expires, the backend transitions to **read-only mode** (per AD-4): clients can view their data and run exports for retention obligations, but cannot create new operations until renewal.

---

## Debug / troubleshooting

### `examples/decode-token.py`

> ⚠ **Debug / troubleshooting tool — not for regular production workflow.**
>
> Backend validates tokens at runtime (Phase 1). Use this CLI only when investigating issues with issued licenses (wrong SKU? wrong expiry? signature mismatch?).

```bash
# Decode + verify signature against public key
python examples/decode-token.py "<JWT>"

# Decode from file
python examples/decode-token.py --file licenses/afg-tenant-5.jwt

# Decode without verifying signature (for tokens signed with unknown key)
python examples/decode-token.py "<JWT>" --no-verify
```

---

## Security

- **Private key (`keys/private_key.pem`)** is the most sensitive secret of the vendor. Loss = inability to issue new licenses (must regenerate, invalidating all existing tokens). Compromise = attacker can issue arbitrary licenses for any tenant.
- **Storage:** offline backup, encrypted, in physical safe or HSM. `.gitignore` excludes all `*.pem` files repository-wide.
- **Permissions:** `private_key.pem` is created with mode `0400` (owner read only); do not relax.
- **Re-issuing:** `generate-keys.py --force` overwrites existing keys but **invalidates all previously issued license tokens**. After re-keying, every active client must receive a new license.
- **License rotation:** there is no online revocation. Mitigation = short expiry windows (1-3 years per AD-4).

---

## File layout

```
tools/license-generator/
├── README.md              ← this file
├── requirements.txt       ← PyJWT[crypto]
├── generate-keys.py       ← bootstrap: one-time RSA pair generation
├── generate-license.py    ← issue JWT
├── examples/
│   └── decode-token.py    ← debug tool (not for production workflow)
└── keys/                  ← generated locally; *.pem gitignored
    ├── .gitkeep
    ├── private_key.pem    ← never commit
    └── public_key.pem     ← copy to backend/app/license/ in Phase 0
```
