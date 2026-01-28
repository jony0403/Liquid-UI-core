// [ui.js] 배경색 적용 & 스마트 닫기 버튼

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "CHECK_STATUS") {
    const isOpen = !!document.getElementById("liquid-ui-container");
    sendResponse({ status: isOpen ? "OPEN" : "CLOSED" });
    return true;
  }
  if (msg.action === "CLOSE_UI") closeUI();
  if (msg.action === "OPEN_UI") initUI(0);
});

function closeUI() {
  const existing = document.getElementById("liquid-ui-container");
  if (existing) existing.remove();
  document.body.style.overflow = "auto";
}

function initUI(retryCount) {
  if (!window.LiquidLogic) {
    if (retryCount < 15) setTimeout(() => initUI(retryCount + 1), 100);
    else console.error("[UI] Logic module missing.");
    return;
  }

  if (document.getElementById("liquid-ui-container")) return;

  // [색상 가져오기]
  const colors = window.LiquidLogic.getSiteColors();
  const themeColor = colors.primary || "#ffffff";
  console.log("[UI] Theme Color:", themeColor);

  document.body.style.overflow = "hidden";
  const container = document.createElement("div");
  container.id = "liquid-ui-container";
  // [핵심] 배경색 적용
  container.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483647; 
    display: flex; justify-content: center; overflow-y: auto;
    background-color: ${themeColor}; 
  `;
  
  const shadow = container.attachShadow({ mode: "open" });
  document.body.appendChild(container);

  renderBaseUI(shadow, themeColor);

  try {
    const imageList = window.LiquidLogic.getTopImages();
    if (imageList.length > 0) {
      loadImage(shadow, imageList, 0);
    } else {
      shadow.getElementById('img-container').style.display = 'none';
    }
    
    const contentNode = document.querySelector('.wiki-content') 
                      || document.querySelector('#mw-content-text')
                      || document.body;
    startStreaming(shadow, contentNode.innerText);
  } catch (err) {
    shadow.getElementById("stream-text").innerText = "오류: " + err.message;
  }
}

function loadImage(shadow, list, index) {
  if (index >= list.length) {
    if (index === 0) shadow.getElementById('img-container').style.display = 'none';
    return;
  }

  const imgEl = shadow.getElementById("current-img");
  const counter = shadow.getElementById("img-counter");
  
  imgEl.style.opacity = '0.3';
  
  chrome.runtime.sendMessage({ action: "FETCH_IMAGE_BLOB", url: list[index] }, (res) => {
    if (res && res.success) {
      imgEl.src = res.data;
      imgEl.style.opacity = '1';
      counter.innerText = `${index + 1} / ${list.length}`;
      
      const prevBtn = shadow.getElementById("prev-btn");
      const nextBtn = shadow.getElementById("next-btn");
      prevBtn.onclick = () => { if (index > 0) loadImage(shadow, list, index - 1); };
      nextBtn.onclick = () => { if (index < list.length - 1) loadImage(shadow, list, index + 1); };

    } else {
      loadImage(shadow, list, index + 1);
    }
  });
}

async function startStreaming(shadow, text) {
  const target = shadow.getElementById("stream-text");
  try {
    const reader = await window.LiquidLogic.fetchSummary(text);
    const decoder = new TextDecoder();
    let isFirst = true;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (isFirst) { target.innerHTML = ""; isFirst = false; }
      target.innerText += decoder.decode(value);
    }
  } catch (e) { target.innerText = "서버 연결 실패 (포트 8000 확인)"; }
}

function renderBaseUI(shadow, themeColor) {
  // [닫기 버튼 색상 계산]
  // 배경이 밝으면(값이 크면) 검은 버튼, 어두우면 흰 버튼
  let closeBtnColor = "#111"; // 기본 검정
  if (themeColor.startsWith('rgb')) {
      const rgb = themeColor.match(/\d+/g);
      // 밝기 계산 (R+G+B / 3)
      if (rgb && (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3 < 128) {
          closeBtnColor = "#fff"; // 어두운 배경엔 흰색
      }
  }

  shadow.innerHTML = `
    <style>
      :host { 
        width: 100%; min-height: 100vh; 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        display: flex; justify-content: center;
        background: transparent; 
      }
      .wrap { 
        width: 100%; max-width: 800px; margin: 40px 20px 80px; padding: 50px 40px; 
        background: #ffffff; 
        border-radius: 30px; 
        box-shadow: 0 20px 50px rgba(0,0,0,0.3); 
        height: fit-content; min-height: 80vh;
      }
      .close-btn { 
        position: fixed; top: 30px; right: 40px; 
        font-size: 50px; cursor: pointer; border: none; background: none; z-index: 99999; 
        color: ${closeBtnColor}; /* 자동 계산된 색상 */
        opacity: 0.8; transition: transform 0.2s;
      }
      .close-btn:hover { transform: scale(1.1); opacity: 1; }
      
      h1 { font-size: 40px; font-weight: 900; margin-bottom: 30px; color: #111; letter-spacing: -1px; }
      #img-container { width: 100%; height: 45vh; margin-bottom: 40px; border-radius: 20px; background: #f1f3f5; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      #current-img { max-width: 100%; max-height: 100%; object-fit: contain; opacity: 0; transition: opacity 0.3s; }
      .nav-btn { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.9); border: none; border-radius: 50%; width: 48px; height: 48px; cursor: pointer; font-size: 24px; font-weight: bold; color: #333; box-shadow: 0 4px 10px rgba(0,0,0,0.1); z-index: 10; transition: background 0.2s; }
      .nav-btn:hover { background: #fff; }
      #prev-btn { left: 20px; } #next-btn { right: 20px; }
      #img-counter { position: absolute; bottom: 20px; right: 25px; background: rgba(0,0,0,0.6); color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: 600; backdrop-filter: blur(4px); }
      #stream-text { font-size: 18px; line-height: 1.8; color: #333; white-space: pre-wrap; word-break: keep-all; }
    </style>
    
    <button class="close-btn" id="close-x">×</button>
    <div class="wrap">
      <h1>Liquid View</h1>
      <div id="img-container">
        <button class="nav-btn" id="prev-btn">‹</button>
        <img id="current-img" src="">
        <button class="nav-btn" id="next-btn">›</button>
        <div id="img-counter"></div>
      </div>
      <div id="stream-text">데이터 분석 중...</div>
    </div>
  `;
  shadow.getElementById("close-x").onclick = () => closeUI();
}