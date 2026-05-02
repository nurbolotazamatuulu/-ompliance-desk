"""
Phase 0 smoke test — verify the FastAPI app imports without errors.

Phase 1+ will add:
- Endpoint integration tests (with TestClient)
- Auth flow tests
- Tenant isolation tests
- License validation tests
"""


def test_app_imports():
    """The main FastAPI app object loads with all routers registered."""
    from app.main import app

    assert app is not None
    assert app.title == "ComplianceDesk API"
    assert hasattr(app, "routes")
    assert len(app.routes) > 0


def test_health_endpoint_registered():
    """The /health endpoint used by docker-compose healthcheck is registered."""
    from app.main import app

    paths = [r.path for r in app.routes if hasattr(r, "path")]
    assert "/health" in paths, f"/health not in routes: {paths}"


def test_license_module_backward_compat():
    """After d83b0f5/db43061 license-module refactor, legacy symbols remain importable."""
    from app.license import check_client_limit, check_write_permission, validate_license

    assert callable(check_write_permission)
    assert callable(check_client_limit)
    assert callable(validate_license)
