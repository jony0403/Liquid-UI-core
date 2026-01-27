# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import google.generativeai as genai
import httpx
from bs4 import BeautifulSoup
import asyncio
import os
from collections import OrderedDict # [NEW] 캐싱을 위한 도구
from dotenv import load_dotenv
load_dotenv()

# ==========================================
# [API KEY] 네 키가 여기 있어야 한다.
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
# ==========================================

genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [NEW] 1. 캐시 저장소 클래스 정의 (뇌의 단기 기억장치)
class LocalCache:
    def __init__(self, capacity: int = 100):
        self.cache = OrderedDict()
        self.capacity = capacity # 최대 100개까지만 기억

    def get(self, key: str):
        if key not in self.cache:
            return None
        self.cache.move_to_end(key) # 최근에 썼으니 맨 뒤로
        return self.cache[key]

    def put(self, key: str, value: str):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False) # 오래된 기억 삭제

# 서버가 켜지면 빈 기억장치 생성
summary_cache = LocalCache()

class AnalyzeRequest(BaseModel):
    url: str
    text_content: str | None = None

# [Final Version] 산탄총 방식 크롤러 (모든 태그 다 뒤짐)
async def fetch_page_content(url: str):
    DEFAULT_IMAGE = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop"

    # [핵심 1] 헤더를 진짜 사람처럼 완벽하게 위장
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.naver.com/" 
    }
    
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 1. 텍스트 추출
            for script in soup(["script", "style", "nav", "footer", "header", "iframe", "button"]):
                script.decompose()
            text = soup.get_text(separator=' ', strip=True)[:5000]
            
            # 2. 이미지 추출 (우선순위별로 샅샅이 뒤짐)
            image_url = ""
            
            # [Level 1] 메타 태그 (가장 확실함)
            candidates = [
                soup.find("meta", property="og:image"),
                soup.find("meta", name="twitter:image"),
                soup.find("meta", property="twitter:image") # 가끔 property로 쓰는 애들도 있음
            ]
            
            for candidate in candidates:
                if candidate and candidate.get("content"):
                    image_url = candidate["content"]
                    print(f"✅ 메타 태그에서 이미지 확보: {image_url[:30]}...")
                    break
            
            # [Level 2] 본문 이미지 강제 수색 (메타 태그가 없을 때)
            if not image_url:
                # 네이버 뉴스, 연예, 스포츠, 포스트 등 온갖 ID/Class 총집합
                selectors = [
                    "#img1", # 연예뉴스 대표 이미지
                    ".end_photo_org img", # 일반뉴스 본문 이미지
                    "#articleBodyContents img", 
                    "#newsEndContents img",
                    ".sc_view_img", # 포스트/블로그
                    "figure img",   # 일반적인 HTML5 구조
                    ".media_end_head_photo_img" # 최신 네이버 뉴스 헤더
                ]
                
                for selector in selectors:
                    img_tag = soup.select_one(selector)
                    if img_tag and img_tag.get("src"):
                        image_url = img_tag["src"]
                        print(f"✅ 본문 태그({selector})에서 이미지 확보: {image_url[:30]}...")
                        break

            # [결과 판정]
            if not image_url:
                print("⚠️ 모든 수색 실패. 기본 이미지 사용.")
                image_url = DEFAULT_IMAGE
            
            return text, image_url
            
        except Exception as e:
            print(f"Crawling Error: {e}")
            return None, None
    DEFAULT_IMAGE = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 1. 텍스트 추출 (불필요한 태그 제거)
            for script in soup(["script", "style", "nav", "footer", "header", "iframe"]):
                script.decompose()
            text = soup.get_text(separator=' ', strip=True)[:5000]
            
            # 2. 이미지 추출 (3중 안전장치)
            image_url = ""
            
            # [시도 1] 메타 태그 (og:image) - 가장 화질 좋음
            og_image = soup.find("meta", property="og:image")
            if og_image and og_image.get("content"):
                image_url = og_image["content"]
            
            # [시도 2] 트위터 태그 (twitter:image) - og:image 없을 때
            if not image_url:
                tw_image = soup.find("meta", name="twitter:image")
                if tw_image and tw_image.get("content"):
                    image_url = tw_image["content"]
            
            # [시도 3] 본문 안에서 첫 번째 이미지 찾기 (네이버 뉴스 특화)
            if not image_url:
                # 네이버 뉴스 본문 영역 ID들 (#dic_area: 일반뉴스, #articeBody: 연예 등)
                content_body = soup.select_one("#dic_area, #articleBodyContents, .news_end, #newsEndContents")
                if content_body:
                    first_img = content_body.find("img")
                    if first_img and first_img.get("src"):
                        image_url = first_img["src"]

            # [결과 판정]
            if image_url:
                print(f"📸 이미지 발견 성공: {image_url[:50]}...")
            else:
                print("⚠️ 끝내 이미지를 못 찾았습니다. 기본 이미지 사용.")
                image_url = DEFAULT_IMAGE
            
            return text, image_url
            
        except Exception as e:
            print(f"Crawling Error: {e}")
            return None, None
        
    # 우리가 사용할 '기본 이미지' (이미지 못 찾았을 때 띄울 짤)
    DEFAULT_IMAGE = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 1. 텍스트 추출
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()
            text = soup.get_text(separator=' ', strip=True)[:5000]
            
            # 2. 이미지 추출 (og:image -> twitter:image -> 없으면 기본값)
            image_url = ""
            og_image = soup.find("meta", property="og:image")
            
            if og_image and og_image.get("content"):
                image_url = og_image["content"]
            else:
                # [핵심] 이미지가 없으면 기본 이미지를 넣어라!
                print("⚠️ 이미지를 못 찾았습니다. 기본 이미지를 사용합니다.")
                image_url = DEFAULT_IMAGE
            
            return text, image_url
            
        except Exception as e:
            print(f"Crawling Error: {e}")
            return None, None
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()
            text = soup.get_text(separator=' ', strip=True)[:5000]
            
            image_url = ""
            og_image = soup.find("meta", property="og:image")
            if og_image:
                image_url = og_image["content"]
            
            return text, image_url
        except Exception as e:
            print(f"Crawling Error: {e}")
            return None, None

