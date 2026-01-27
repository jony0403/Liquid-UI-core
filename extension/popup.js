document.getElementById("analyzeBtn").addEventListener("click", async () => {
  const statusText = document.getElementById("statusText");
  const resultArea = document.getElementById("resultArea");
  const btn = document.getElementById("analyzeBtn");

  // 1. UI 초기화 (로딩 중 표시)
  btn.disabled = true;
  resultArea.innerText = "";
  statusText.innerText = "🕵️ 웹페이지 분석 중...";

  try {
    // 2. 현재 활성화된 탭의 정보를 가져옴
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      throw new Error("활성화된 탭을 찾을 수 없습니다.");
    }

    // 3. 현재 탭에서 스크립트를 실행해서 '본문 텍스트'만 긁어오기
    const executeResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText, // 페이지 전체 텍스트 추출
    });

    const pageText = executeResult[0].result;
    
    if (!pageText) {
      throw new Error("페이지에서 텍스트를 읽을 수 없습니다.");
    }

    statusText.innerText = "🧠 Gemini가 생각하는 중...";

    // 4. 서버로 텍스트 전송 (POST 요청)
    const response = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: tab.url,
        text_content: pageText // 긁어온 텍스트 전송
      }),
    });

    if (!response.ok) {
      throw new Error("서버 에러: " + response.status);
    }

    // 5. 스트리밍 데이터 받기 (한 글자씩 읽기)
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    statusText.innerText = "⚡ 실시간 생성 중...";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      // 받아온 조각(chunk)을 글자로 변환해서 화면에 붙이기
      const chunk = decoder.decode(value);
      resultArea.innerText += chunk;
      
      // 스크롤 자동으로 맨 아래로
      resultArea.scrollTop = resultArea.scrollHeight;
    }

    statusText.innerText = "✅ 완료";

  } catch (error) {
    console.error(error);
    resultArea.innerText = "에러 발생: " + error.message;
    statusText.innerText = "❌ 실패";
  } finally {
    btn.disabled = false;
  }
});