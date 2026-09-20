"""Password hashing and bearer sessions.

v1 pushed auth into Spring Boot and the agent server trusted an internal token.
v2 is one process, so it owns accounts — with stdlib primitives only, because
this is a skeleton milestone and pulling a hashing dependency now would be a
decision nobody asked for. PBKDF2-HMAC-SHA256 with per-password salt and a
generous iteration count, compared in constant time.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import SessionToken, User, utcnow

ITERATIONS = 240_000
HASH_ALGORITHM = "sha256"
TOKEN_BYTES = 32


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    if len(password) < 8:
        raise ValueError("password must be at least 8 characters")
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(HASH_ALGORITHM, password.encode("utf-8"), salt, ITERATIONS)
    return f"pbkdf2_{HASH_ALGORITHM}${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt_hex, digest_hex = stored.split("$")
        if scheme != f"pbkdf2_{HASH_ALGORITHM}":
            return False
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac(HASH_ALGORITHM, password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(expected, actual)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class AuthenticatedUser:
    user: User
    token: str


class AuthRepository:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._factory = session_factory

    def register(self, username: str, password: str, *, external_ai_consent: bool = False) -> User:
        username = username.strip()
        if not username:
            raise ValueError("username is required")
        with self._factory() as session:
            if session.scalar(select(User).where(User.username == username)) is not None:
                raise ValueError("username already taken")
            user = User(
                username=username,
                password_hash=hash_password(password),
                external_ai_consent_at=utcnow() if external_ai_consent else None,
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def login(self, username: str, password: str, *, ttl: timedelta = timedelta(days=14)) -> AuthenticatedUser | None:
        with self._factory() as session:
            user = session.scalar(select(User).where(User.username == username.strip()))
            if user is None or not verify_password(password, user.password_hash):
                return None
            raw = secrets.token_urlsafe(TOKEN_BYTES)
            session.add(
                SessionToken(
                    user_id=user.id,
                    token_hash=hash_token(raw),
                    expires_at=utcnow() + ttl,
                )
            )
            session.commit()
            return AuthenticatedUser(user=user, token=raw)

    def resolve(self, token: str | None) -> User | None:
        if not token:
            return None
        with self._factory() as session:
            row = session.get(SessionToken, hash_token(token))
            if row is None or row.revoked_at is not None or row.expires_at < utcnow():
                return None
            return session.get(User, row.user_id)

    def revoke(self, token: str) -> None:
        with self._factory() as session:
            row = session.get(SessionToken, hash_token(token))
            if row is not None and row.revoked_at is None:
                row.revoked_at = utcnow()
                session.commit()

    def set_ai_consent(self, user_id: int, granted: bool) -> User:
        with self._factory() as session:
            user = session.get(User, user_id)
            if user is None:
                raise LookupError(user_id)
            # Revocation clears the timestamp rather than deleting the user, matching
            # v1's semantics: absence of consent must be representable per-user.
            user.external_ai_consent_at = utcnow() if granted else None
            session.commit()
            session.refresh(user)
            return user
