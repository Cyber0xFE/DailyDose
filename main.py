"""
DailyDose — 英语学习 Agent
FastAPI 应用入口
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from config import APP_TITLE, APP_VERSION, DEFAULT_LLM_ENDPOINT, DEFAULT_LLM_API_KEY, DEFAULT_LLM_MODEL

# ─── 创建应用 ─────────────────────────────────────────

app = FastAPI(title=APP_TITLE, version=APP_VERSION)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化 LLM 配置存储 — 优先从 .env 加载默认配置
app.state.llm_config = {}
if DEFAULT_LLM_API_KEY:
    app.state.llm_config = {
        "endpoint": DEFAULT_LLM_ENDPOINT,
        "api_key": DEFAULT_LLM_API_KEY,
        "model_name": DEFAULT_LLM_MODEL,
    }

# ─── 注册路由 ─────────────────────────────────────────

from routes.article import router as article_router
from routes.translate import router as translate_router
from routes.settings import router as settings_router

app.include_router(article_router)
app.include_router(translate_router)
app.include_router(settings_router)

# ─── 静态文件 ─────────────────────────────────────────

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
async def root():
    """重定向到主页面。"""
    from fastapi.responses import FileResponse
    return FileResponse(str(static_dir / "index.html"))


# ─── 启动入口 ─────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
