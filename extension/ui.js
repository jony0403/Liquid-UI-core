// [ui.js] 확실한 실행 & 토글 로직

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "TOGGLE_LIQUID_UI") {
    console.log("[UI] Toggle Command Received");
    toggleUI();
  }
});

let imageList = [];
let currentIndex = 0;

function toggleUI() {
  const existing = document.getElementById("liquid-ui-container");
  
  if (existing) {
    console.log("[UI] Closing...");
    existing.remove();
    document.body.style.overflow = "auto";
    return;
  }
  
  console.log("[UI] Opening...");
  // 바로 실행하지 않고 안전하게 init 호출
  initUI(0);
}

function initUI(retryCount) {
  // Logic 모듈 로드 체크 (최대 1초 대기)
  if (!window.LiquidLogic) {
    if (retryCount < 10) {
      console.log(`[UI] Logic not ready, retrying (${retryCount + 1}/10)...`);
      setTimeout(() => initUI(retryCount + 1), 100);
    } else {
      alert("Liquid View 오류: 스크립트 로딩 실패. 새로고침 해주세요.");
    }
    return;
  }

  document.body.style.overflow = "hidden";
  const container = document.createElement("div");
  container.id = "liquid-ui-container";
  container.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483647; background: #ffffff; 
    display: flex; justify-content: center; overflow-y: auto;
  `;
  
  const shadow = container.attachShadow({ mode: "open" });
  document.body.appendChild(container);

  renderBaseUI(shadow);

  try {
    // 로직 호출
    imageList = window.LiquidLogic.getTopImages();
    console.log("[UI] Images found:", imageList);
    
    currentIndex = 0;

    if (imageList.length > 0) {
      loadImage(shadow, 0);
    } else {
      shadow.getElementById('img-container').style.display = 'none';
    }
    
    // 텍스트 요약
    const contentNode = document.querySelector('.wiki-content') 
                      || document.querySelector('#mw-content-text')
                      || document.body;
    startStreaming(shadow, contentNode.innerText);
  } catch (err) {
    console.error(err);
    shadow.getElementById("stream-text").innerText = "오류 발생: " + err.message;
  }
}

function loadImage(shadow, index) {
  if (index >= imageList.length) {
    // 이미지 로드 실패 등으로 다 돌았는데도 없으면 숨김
    if (index === 0) shadow.getElementById('img-container').style.display = 'none';
    return;
  }

  const imgEl = shadow.getElementById("current-img");
  const counter = shadow.getElementById("img-counter");
  
  imgEl.style.opacity = '0.3';
  
  chrome.runtime.sendMessage({ action: "FETCH_IMAGE_BLOB", url: imageList[index] }, (res) => {
    if (res && res.success) {
      imgEl.src = res.data;
      imgEl.style.opacity = '1';
      counter.innerText = `${index + 1} / ${imageList.length}`;
      currentIndex = index;
    } else {
      console.log("[UI] Image Load Failed, trying next:", imageList[index]);
      loadImage(shadow, index + 1);
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

function renderBaseUI(shadow) {
  shadow.innerHTML = `
    <style>
      :host { width: 100%; min-height: 100vh; background: #fff; font-family: sans-serif; }
      .wrap { width: 100%; max-width: 800px; margin: 0 auto; padding: 60px 20px 100px; }
      .close-btn { position: fixed; top: 30px; right: 40px; font-size: 45px; cursor: pointer; border: none; background: none; z-index: 99999; }
      .close-btn:hover { color: red; transform: scale(1.1); }
      h1 { font-size: 40px; font-weight: 900; margin-bottom: 30px; color: #111; }
      #img-container { width: 100%; height: 50vh; margin-bottom: 40px; border-radius: 20px; background: #f8f9fa; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
      #current-img { max-width: 100%; max-height: 100%; object-fit: contain; opacity: 0; transition: opacity 0.3s; }
      .nav-btn { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.8); border: none; border-radius: 50%; width: 44px; height: 44px; cursor: pointer; font-size: 20px; font-weight: bold; z-index: 10; }
      #prev-btn { left: 15px; } #next-btn { right: 15px; }
      #img-counter { position: absolute; bottom: 15px; right: 20px; background: rgba(0,0,0,0.5); color: #fff; padding: 4px 10px; border-radius: 12px; font-size: 13px; }
      #stream-text { font-size: 20px; line-height: 1.8; color: #222; white-space: pre-wrap; }
    </style>
    <div class="wrap">
      <button class="close-btn" id="close-x">×</button>
      <h1>Liquid View</h1>
      <div id="img-container">
        <button class="nav-btn" id="prev-btn">‹</button>
        <img id="current-img" src="">
        <button class="nav-btn" id="next-btn">›</button>
        <div id="img-counter">1 / 5</div>
      </div>
      <div id="stream-text">분석 중...</div>
    </div>
  `;
  shadow.getElementById("close-x").onclick = () => toggleUI();
  shadow.getElementById("prev-btn").onclick = () => { if (currentIndex > 0) loadImage(shadow, --currentIndex); };
  shadow.getElementById("next-btn").onclick = () => { if (currentIndex < imageList.length - 1) loadImage(shadow, ++currentIndex); };
}