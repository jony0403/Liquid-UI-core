# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import google.generativeai as genai
import httpx
from bs4 import BeautifulSoup
import asyncio

# ==========================================
# [API KEY] 네 키가 여기 있어야 한다.
GOOGLE_API_KEY = "AIzaSyAN5W65r8wDmlChmGJgtlNrbPCKWKpJ3pc"
# ==========================================

genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash') # 최신 엔진

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 요청 데이터 형식: URL만 올 수도 있고, 텍스트가 올 수도 있음
class AnalyzeRequest(BaseModel):
    url: str
    text_content: str | None = None # 텍스트는 없을 수도 있음 (링크 클릭 시)

# [핵심 기능] URL로 들어가서 본문과 썸네일 훔쳐오기
async def fetch_page_content(url: str):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 1. 텍스트 추출 (script, style 태그 제거)
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()
            text = soup.get_text(separator=' ', strip=True)[:5000] # 5000자 제한
            
            # 2. 메인 이미지(썸네일) 추출 (OpenGraph 태그 우선)
            image_url = ""
            og_image = soup.find("meta", property="og:image")
            if og_image:
                image_url = og_image["content"]
            
            return text, image_url
            
        except Exception as e:
            print(f"Crawling Error: {e}")
            return None, None

# Gemini 스트리밍 (이미지 URL 포함)
async def gemini_stream_generator(text, image_url):
    # 먼저 이미지 URL을 JSON 형태로 한 줄 보냄
    if image_url:
        yield f"IMAGE_URL::{image_url}::END\n"
    
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
    except Exception as e:
        yield f"Error: {str(e)}"

@app.post("/analyze")
async def analyze_page(request: AnalyzeRequest):
    print(f"Request received for: {request.url}")
    
    target_text = request.text_content
    image_url = ""

    # 만약 텍스트가 안 왔으면 (링크 클릭 상황), 서버가 직접 가서 긁어온다.
    if not target_text:
        print("Text missing. Server will crawl...")
        fetched_text, fetched_image = await fetch_page_content(request.url)
        if fetched_text:
            target_text = fetched_text
            image_url = fetched_image
        else:
            return StreamingResponse(iter(["Error: 크롤링에 실패했습니다."]), media_type="text/event-stream")
    
    # 텍스트가 있으면 바로 요약 시작
    return StreamingResponse(
        gemini_stream_generator(target_text, image_url), 
        media_type="text/event-stream"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)