"""API Key authentication middleware"""
import os
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse

SKIP_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json", "/mcp"}

async def api_key_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in SKIP_PATHS:
        return await call_next(request)
    api_key = os.environ.get("PP_API_KEY", "")
    if not api_key:
        return await call_next(request)
    provided = request.headers.get("X-API-Key", "")
    if provided != api_key:
        return JSONResponse({"error": "Invalid or missing X-API-Key"}, status_code=401)
    return await call_next(request)
