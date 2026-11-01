# 全局配置：路径、请求参数、展示名映射。
import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent          # backend/app
BASE_DIR = APP_DIR.parent.parent                   # ai-contest-hub/
DATA_DIR = BASE_DIR / "data"
DB_PATH = Path(os.environ.get("ACH_DB_PATH") or DATA_DIR / "competitions.db")
ROOT_PATH = os.environ.get("ACH_ROOT_PATH", "").rstrip("/")
PUBLIC_URL = os.environ.get("ACH_PUBLIC_URL", "https://dfacm.website/ai-contests/").rstrip("/") + "/"
KAGGLE_TOKEN_PATH = Path(os.environ.get("ACH_KAGGLE_TOKEN_PATH") or DATA_DIR / "kaggle.json")


def hub_url(path: str = "") -> str:
    """Keep every application link inside its mounted website directory."""
    return f"{ROOT_PATH}/{path.lstrip('/')}"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 15.0   # 单请求超时（秒）
PAGE_INTERVAL = 2.0      # 同源相邻请求的礼貌间隔（秒）
FETCH_RETRIES = 2        # 失败重试次数（指数退避）

# source 标识 → 展示名
SOURCE_NAMES = {
    "datafountain": "DataFountain",
    "tianchi": "天池",
    "xfyun": "讯飞开发者大赛",
    "kaggle": "Kaggle",
    "codeforces": "Codeforces",
    "leetcode": "LeetCode",
    "lablab": "lablab.ai",
    "devpost": "DevPost",
    "drivendata": "DrivenData",
}

# 兴趣筛选（伪分类，按 tags 过滤）
INTEREST_FILTERS = {
    "vibe-coding": "⚡ Vibe Coding",
    "agent": "🤖 Agent/大模型",
}

# 是否在 Web 服务内启用定时抓取（0/1），容器内常开
ENABLE_SCHEDULER = os.environ.get("ACH_ENABLE_SCHEDULER", "1") not in ("0", "false", "False")

# 统一分类 → 展示名
CATEGORY_NAMES = {
    "datascience": "数据科学",
    "aigc": "AIGC 创作",
    "oj": "算法竞赛",
    "llm_agent": "大模型/Agent",
    "hackathon": "黑客松",
    "other": "其他",
}
