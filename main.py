import os
import uvicorn
import yaml
import httpx
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
from bs4 import BeautifulSoup

# 1. 환경변수 로드
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("⚠️ .env 파일에 GOOGLE_API_KEY가 없습니다!")

genai.configure(api_key=api_key)

# ----------------------------------------------------------------
# [복구 완료] 네가 쓰던 모델명 그대로 적용
# ----------------------------------------------------------------
MODEL_NAME = "gemini-2.5-flash"

# 안전 장치 해제 (글자 짤림 방지)
safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]

try:
    model = genai.GenerativeModel(MODEL_NAME, safety_settings=safety_settings)
    print(f"⚡ {MODEL_NAME} 엔진 가동 (Safety Filter 해제됨)")
except Exception as e:
    print(f"⚠️ 모델 설정 경고: {e}")
    # 설령 에러가 나도 죽지 않게 설정 (하지만 네 환경에선 될 것이다)
    model = genai.GenerativeModel(MODEL_NAME, safety_settings=safety_settings)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    url: str
    text_content: str

# ----------------------------------------------------------------
# 프롬프트 로더
# ----------------------------------------------------------------
def load_prompts():
    try:
        with open('prompts.yaml', 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception:
        return {"default": "내용을 3줄로 요약해줘."}

# ----------------------------------------------------------------
# [수정됨] 아까 터진 크롤러 에러(Tag.find)만 딱 고침
# ----------------------------------------------------------------
async def fetch_page_content(url: str):
    DEFAULT_IMAGE = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.google.com/"
    }
    
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            print(f"🕵️ 크롤링 시도: {url}")
            response = await client.get(url, headers=headers, timeout=2.0)
            
            if response.encoding is None:
                response.encoding = 'utf-8'
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "button"]):
                tag.decompose()
            text = soup.get_text(separator=' ', strip=True)[:6000]
            
            image_url = ""
            
            # [버그 픽스] name 충돌 문제 해결 (attrs 사용)
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
            
            if not image_url:
                image_url = DEFAULT_IMAGE
            
            return text, image_url
            
        except Exception as e:
            print(f"❌ 크롤링 실패 (무시하고 진행): {e}")
            return None, None

# ----------------------------------------------------------------
# 스트리밍 엔진
# ----------------------------------------------------------------
async def gemini_stream_generator(text, image_url, url_key):
    full_response = ""
    
    if image_url:
        yield f"IMAGE_URL::{image_url}::END\n"
    
    prompts = load_prompts()
    system_prompt = prompts.get("default", "요약해줘.")
    
    if "news" in url_key: system_prompt = prompts.get("news", system_prompt)
    elif "coupang" in url_key: system_prompt = prompts.get("shopping", system_prompt)
    elif "velog" in url_key: system_prompt = prompts.get("tech", system_prompt)

    final_prompt = f"{system_prompt}\n\n[Input]\n{text}"

    try:
        response = model.generate_content(final_prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield chunk.text
                full_response += chunk.text
    except Exception as e:
        print(f"🚨 생성 중 에러 발생: {e}")
        yield f"\n[Error] AI 응답 실패: {str(e)}"

# ----------------------------------------------------------------
# 엔드포인트
# ----------------------------------------------------------------
@app.post("/analyze")
async def analyze_url(request: AnalyzeRequest):
    print(f"🚀 요청: {request.url}")
    
    crawled_text, crawled_image = await fetch_page_content(request.url)
    
    final_text = crawled_text if crawled_text else request.text_content
    final_image = crawled_image if crawled_image else "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop"

    return StreamingResponse(
        gemini_stream_generator(final_text, final_image, request.url),
        media_type="text/plain"
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)