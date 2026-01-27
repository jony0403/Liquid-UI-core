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

  // [핵심 기술] 현재 페이지의 메타태그(og:image)를 직접 조회
  // 서버가 못 찾아도 내 브라우저는 알고 있다.
  const metaImg = document.querySelector('meta[property="og:image"]');
  const localImage = metaImg ? metaImg.content : "";

  // [중요] 세탁소(Proxy)를 거쳐서 바로 띄워버린다.
  let finalImgUrl = "";
  if (localImage) {
      finalImgUrl = `https://wsrv.nl/?url=${encodeURIComponent(localImage)}&w=400&h=200&fit=cover`;
  }

  // 로딩 화면이 뜰 때, 이미지는 미리 박아둔다. (기다릴 필요 없음)
  renderUI("loading", "", finalImgUrl);
  
  // 텍스트 분석 시작 (이미지 URL은 이미 찾았으니 텍스트만 신경 쓰라고 함)
  analyzePage(window.location.href, document.body.innerText, finalImgUrl);
}

// 2. UI 그리기 (이미지 강제 노출 로직 적용됨)
function renderUI(state, data = "", imageUrl = "") {
  
  // [핵심] 기본 이미지 설정
  const defaultImg = "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=3870&auto=format&fit=crop";
  
  // 서버가 준 URL이 있으면 쓰고, 없거나 빈칸이면 기본값 사용
  const finalUrl = imageUrl || defaultImg;
  
  // 무조건 'active'를 붙여서 숨겨지는 일 없게 함
  const imgClass = "hero-image active"; 

  const style = `
    <style>
      body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; }
      .container { padding: 20px; height: 100%; box-sizing: border-box; overflow-y: auto; }
      h2 { margin: 0 0 15px 0; font-size: 20px; color: #1a73e8; font-weight: 700; display: flex; align-items: center; gap: 8px;}
      
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

// [수정] analyzePage 함수: 이미 찾은 이미지가 있으면 서버 이미지는 무시한다.
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
    let isFirstChunk = true;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      buffer += chunk;

      if (isFirstChunk) {
        // 이미지가 있으면 그걸 쓰고, 없으면 빈칸으로 시작
        renderUI("success", "", preloadedImage); 
        isFirstChunk = false;
      }

      const target = shadowRoot.getElementById("stream-target");
      const imageTag = shadowRoot.getElementById("summary-image");
      
      if (target) {
        if (buffer.includes("IMAGE_URL::") && buffer.includes("::END")) {
          const start = buffer.indexOf("IMAGE_URL::");
          const end = buffer.indexOf("::END");
          
          // 서버가 찾은 이미지 주소
          const rawUrl = buffer.substring(start + 11, end).trim();
          
          // [핵심] 
          // 1. 우리가 이미 찾은 이미지(preloadedImage)가 있으면 서버 거 무시!
          // 2. 만약 우리가 못 찾았는데(빈칸), 서버가 찾았으면 그걸 쓴다.
          if (!preloadedImage && rawUrl) {
             const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=400&h=200&fit=cover`;
             if (imageTag) imageTag.src = proxyUrl;
          }
          
          target.innerText = buffer.replace(/IMAGE_URL::.*?::END\s*/g, "");
        } else {
          target.innerText = buffer.replace(/IMAGE_URL::.*?::END\s*/g, "");
        }
      }
    }
  } catch (e) {
      // 에러 처리 (기존과 동일)
      const loadingDiv = shadowRoot.querySelector(".loading");
      if (loadingDiv) loadingDiv.innerHTML = `<p style="color:red;">에러: ${e.message}</p>`;
  }
}

// 4. 링크 클릭 가로채기 (페이지 이동 방지)
function attachLinkInterceptors() {
  const links = shadowRoot.querySelectorAll("a");
  links.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault(); // 이동 막고
      renderUI("loading"); // 로딩 띄우고
      analyzePage(link.href, ""); // 그 자리에서 분석 시작
    });
  });
}