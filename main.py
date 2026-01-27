import os
import uvicorn
import yaml  # [New] YAML 파일 읽기 도구
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
from bs4 import BeautifulSoup

# 1. 환경변수 및 API 키 설정
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("⚠️ GOOGLE_API_KEY가 .env 파일에 없습니다!")

genai.configure(api_key=api_key)
model = genai.GenerativeModel("gemini-1.5-flash")

# 2. FastAPI 앱 설정
app = FastAPI()

# CORS 설정 (확장프로그램에서 접근 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. 데이터 모델 정의
class AnalyzeRequest(BaseModel):
    url: str
    text_content: str

# ----------------------------------------------------------------
# [Module 1] 프롬프트 로더 (Dynamic Brain)
# ----------------------------------------------------------------
def load_prompts():
    """prompts.yaml 파일을 읽어서 딕셔너리로 반환"""
    try:
        with open('prompts.yaml', 'r', encoding='utf-8') as f:
            print("📂 프롬프트 파일 로드 성공")
            return yaml.safe_load(f)
    except Exception as e:
        print(f"⚠️ 프롬프트 파일 로드 실패 (기본값 사용): {e}")
        return {
            "default": "내용을 3줄로 요약해줘."
        }

# ----------------------------------------------------------------
# [Module 2] 산탄총 크롤러 (Eagle Eye)
# ----------------------------------------------------------------
async def fetch_page_content(url: str):
    # 기본 이미지 (실패 시 대타)
    DEFAULT_IMAGE = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop"

    # 사람처럼 보이기 위한 위장술
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Referer": "https://www.google.com/"
    }
    
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            print(f"🕵️ 크롤링 시작: {url}")
            response = await client.get(url, headers=headers, timeout=10.0)
            
            # 인코딩 자동 감지 (한글 깨짐 방지)
            if response.encoding is None:
                response.encoding = 'utf-8'
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 1. 텍스트 추출 (불필요한 태그 제거)
            for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "button", "svg"]):
                tag.decompose()
            text = soup.get_text(separator=' ', strip=True)[:6000] # 6000자로 제한
            
            # 2. 이미지 추출 (산탄총 방식: 걸릴 때까지 다 뒤짐)
            image_url = ""
            
            # [Level 1] 메타 태그 (가장 확실함)
            candidates = [
                soup.find("meta", property="og:image"),
                soup.find("meta", name="twitter:image"),
                soup.find("meta", property="twitter:image")
            ]
            for candidate in candidates:
                if candidate and candidate.get("content"):
                    image_url = candidate["content"]
                    print(f"✅ 메타 태그 이미지 발견: {image_url[:30]}...")
                    break
            
            # [Level 2] 본문 이미지 강제 수색
            if not image_url:
                selectors = [
                    "#img1", ".end_photo_org img", "#articleBodyContents img", 
                    ".product-image img", ".detail_img", "figure img", "article img"
                ]
                for selector in selectors:
                    img_tag = soup.select_one(selector)
                    if img_tag and img_tag.get("src"):
                        image_url = img_tag["src"]
                        print(f"✅ 본문 태그({selector}) 이미지 발견: {image_url[:30]}...")
                        break

            # [결과 판정]
            if not image_url:
                print("⚠️ 이미지 발견 실패. 기본 이미지 사용.")
                image_url = DEFAULT_IMAGE
            
            return text, image_url
            
        except Exception as e:
            print(f"❌ 크롤링 에러: {e}")
            return None, None

# ----------------------------------------------------------------
# [Module 3] 스트리밍 제너레이터 (Stream Core)
# ----------------------------------------------------------------
async def gemini_stream_generator(text, image_url, url_key):
    full_response = ""
    
    # 1. 이미지 URL 먼저 전송 (프론트엔드가 바로 띄울 수 있게)
    if image_url:
        img_msg = f"IMAGE_URL::{image_url}::END\n"
        yield img_msg
        full_response += img_msg
    
    # 2. 최신 프롬프트 로드 (개발 중 실시간 반영을 위해 매번 로드)
    current_prompts = load_prompts()
    selected_system_prompt = current_prompts.get("default", "요약해줘.")
    
    # 3. 상황별 프롬프트 스위칭 (Context Awareness)
    if "news" in url_key or "article" in url_key:
        print("🧠 모드: 뉴스 요약")
        selected_system_prompt = current_prompts.get("news", selected_system_prompt)
        
    elif "coupang" in url_key or "store" in url_key or "shop" in url_key:
        print("🧠 모드: 쇼핑 분석")
        selected_system_prompt = current_prompts.get("shopping", selected_system_prompt)
        
    elif "velog" in url_key or "github" in url_key or "tistory" in url_key or "blog" in url_key:
        print("🧠 모드: 기술 블로그")
        selected_system_prompt = current_prompts.get("tech", selected_system_prompt)

    # 4. 최종 프롬프트 조립
    final_prompt = f"""
    {selected_system_prompt}
    
    [Input Content]
    {text} 
    """

    # 5. Gemini 호출 및 스트리밍
    try:
        response = model.generate_content(final_prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield chunk.text
                full_response += chunk.text
    except Exception as e:
        yield f"\n[Error] AI 생성 중 문제가 발생했습니다: {str(e)}"

# ----------------------------------------------------------------
# [API Endpoint]
# ----------------------------------------------------------------
@app.post("/analyze")
async def analyze_url(request: AnalyzeRequest):
    print(f"🚀 요청 수신: {request.url}")
    
    # 1. 크롤링 (이미지 + 텍스트)
    crawled_text, crawled_image = await fetch_page_content(request.url)
    
    # 2. 크롤링 실패 시 프론트에서 준 텍스트 사용 (이미지는 기본값)
    final_text = crawled_text if crawled_text else request.text_content
    final_image = crawled_image if crawled_image else "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop"

    # 3. 스트리밍 응답 시작
    return StreamingResponse(
        gemini_stream_generator(final_text, final_image, request.url),
        media_type="text/plain"
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)