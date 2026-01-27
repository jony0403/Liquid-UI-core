import asyncio
import os
import uvicorn
import yaml
import httpx
from collections import OrderedDict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bs4 import BeautifulSoup
import google.generativeai as genai
from dotenv import load_dotenv

# 1. 환경변수 로드 (경로 안전하게 찾기)
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, ".env")
load_dotenv(env_path)

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    # 혹시나 .env 로드 실패 시 하드코딩된 키라도 있으면 여기 넣으세요.
    print("⚠️ 경고: API 키를 찾을 수 없습니다.")

# 2. Gemini 설정
genai.configure(api_key=api_key)

MODEL_NAME = "gemini-2.5-flash"

# 안전 장치 해제 (네가 원하던 설정 적용)
safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]

model = genai.GenerativeModel(MODEL_NAME, safety_settings=safety_settings)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. 프롬프트 로더 (YAML)
SYSTEM_PROMPTS = {}

@app.on_event("startup")
def load_prompts():
    global SYSTEM_PROMPTS
    try:
        with open("prompt.yaml", "r", encoding="utf-8") as f:
            SYSTEM_PROMPTS = yaml.safe_load(f)
            print(f"✅ YAML 프롬프트 로드 완료! 목록: {list(SYSTEM_PROMPTS.keys())}")
    except FileNotFoundError:
        print("❌ prompt.yaml 파일이 없습니다. 기본값 사용.")
        SYSTEM_PROMPTS = {"default": "내용을 3줄로 요약해줘."}

# 4. 캐시 저장소 (속도 향상 및 중복 요청 방지)
class LocalCache:
    def __init__(self, capacity: int = 50):
        self.cache = OrderedDict()
        self.capacity = capacity
    def get(self, key: str):
        if key not in self.cache: return None
        self.cache.move_to_end(key)
        return self.cache[key]
    def put(self, key: str, value: str):
        if key in self.cache: self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity: self.cache.popitem(last=False)

summary_cache = LocalCache()

# 5. 데이터 요청 모델
class AnalyzeRequest(BaseModel):
    url: str
    text_content: str | None = None
    front_image_url: str | None = None # 프론트엔드에서 보낸 이미지를 최우선으로 함

def detect_domain_type(url: str) -> str:
    u = url.lower()
    if any(k in u for k in ['shop', 'store', 'coupang', 'product', 'gmarket', '11st']): return "shopping"
    if any(k in u for k in ['velog', 'tistory', 'medium', 'tech', 'github']): return "tech"
    if any(k in u for k in ['news', 'article', 'report', 'press']): return "news"
    return "default"

# 6. 향상된 크롤러 (제공해준 코드 통합)
# 주의: 이 함수는 text_content가 없을 때만 작동하는 비상용입니다.
async def fetch_page_content(url: str):
    DEFAULT_IMAGE = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.google.com/"
    }
    
    async with httpx.AsyncClient(follow_redirects=True, verify=False) as client:
        try:
            # 쿠팡 같은 보안 사이트는 여기서 에러날 확률이 높음 (그래서 비상용임)
            response = await client.get(url, headers=headers, timeout=3.0)
            
            if response.encoding is None:
                response.encoding = 'utf-8'
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 불필요 태그 제거
            for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "button"]):
                tag.decompose()
            text = soup.get_text(separator=' ', strip=True)[:6000]
            
            image_url = ""
            
            # [제공된 로직 적용] 이미지 정밀 탐색
            candidates = [
                soup.find("meta", property="og:image"),
                soup.find("meta", attrs={"name": "twitter:image"}) 
            ]
            
            for c in candidates:
                if c and c.get("content"):
                    image_url = c["content"]
                    break
            
            if not image_url:
                selectors = ["#img1", ".end_photo_org img", "figure img", "article img"]
                for sel in selectors:
                    img = soup.select_one(sel)
                    if img and img.get("src"):
                        image_url = img["src"]
                        break
            
            return text, image_url if image_url else DEFAULT_IMAGE
            
        except Exception as e:
            print(f"❌ 서버 크롤링 실패 (프론트 데이터 사용 권장): {e}")
            return None, DEFAULT_IMAGE

# 7. 스트리밍 생성기
async def gemini_stream_generator(text, image_url, url_key, mode):
    full_text_log = ""
    
    # 1. 이미지 신호 전송
    if image_url:
        msg = f"IMAGE_URL::{image_url}::END\n"
        full_text_log += msg
        yield msg
    
    system_instruction = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS.get("default"))

    final_prompt = f"""
    {system_instruction}

    [입력 데이터]
    {text}
    """

    try:
        response = await model.generate_content_async(final_prompt, stream=True)
        async for chunk in response:
            # [수정된 부분] 안전하게 텍스트 꺼내기
            try:
                # 텍스트가 있는 경우에만 가져오고, 없으면(종료 패킷) 넘긴다
                if chunk.text:
                    full_text_log += chunk.text
                    yield chunk.text
            except ValueError:
                # finish_reason이 정상이지만 텍스트가 없는 마지막 조각을 무시함
                continue
        
        # 완료 후 캐시에 저장
        summary_cache.put(url_key, full_text_log)
        
    except Exception as e:
        # 혹시라도 진짜 에러가 나면 여기서 잡음
        print(f"Stream Error: {e}")
        yield f"\n[System] 요약 생성 중 중단되었습니다."

# 8. 최종 API 엔드포인트
@app.post("/analyze")
async def analyze_url(request: AnalyzeRequest):
    print(f"🚀 요청 수신: {request.url}")
    
    # 1. 캐시 확인
    cached = summary_cache.get(request.url)
    if cached:
        print("⚡ 캐시 적중! 저장된 결과 반환")
        async def send_cached(): yield cached
        return StreamingResponse(send_cached(), media_type="text/event-stream")

    mode = detect_domain_type(request.url)

    # 2. 이미지 & 텍스트 확보 전략
    # 전략: 프론트엔드가 보낸 데이터가 1순위 (쿠팡 방어용), 없으면 서버가 크롤링(비상용)
    final_image = request.front_image_url
    target_text = request.text_content

    if not target_text or len(target_text) < 50:
        print("🕵️ 텍스트 부족, 서버가 크롤링 시도...")
        fetched_text, fetched_image = await fetch_page_content(request.url)
        if fetched_text:
            target_text = fetched_text
            # 프론트 이미지가 없을 때만 서버 이미지 사용
            if not final_image: 
                final_image = fetched_image
        else:
            # 둘 다 실패했을 경우
            target_text = "본문 내용을 불러올 수 없습니다."

    if not final_image:
        final_image = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop"

    print(f"✅ 분석 시작 (모드: {mode}, 텍스트길이: {len(target_text)})")

    return StreamingResponse(
        gemini_stream_generator(target_text, final_image, request.url, mode),
        media_type="text/event-stream"
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)