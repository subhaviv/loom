"""JWT token validation — supports Cognito and generic OIDC issuers."""
import json
import logging
import threading
import time
from typing import Any

import jwt
from jwt import algorithms as jwt_algorithms

from app.services.net_guard import safe_get

logger = logging.getLogger(__name__)

# Cache for JWKS keys: {jwks_url: (keys, fetch_time)}
_jwks_cache: dict[str, tuple[dict[str, Any], float]] = {}
JWKS_CACHE_TTL = 3600  # 1 hour

# Thundering-herd guard. Without this, a cold cache plus a burst of concurrent
# requests (the frontend fires every data fetch at once on load) sends every
# request to fetch JWKS simultaneously. Each fetch opens its own outbound TLS
# socket; under load that exhausts ephemeral ports and every fetch fails with
# [Errno 99] Cannot assign requested address, so the cache never populates and
# the storm is self-sustaining. The lock serialises fetches so exactly one
# network call happens while the rest wait and then read the cache.
_jwks_fetch_lock = threading.Lock()
# After a failed fetch, don't let callers immediately re-storm the network.
_jwks_negative_backoff: dict[str, float] = {}
JWKS_NEGATIVE_BACKOFF = 5.0  # seconds


def _get_jwks(jwks_url: str) -> dict[str, Any]:
    """Fetch and cache JWKS keys from any JWKS endpoint.

    Serialised behind a lock with stale-on-error fallback so a cold cache under
    a concurrent request burst cannot exhaust sockets.
    """
    now = time.time()
    cached = _jwks_cache.get(jwks_url)
    if cached and now - cached[1] < JWKS_CACHE_TTL:
        return cached[0]

    with _jwks_fetch_lock:
        # Re-check: another thread may have populated the cache while we waited.
        now = time.time()
        cached = _jwks_cache.get(jwks_url)
        if cached and now - cached[1] < JWKS_CACHE_TTL:
            return cached[0]

        # Negative backoff: if a very recent fetch failed, serve stale keys
        # (if any) rather than hammering the network again.
        last_fail = _jwks_negative_backoff.get(jwks_url, 0.0)
        if cached and now - last_fail < JWKS_NEGATIVE_BACKOFF:
            return cached[0]

        logger.info("Fetching JWKS from %s", jwks_url)
        try:
            resp = safe_get(jwks_url, timeout=10)
            resp.raise_for_status()
            jwks = json.loads(resp.content.decode())
        except Exception as e:
            _jwks_negative_backoff[jwks_url] = now
            if cached:
                logger.warning("JWKS refetch failed (%s); serving stale keys", e)
                return cached[0]
            raise

        _jwks_cache[jwks_url] = (jwks, now)
        _jwks_negative_backoff.pop(jwks_url, None)
        return jwks


def _get_signing_key(jwks: dict[str, Any], kid: str) -> jwt_algorithms.RSAAlgorithm:
    """Find the signing key matching the given kid."""
    available_kids = [k.get("kid") for k in jwks.get("keys", [])]
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            return jwt_algorithms.RSAAlgorithm.from_jwk(key_data)
    raise ValueError(f"Key with kid={kid} not found in JWKS (available: {available_kids})")


def validate_token(
    token: str,
    jwks_uri: str,
    issuer: str,
    audience: str | None = None,
) -> dict[str, Any]:
    """Validate a JWT token against any OIDC-compliant JWKS endpoint.

    Args:
        token: The JWT token string
        jwks_uri: URL to the JWKS endpoint
        issuer: Expected issuer claim
        audience: Expected audience. If None, audience is not validated.

    Returns:
        Decoded token claims
    """
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")
    if not kid:
        raise jwt.InvalidTokenError("Token header missing 'kid'")

    jwks = _get_jwks(jwks_uri)
    public_key = _get_signing_key(jwks, kid)

    options = {}
    if audience is None:
        options["verify_aud"] = False

    claims = jwt.decode(
        token,
        key=public_key,
        algorithms=["RS256"],
        issuer=issuer,
        audience=audience,
        options=options,
    )

    return claims


def validate_cognito_token(
    token: str,
    user_pool_id: str,
    region: str,
    client_id: str | None = None,
) -> dict[str, Any]:
    """Validate a Cognito JWT token (backward-compatible wrapper)."""
    issuer = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"
    jwks_uri = f"{issuer}/.well-known/jwks.json"
    return validate_token(token, jwks_uri, issuer, audience=client_id)
