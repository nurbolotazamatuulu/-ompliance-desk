"""
License module.

Phase 0:
- legacy.py contains the existing license-server-based logic (httpx polling
  to LICENSE_SERVER_URL, expiry-driven write-blocking).
- Public symbols re-exported here for backward compatibility with existing
  routers (routers/clients.py, routers/ubos.py).

Phase 1 (per AD-4):
- New validator.py will replace the legacy logic with self-contained
  signed-JWT validation (RS256, RSA 4096-bit, no license server).
- public_key.py will embed the verification public key as a Python constant
  (replacing the .pem file approach used during Phase 0 testing).
- legacy.py will be deprecated and eventually removed.
- The middleware will check license at app startup + daily revalidation
  (APScheduler), expired tokens transition the backend to read-only mode.

For now, both modules coexist; existing code paths continue to use legacy.
"""

from .legacy import (  # noqa: F401  (re-exported for backward compat)
    check_client_limit,
    check_write_permission,
    validate_license,
)
