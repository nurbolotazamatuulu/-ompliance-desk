"""
License validation module (AD-4).

Phase 0: scaffold only — actual validation logic is implemented in Phase 1.

Phase 1 will add:
- public_key.py with PUBLIC_KEY constant (RSA 4096 PEM, embedded in source)
- validator.py with validate_license_token(token) -> LicensePayload
- middleware.py with license check on app startup + daily revalidation (APScheduler)
- Read-only mode handler when license is expired or invalid

For now, license tokens are issued by tools/license-generator/ and stored
externally; backend does not validate them yet.
"""
