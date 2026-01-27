let liquidRoot = null;
let shadowRoot = null;

// 1. 메시지 수신
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_LIQUID_UI") {
    toggleUI();
  }
});

// [수정] 전체 화면 오버레이 모드
function toggleUI() {
  if (liquidRoot) {
    // 이미 열려있으면 닫기
    document.body.removeChild(liquidRoot);
    liquidRoot = null;
    // 원본 페이지 스크롤 다시 허용
    document.body.style.overflow = "auto";
    return;
  }

  // 원본 페이지 스크롤 막기 (뒤에꺼 움직이면 거슬림)
  document.body.style.overflow = "hidden";

  // UI 컨테이너 생성 (전체 화면)
  liquidRoot = document.createElement("div");
  liquidRoot.id = "liquid-ui-container";
  liquidRoot.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483647; 
    background: rgba(255, 255, 255, 0.98); /* 거의 불투명한 흰색 */
    backdrop-filter: blur(10px); /* 뒤 배경 살짝 흐리게 */
    overflow-y: auto; /* 내용 길면 스크롤 */
    display: flex;
    justify-content: center; /* 중앙 정렬 */
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

  shadowRoot = liquidRoot.attachShadow({ mode: "open" });
  document.body.appendChild(liquidRoot);

  // 등장 애니메이션 (페이드 인)
  requestAnimationFrame(() => {
    liquidRoot.style.opacity = "1";
  });

  // 클라이언트 사이드 이미지 확보
  const metaImg = document.querySelector('meta[property="og:image"]');
  const localImage = metaImg ? metaImg.content : "";
  let preloadedUrl = "";
  
  if (localImage) {
      preloadedUrl = `https://wsrv.nl/?url=${encodeURIComponent(localImage)}&w=800&h=400&fit=cover`;
  }

  // 로딩 화면 출력
  renderUI("loading");
  
  // 분석 시작
  analyzePage(window.location.href, document.body.innerText, preloadedUrl);
}

// UI 그리기 함수 (매거진 스타일)
function renderUI(state, data = "", imageUrl = "") {
  
  const defaultImg = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop";
  const finalUrl = imageUrl || defaultImg;
  const imgClass = "hero-image active"; 

  const style = `
    <style>
      :host {
        width: 100%;
        display: flex;
        justify-content: center;
      }
      body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; }
      
      /* 중앙 정렬된 종이 같은 컨테이너 */
      .container { 
        width: 100%; 
        max-width: 740px; /* 읽기 가장 편한 폭 */
        padding: 60px 20px 100px; /* 위아래 여백 넉넉히 */
        box-sizing: border-box; 
        position: relative;
      }

      /* 닫기 버튼 (우측 상단 고정) */
      .close-btn {
        position: fixed;
        top: 30px;
        right: 30px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #f1f3f5;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: #495057;
        transition: all 0.2s;
        z-index: 1000;
      }
      .close-btn:hover { background: #e9ecef; transform: scale(1.1); }

      h2 { 
        margin: 0 0 30px 0; 
        font-size: 28px; /* 제목 더 크게 */
        color: #212529; 
        font-weight: 800; 
        letter-spacing: -0.5px;
        display: flex; align-items: center; gap: 10px;
      }
      
      /* 이미지 스타일 (시원하게) */
      .hero-image { 
        width: 100%; 
        height: 350px; /* 높이 키움 */
        object-fit: cover; 
        border-radius: 20px; 
        margin-bottom: 40px; 
        display: none; 
        background: #f8f9fa; 
        box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      }
      .hero-image.active { display: block; }
      
      /* 본문 텍스트 (가독성 끝판왕) */
      .content { 
        line-height: 1.8; 
        font-size: 18px; /* 글자 크기 키움 */
        color: #343a40; 
        white-space: pre-wrap; 
        letter-spacing: -0.02em;
      }

      /* 로딩 디자인 */
      .loading { 
        display: flex; 
        flex-direction: column; 
        justify-content: center; 
        align-items: center; 
        height: 80vh; 
        text-align: center; 
      }
      .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 20px; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .loading-text { font-size: 16px; color: #868e96; font-weight: 500; }
      
      a { color: #228be6; text-decoration: none; border-bottom: 1px solid transparent; transition: border 0.2s; }
      a:hover { border-bottom: 1px solid #228be6; }
    </style>
  `;

  // 닫기 버튼 HTML
  const closeButton = `<button class="close-btn" id="close-btn">×</button>`;

  if (state === "loading") {
    shadowRoot.innerHTML = style + `
      ${closeButton}
      <div class="container">
        <div class="loading">
          <div class="spinner"></div>
          <div class="loading-text">Liquid AI가 페이지를 재구성 중입니다...</div>
        </div>
      </div>`;
  } else if (state === "success") {
    shadowRoot.innerHTML = style + `
      ${closeButton}
      <div class="container">
        <h2>🌊 Liquid View</h2>
        <img src="${finalUrl}" class="${imgClass}" id="summary-image" 
             onerror="this.onerror=null; this.src='${defaultImg}';">
        <div class="content" id="stream-target">${data}</div>
        <br>
        <div style="text-align: center; margin-top: 50px; color: #adb5bd; font-size: 14px;">
            Generated by Team Liquid
        </div>
      </div>
    `;
    attachLinkInterceptors();
  }

  // 닫기 버튼 이벤트 연결
  const btn = shadowRoot.getElementById("close-btn");
  if(btn) {
      btn.addEventListener("click", () => {
          toggleUI(); // 다시 호출하면 닫힘
      });
  }
}

// analyzePage 함수 (기존 로직 유지)
async function analyzePage(url, text, preloadedImage = "") {
  try {
    const response = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url, text_content: text }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = ""; 
    let pendingServerImage = "";
    let isRendered = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      buffer += chunk;

      if (buffer.includes("IMAGE_URL::") && buffer.includes("::END")) {
          const start = buffer.indexOf("IMAGE_URL::");
          const end = buffer.indexOf("::END");
          const rawUrl = buffer.substring(start + 11, end).trim();
          if (rawUrl) {
             pendingServerImage = `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=800&h=400&fit=cover`;
          }
          buffer = buffer.replace(/IMAGE_URL::.*?::END\s*/g, "");
      }

      if (!isRendered && buffer.trim().length > 0) {
        const finalImageToUse = preloadedImage || pendingServerImage;
        renderUI("success", buffer, finalImageToUse);
        isRendered = true;
      }

      if (isRendered) {
        const target = shadowRoot.getElementById("stream-target");
        if (target) {
            target.innerText = buffer;
        }
      }
    }
  } catch (e) {
      const loadingDiv = shadowRoot.querySelector(".loading");
      if (loadingDiv) {
          loadingDiv.innerHTML = `<p style="color:#fa5252; font-weight:bold;">Error Occurred<br>${e.message}</p>`;
      } else {
          shadowRoot.innerHTML += `<p style="color:red">Error: ${e.message}</p>`;
      }
  }
}

function attachLinkInterceptors() {
  const links = shadowRoot.querySelectorAll("a");
  links.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      renderUI("loading"); 
      analyzePage(link.href, ""); 
    });
  });
}