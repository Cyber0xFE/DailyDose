"""
LLM 客户端 — 封装 OpenAI 兼容的异步调用。
支持自定义 endpoint、api_key、model，以及 HTTP 代理。
"""
import time
import httpx
from openai import AsyncOpenAI

from config import PROXY_DICT, LLM_TIMEOUT, LLM_MAX_TOKENS


class LLMClient:
    """OpenAI 兼容格式的 LLM 客户端。"""

    def __init__(
        self,
        endpoint: str,
        api_key: str,
        model_name: str = "gpt-4o",
    ):
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self.model_name = model_name

        # 构建 httpx 客户端（含代理）
        http_client = None
        if PROXY_DICT:
            http_client = httpx.AsyncClient(
                proxy=PROXY_DICT.get("http://"),
                timeout=httpx.Timeout(LLM_TIMEOUT),
            )

        self._client = AsyncOpenAI(
            base_url=self.endpoint + "/v1" if not self.endpoint.endswith("/v1") else self.endpoint,
            api_key=api_key,
            timeout=LLM_TIMEOUT,
            http_client=http_client,
        )
        # 智能处理 base_url：有些用户填 https://api.openai.com，有些填 https://api.openai.com/v1

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """发送聊天请求，返回模型回复文本。"""
        if max_tokens is None:
            max_tokens = LLM_MAX_TOKENS

        response = await self._client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    async def chat_completion_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ):
        """流式聊天请求，异步生成器，逐块 yield 文本增量。"""
        if max_tokens is None:
            max_tokens = LLM_MAX_TOKENS

        stream = await self._client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    async def test_connection(self) -> dict:
        """测试 LLM 连接是否正常，返回耗时等信息。"""
        start = time.perf_counter()
        try:
            content = await self.chat_completion(
                messages=[{"role": "user", "content": "Hello, respond with just 'OK'."}],
                temperature=0.0,
                max_tokens=10,
            )
            latency_ms = int((time.perf_counter() - start) * 1000)
            return {
                "success": True,
                "message": "Connection successful",
                "model_responded": self.model_name,
                "latency_ms": latency_ms,
            }
        except Exception as e:
            latency_ms = int((time.perf_counter() - start) * 1000)
            return {
                "success": False,
                "message": f"Connection failed: {str(e)}",
                "model_responded": "",
                "latency_ms": latency_ms,
            }

    async def close(self):
        """关闭底层 HTTP 客户端。"""
        await self._client.close()