# [Update] 캐시 저장을 위해 구조 변경
async def gemini_stream_generator(text, image_url, url_key):
    full_response = "" # 전체 내용을 모을 변수
    
    # 1. 이미지 URL 먼저 전송
    if image_url:
        img_msg = f"IMAGE_URL::{image_url}::END\n"
        yield img_msg
        full_response += img_msg
    
    prompt = f"""
    [System Instruction]
    너는 'Liquid UI'의 AI 엔진이다.
    사용자가 제공한 웹페이지 텍스트를 모바일 환경에 맞춰 [3줄 요약]해라.
    핵심 정보만 남기고, 말투는 건조하고 명확하게 한국어로 작성해라.
    
    [Input Text]
    {text} 
    """

    try:
        response = await model.generate_content_async(prompt, stream=True)
        async for chunk in response:
            if chunk.text:
                yield chunk.text
                full_response += chunk.text # 말하는 족족 모은다
        
        # [NEW] 2. 다 말했으면 캐시에 저장 (URL을 키값으로)
        summary_cache.put(url_key, full_response)
        print(f"💾 Cached Saved for: {url_key}")

    except Exception as e:
        yield f"Error: {str(e)}"

@app.post("/analyze")
async def analyze_page(request: AnalyzeRequest):
    print(f"Request received for: {request.url}")
    
    # [NEW] 3. 캐시 확인 (기억 속에 있나?)
    cached_data = summary_cache.get(request.url)
    if cached_data:
        print(f"⚡ Cache Hit! (초고속 응답): {request.url}")
        # 저장된 거 바로 뱉어주는 함수
        async def cached_stream():
            yield cached_data
        return StreamingResponse(cached_stream(), media_type="text/event-stream")

    # 캐시에 없으면? -> 크롤링 시작
    target_text = request.text_content
    image_url = ""

    if not target_text:
        print("Text missing. Server will crawl...")
        fetched_text, fetched_image = await fetch_page_content(request.url)
        if fetched_text:
            target_text = fetched_text
            image_url = fetched_image
        else:
            return StreamingResponse(iter(["Error: 크롤링 실패"]), media_type="text/event-stream")
    
    # AI 생성 시작 (url도 같이 넘겨서 나중에 저장하게 함)
    return StreamingResponse(
        gemini_stream_generator(target_text, image_url, request.url), 
        media_type="text/event-stream"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)