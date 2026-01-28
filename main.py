# [main.py] YAML 연동 & JSON 데이터 스트리밍 엔진
import os, uvicorn, yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# [모델 설정] 2.0 Flash (속도 최적화)
try:
    model = genai.GenerativeModel("gemini-2.0-flash")
except:
    model = genai.GenerativeModel("gemini-2.0-flash-exp")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class AnalyzeRequest(BaseModel):
    text_content: str

# YAML 로드 함수
def load_prompt(text):
    try:
        with open("prompt.yaml", "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
            return config["summary_prompt"].format(text_content=text)
    except Exception as e:
        print(f"YAML 로드 실패: {e}")
        return f"다음 텍스트를 핵심만 3줄로 요약해라:\n{text}"

async def gemini_stream_generator(text):
    # 1. 텍스트 길이 안전컷 (토큰 절약)
    safe_text = text[:20000] 
    
    # 2. 프롬프트 로드
    final_prompt = load_prompt(safe_text)
    
    # 3. AI 응답 생성 (JSON 포맷 유도)
    try:
        # generation_config를 통해 JSON 응답 확률을 높임
        res = await model.generate_content_async(
            final_prompt, 
            stream=True,
            generation_config={"response_mime_type": "application/json"} 
        )
        async for chunk in res:
            if chunk.text: yield chunk.text
    except Exception as e:
        yield f'{{"error": "{str(e)}"}}'

@app.post("/analyze")
async def analyze_url(request: AnalyzeRequest):
    return StreamingResponse(
        gemini_stream_generator(request.text_content), 
        media_type="application/json" # 이제 텍스트가 아니라 JSON 데이터임
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)