"""
全局配置模块 — 读取环境变量，提供统一配置访问。
"""
import os
from dotenv import load_dotenv

load_dotenv()


def get_proxy_dict() -> dict[str, str] | None:
    """获取代理配置字典，用于 httpx / openai SDK。"""
    http_proxy = os.getenv("HTTP_PROXY", "")
    https_proxy = os.getenv("HTTPS_PROXY", "")
    if http_proxy or https_proxy:
        return {"http://": http_proxy, "https://": https_proxy or http_proxy}
    # 兼容小写（OS 可能存为小写）
    http_proxy = os.getenv("http_proxy", "")
    https_proxy = os.getenv("https_proxy", "")
    if http_proxy or https_proxy:
        return {"http://": http_proxy, "https://": https_proxy or http_proxy}
    return None


# === LLM 默认值 ===
DEFAULT_LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "https://api.openai.com/v1")
DEFAULT_LLM_API_KEY = os.getenv("LLM_API_KEY", "")
DEFAULT_LLM_MODEL = os.getenv("LLM_MODEL_NAME", "gpt-4o")
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "60"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "2048"))

# === Tavily 搜索 ===
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# === 代理 ===
PROXY_DICT = get_proxy_dict()

# === 应用设置 ===
APP_TITLE = "DailyDose — 英语学习"
APP_VERSION = "1.0.0"
