let liquidRoot = null;
let shadowRoot = null;

// 1. 메시지 수신
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_LIQUID_UI") {
    toggleUI();
  }
});

function toggleUI() {
  if (liquidRoot) {
    document.body.removeChild(liquidRoot);
    liquidRoot = null;
    return;
  }

  // 2. UI 컨테이너 (그림자 효과 추가)
  liquidRoot = document.createElement("div");
  liquidRoot.id = "liquid-ui-container";
  liquidRoot.style.cssText = `
    position: fixed; top: 20px; right: 20px; width: 380px; height: 800px;
    z-index: 2147483647; 
    border-radius: 20px; 
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    background: white;
    overflow: hidden;
    transition: all 0.3s ease;
  `;

  shadowRoot = liquidRoot.attachShadow({ mode: "open" });
  document.body.appendChild(liquidRoot);

  renderUI("loading");
  analyzePage(window.location.href, document.body.innerText);
}

// 3. UI 그리기 (이미지 태그 추가)
function renderUI(state, data = "", imageUrl = "") {
  // 스타일 정의
  const style = `
    <style>
      body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; }
      .container { padding: 20px; height: 100%; box-sizing: border-box; overflow-y: auto; }
      h2 { margin: 0 0 15px 0; font-size: 20px; color: #1a73e8; font-weight: 700; display: flex; align-items: center; gap: 8px;}
      .logo-icon { font-size: 24px; }
      
      /* 이미지 스타일 */
      .hero-image { width: 100%; height: 180px; object-fit: cover; border-radius: 12px; margin-bottom: 20px; display: none; background: #f0f0f0; }
      .hero-image.active { display: block; }
      
      .content { line-height: 1.7; font-size: 15px; color: #444; white-space: pre-wrap; }
      
      .loading { text-align: center; margin-top: 50%; transform: translateY(-50%); }
      .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      
      a { color: #1a73e8; text-decoration: none; display: block; padding: 12px; background: #f8f9fa; border-radius: 8px; margin-top: 10px; font-weight: 500; font-size: 14px; transition: background 0.2s; }
      a:hover { background: #e8f0fe; }
    </style>
  `;

  if (state === "loading") {
    shadowRoot.innerHTML = style + `
      <div class="container">
        <div class="loading">
          <div class="spinner"></div>
          <p>AI가 페이지를 분석 중입니다...</p>
        </div>
      </div>`;
  } else if (state === "success") {
    // 이미지가 있으면 active 클래스 추가
    const imgClass = imageUrl ? "hero-image active" : "hero-image";
    
    shadowRoot.innerHTML = style + `
      <div class="container">
        <h2>🌊 Liquid Summary</h2>
        <img src="${imageUrl}" class="${imgClass}" id="summary-image" onerror="this.style.display='none'">
        <div class="content" id="stream-target">${data}</div>
        <br>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      </div>
    `;
    attachLinkInterceptors();
  }
}

// 4. 데이터 분석 및 스트리밍 (핵심 로직 수정됨)
// [수정] 데이터가 진짜 도착해야 화면을 바꾸는 똑똑한 로직
async function analyzePage(url, text) {
  try {
    const response = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url, text_content: text }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = ""; 
    let isFirstChunk = true; // [핵심] 첫 데이터인지 확인하는 깃발

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      buffer += chunk;

      // [핵심 로직] AI가 입을 떼는 순간(첫 데이터 도착) 화면을 바꾼다!
      if (isFirstChunk) {
        renderUI("success", ""); // 이제 로딩 끄고 결과창 보여줌
        isFirstChunk = false;
      }

      // 이제 화면에 뿌리기
      const target = shadowRoot.getElementById("stream-target");
      const imageTag = shadowRoot.getElementById("summary-image");
      
      // (DOM이 생성된 후에만 업데이트)
      if (target) {
        if (buffer.includes("IMAGE_URL::") && buffer.includes("::END")) {
          const start = buffer.indexOf("IMAGE_URL::");
          const end = buffer.indexOf("::END");
          
          const imgUrl = buffer.substring(start + 11, end).trim();
          if (imageTag && imgUrl) {
            imageTag.src = imgUrl;
            imageTag.classList.add("active");
          }
          
          target.innerText = buffer.replace(/IMAGE_URL::.*?::END\s*/g, "");
        } else {
          target.innerText = buffer.replace(/IMAGE_URL::.*?::END\s*/g, "");
        }
      }
    }
  } catch (e) {
    // 에러 나면 로딩 화면 유지하면서 에러 메시지 띄우기
    const loadingDiv = shadowRoot.querySelector(".loading");
    if (loadingDiv) {
        loadingDiv.innerHTML = `<p style="color:red; font-weight:bold;">앗, 에러가 났어요!<br>${e.message}</p>`;
    } else {
        shadowRoot.innerHTML += `<p style="color:red">에러: ${e.message}</p>`;
    }
  }
}

// 5. 링크 가로채기
function attachLinkInterceptors() {
  const links = shadowRoot.querySelectorAll("a");
  links.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      renderUI("loading");
      // 새 링크 클릭 시 텍스트 없이 URL만 보냄 -> 서버 크롤링 유도
      analyzePage(link.href, ""); 
    });
  });
}