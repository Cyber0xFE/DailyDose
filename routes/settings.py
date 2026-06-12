"""
LLM 配置管理路由 — GET/POST/DELETE /api/settings/llm + 测试连接。
"""
from fastapi import APIRouter, Request

from models import (
    LLMConfig,
    LLMConfigResponse,
    TestConnectionResponse,
)
from services.llm_client import LLMClient

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _get_stored_config(request: Request) -> dict:
    """从 app.state 获取已保存的 LLM 配置。"""
    return getattr(request.app.state, "llm_config", {})


def _set_stored_config(request: Request, config: dict):
    """保存 LLM 配置到 app.state。"""
    request.app.state.llm_config = config


@router.get("/llm", response_model=dict)
async def get_llm_config(request: Request):
    config = _get_stored_config(request)
    if not config:
        return {
            "success": True,
            "data": {
                "endpoint": "",
                "model_name": "",
                "api_key_masked": "",
                "is_configured": False,
            },
        }
    api_key = config.get("api_key", "")
    masked = api_key[:4] + "****" + api_key[-4:] if len(api_key) > 8 else "****"
    return {
        "success": True,
        "data": {
            "endpoint": config.get("endpoint", ""),
            "model_name": config.get("model_name", ""),
            "api_key_masked": masked,
            "is_configured": True,
        },
    }


@router.post("/llm", response_model=dict)
async def save_llm_config(config: LLMConfig, request: Request):
    _set_stored_config(request, {
        "endpoint": config.endpoint,
        "api_key": config.api_key,
        "model_name": config.model_name,
    })
    return {"success": True, "message": "LLM configuration saved"}


@router.delete("/llm", response_model=dict)
async def delete_llm_config(request: Request):
    _set_stored_config(request, {})
    return {"success": True, "message": "LLM configuration cleared"}


@router.post("/llm/test", response_model=dict)
async def test_llm_connection(config: LLMConfig | None = None, request: Request = None):
    # 使用传入的配置或已保存的配置
    if config and config.api_key:
        client = LLMClient(
            endpoint=config.endpoint,
            api_key=config.api_key,
            model_name=config.model_name,
        )
    else:
        stored = _get_stored_config(request) if request else {}
        if not stored:
            return {
                "success": False,
                "message": "No LLM configuration found. Please configure first.",
                "model_responded": "",
                "latency_ms": 0,
            }
        client = LLMClient(
            endpoint=stored["endpoint"],
            api_key=stored["api_key"],
            model_name=stored["model_name"],
        )

    try:
        result = await client.test_connection()
        await client.close()
        return result
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
            "model_responded": "",
            "latency_ms": 0,
        }
