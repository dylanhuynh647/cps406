"""Rate limiting middleware for API endpoints."""
from fastapi import Request, status
from fastapi.responses import JSONResponse
from collections import defaultdict
from typing import Dict
import time
import re

rate_limit_store: Dict[str, Dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

RATE_LIMIT_RULES = [
    {
        "id": "auth",
        "pattern": re.compile(r"^/api/auth"),
        "methods": {"GET", "POST", "PATCH", "DELETE"},
        "requests": 6,
        "window": 60,
    },
    {
        "id": "account-create",
        "pattern": re.compile(r"^/api/auth/signup$"),
        "methods": {"POST"},
        "requests": 3,
        "window": 60,
    },
    {
        "id": "projects-create",
        "pattern": re.compile(r"^/api/projects$"),
        "methods": {"POST"},
        "requests": 5,
        "window": 60,
    },
    {
        "id": "projects-delete",
        "pattern": re.compile(r"^/api/projects/[0-9a-fA-F-]+$"),
        "methods": {"DELETE"},
        "requests": 3,
        "window": 60,
    },
    {
        "id": "project-members-add",
        "pattern": re.compile(r"^/api/projects/[0-9a-fA-F-]+/member-invitations$"),
        "methods": {"POST"},
        "requests": 8,
        "window": 60,
    },
    {
        "id": "project-members-delete",
        "pattern": re.compile(r"^/api/projects/[0-9a-fA-F-]+/members/[0-9a-fA-F-]+$"),
        "methods": {"DELETE"},
        "requests": 8,
        "window": 60,
    },
    {
        "id": "phase-advance",
        "pattern": re.compile(r"^/api/projects/[0-9a-fA-F-]+/phases/advance$"),
        "methods": {"POST"},
        "requests": 1,
        "window": 30,
    },
    {
        "id": "bugs-create",
        "pattern": re.compile(r"^/api/bugs$"),
        "methods": {"POST"},
        "requests": 10,
        "window": 60,
    },
    {
        "id": "bugs-delete",
        "pattern": re.compile(r"^/api/bugs/[0-9a-fA-F-]+$"),
        "methods": {"DELETE"},
        "requests": 8,
        "window": 60,
    },
    {
        "id": "artifacts-create",
        "pattern": re.compile(r"^/api/(artifacts|artifact-uploads)$"),
        "methods": {"POST"},
        "requests": 10,
        "window": 60,
    },
    {
        "id": "artifacts-delete",
        "pattern": re.compile(r"^/api/artifacts/[0-9a-fA-F-]+$"),
        "methods": {"DELETE"},
        "requests": 8,
        "window": 60,
    },
    {
        "id": "default",
        "pattern": re.compile(r"^/api"),
        "methods": {"GET", "POST", "PUT", "PATCH", "DELETE"},
        "requests": 40,
        "window": 60,
    },
]


def get_rate_limit_rule(path: str, method: str) -> dict:
    """Resolve a rate limit rule from request path and method."""
    upper_method = method.upper()
    for rule in RATE_LIMIT_RULES:
        if upper_method in rule["methods"] and rule["pattern"].match(path):
            return rule
    return RATE_LIMIT_RULES[-1]

def get_client_identifier(request: Request) -> str:
    """Get client identifier for rate limiting"""
    # Use IP address for rate limiting
    # In production, consider using user ID for authenticated requests
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware"""
    # Skip rate limiting for health checks
    if request.url.path in ["/", "/health", "/docs", "/openapi.json"]:
        return await call_next(request)
    
    client_id = get_client_identifier(request)
    path = request.url.path
    rule = get_rate_limit_rule(path, request.method)
    rate_limit_key = f"{rule['id']}:{request.method.upper()}"
    
    now = time.time()
    window_start = now - int(rule["window"])
    
    # Clean old entries
    if rate_limit_key in rate_limit_store and client_id in rate_limit_store[rate_limit_key]:
        rate_limit_store[rate_limit_key][client_id] = [
            ts for ts in rate_limit_store[rate_limit_key][client_id]
            if ts > window_start
        ]
    
    # Count requests in window
    request_count = len(rate_limit_store[rate_limit_key][client_id])
    
    if request_count >= int(rule["requests"]):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "detail": f"Rate limit exceeded: {rule['requests']} requests per {rule['window']} seconds"
            },
            headers={
                "X-RateLimit-Limit": str(rule["requests"]),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(now + int(rule["window"])))
            }
        )
    
    # Add current request
    rate_limit_store[rate_limit_key][client_id].append(now)
    
    # Add rate limit headers
    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(rule["requests"])
    response.headers["X-RateLimit-Remaining"] = str(int(rule["requests"]) - request_count - 1)
    response.headers["X-RateLimit-Reset"] = str(int(now + int(rule["window"])))
    
    return response
