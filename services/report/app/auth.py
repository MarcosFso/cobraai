"""Login check. The billing service signs a token (JWT, HS256) when a user logs in; this service only verifies it
with the same secret and reads the company ("org") from it. There is no user database here and no session."""
import os

import jwt
from fastapi import Header, HTTPException

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me-0123456789abcdef")


def verify_token(token: str, secret: str = JWT_SECRET) -> str:
    """Returns the company id of a valid token, or raises 401."""
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], options={"require": ["exp", "org"]})
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Entre de novo.") from error
    return str(claims["org"])


def current_org(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: the company of the caller."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Faça login para continuar")
    return verify_token(authorization[7:].strip())
