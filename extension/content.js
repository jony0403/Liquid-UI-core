let liquidRoot = null;
let shadowRoot = null;

// 1. 메시지 수신
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_LIQUID_UI") {
    toggleUI();
  }
});

// [수정] toggleUI: 로딩 중에는 이미지를 보여주지 않는다.
function toggleUI() {
  if (liquidRoot) {
    document.body.removeChild(liquidRoot);
    liquidRoot = null;
    return;
  }

  // UI 컨테이너 생성
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

  // 1. 클라이언트 사이드 이미지 확보 (하지만 아직 안 보여줌)
  const metaImg = document.querySelector('meta[property="og:image"]');
  const localImage = metaImg ? metaImg.content : "";
  let preloadedUrl = "";
  
  if (localImage) {
      preloadedUrl = `https://wsrv.nl/?url=${encodeURIComponent(localImage)}&w=400&h=200&fit=cover`;
  }

  // 2. 로딩 화면 출력 (이미지 없이 깔끔하게 스피너만)
  renderUI("loading");
  
  // 3. 분석 시작 (확보한 이미지를 넘겨줌)
  analyzePage(window.location.href, document.body.innerText, preloadedUrl);
}

// UI 그리기 함수
function renderUI(state, data = "", imageUrl = "") {
  
  const defaultImg = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop";
  const finalUrl = imageUrl || defaultImg;
  const imgClass = "hero-image active"; 

  const style = `
    <style>
      body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; }
      .container { padding: 20px; height: 100%; box-sizing: border-box; overflow-y: auto; }
      h2 { margin: 0 0 15px 0; font-size: 20px; color: #1a73e8; font-weight: 700; display: flex; align-items: center; gap: 8px;}
      
      .hero-image { width: 100%; height: 180px; object-fit: cover; border-radius: 12px; margin-bottom: 20px; display: none; background: #f0f0f0; }
      .hero-image.active { display: block; }
      
      .content { line-height: 1.7; font-size: 15px; color: #444; white-space: pre-wrap; }
      
      /* 로딩 디자인 */
      .loading { 
        display: flex; 
        flex-direction: column; 
        justify-content: center; 
        align-items: center; 
        height: 100%; 
        text-align: center; 
      }
      .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 15px; }
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .loading-text { font-size: 14px; color: #666; font-weight: 500; }
      
      a { color: #1a73e8; text-decoration: none; display: block; padding: 12px; background: #f8f9fa; border-radius: 8px; margin-top: 10px; font-weight: 500; font-size: 14px; transition: background 0.2s; }
      a:hover { background: #e8f0fe; }
    </style>
  `;

  if (state === "loading") {
    shadowRoot.innerHTML = style + `
      <div class="container">
        <div class="loading">
          <div class="spinner"></div>
          <div class="loading-text">AI가 페이지를 분석 중입니다...</div>
        </div>
      </div>`;
  } else if (state === "success") {
    shadowRoot.innerHTML = style + `
      <div class="container">
        <h2>🌊 Liquid Summary</h2>
        <img src="${finalUrl}" class="${imgClass}" id="summary-image" 
             onerror="this.onerror=null; this.src='${defaultImg}';">
        <div class="content" id="stream-target">${data}</div>
        <br>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      </div>
    `;
    attachLinkInterceptors();
  }
}

// [핵심 수정] analyzePage: 텍스트가 올 때까지 로딩을 유지한다.
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
    // 서버가 주는 이미지 URL을 임시 저장할 변수
    let pendingServerImage = "";
    // 화면이 전환되었는지 체크하는 깃발
    let isRendered = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      buffer += chunk;

      // 1. 이미지 URL 파싱 (화면엔 아직 안 그림)
      if (buffer.includes("IMAGE_URL::") && buffer.includes("::END")) {
          const start = buffer.indexOf("IMAGE_URL::");
          const end = buffer.indexOf("::END");
          const rawUrl = buffer.substring(start + 11, end).trim();
          
          // 서버 이미지를 찾으면 저장해둠 (나중에 씀)
          if (rawUrl) {
             pendingServerImage = `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=400&h=200&fit=cover`;
          }
          
          // 버퍼에서 이미지 태그 제거 (텍스트만 남김)
          buffer = buffer.replace(/IMAGE_URL::.*?::END\s*/g, "");
      }

      // 2. [결정적 순간] 버퍼에 '글자'가 쌓이기 시작했는가?
      // 공백 제거하고도 내용이 있어야 함.
      if (!isRendered && buffer.trim().length > 0) {
        
        // 우선순위: 내 브라우저가 찾은 이미지 > 서버가 찾은 이미지 > 기본값
        const finalImageToUse = preloadedImage || pendingServerImage;
        
        // ✨ 여기서 로딩을 끄고 -> 이미지와 텍스트를 동시에 띄운다!
        renderUI("success", buffer, finalImageToUse);
        isRendered = true;
      }

      // 3. 이미 화면이 떴으면, 텍스트가 들어오는 족족 추가해준다 (스트리밍 효과)
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
          loadingDiv.innerHTML = `<p style="color:red; font-weight:bold;">앗, 에러가 났어요!<br>${e.message}</p>`;
      } else {
          shadowRoot.innerHTML += `<p style="color:red">에러: ${e.message}</p>`;
      }
  }
}

function attachLinkInterceptors() {
  const links = shadowRoot.querySelectorAll("a");
  links.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      // 링크 이동 시 다시 로딩 화면으로
      renderUI("loading"); 
      analyzePage(link.href, ""); 
    });
  });
}