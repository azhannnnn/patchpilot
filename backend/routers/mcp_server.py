"""
Real MCP (Model Context Protocol) server — JSON-RPC 2.0
Implements: initialize, tools/list, tools/call
"""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from tools.mcp_tools import TOOL_SCHEMAS, tool_executor
import json

router = APIRouter()
MCP_VERSION = "2024-11-05"

@router.post("/mcp")
async def mcp_handler(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"jsonrpc":"2.0","id":None,"error":{"code":-32700,"message":"Parse error"}})

    method = body.get("method","")
    req_id = body.get("id")
    params = body.get("params",{}) or {}

    # ── initialize ──────────────────────────────────────────
    if method == "initialize":
        return JSONResponse({
            "jsonrpc":"2.0","id":req_id,
            "result":{
                "protocolVersion": MCP_VERSION,
                "capabilities":{"tools":{}},
                "serverInfo":{"name":"patchpilot-mcp","version":"5.0.0"}
            }
        })

    # ── tools/list ──────────────────────────────────────────
    if method == "tools/list":
        return JSONResponse({
            "jsonrpc":"2.0","id":req_id,
            "result":{"tools": TOOL_SCHEMAS}
        })

    # ── tools/call ──────────────────────────────────────────
    if method == "tools/call":
        tool_name = params.get("name","")
        arguments = params.get("arguments",{})
        result    = tool_executor.execute(tool_name, arguments)
        if "error" in result and not result.get("result"):
            return JSONResponse({
                "jsonrpc":"2.0","id":req_id,
                "error":{"code":-32603,"message":result["error"]}
            })
        return JSONResponse({
            "jsonrpc":"2.0","id":req_id,
            "result":{"content":[{"type":"text","text":json.dumps(result.get("result",{}))}]}
        })

    # ── unknown method ───────────────────────────────────────
    return JSONResponse({
        "jsonrpc":"2.0","id":req_id,
        "error":{"code":-32601,"message":f"Method not found: {method}"}
    })
