// [ui.js] 이미지 슬라이더(Carousel) 탑재 UI

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "TOGGLE_LIQUID_UI") toggleUI();
});

// 전역 상태 관리 (현재 보고 있는 이미지 인덱스)
let currentIndex = 0;
let imageList = [];
let shadowRootRef = null;

function toggleUI() {
  const old = document.getElementById("liquid-ui-container");
  if (old) { old.remove(); document.body.style.overflow = "auto"; return; }

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
  shadowRootRef = shadow; // 나중에 쓰려고 저장

  // [Logic] 이미지 싹쓸이해오기
  imageList = window.LiquidLogic.collectAllImages();
  currentIndex = 0; // 0번부터 시작

  renderCarouselUI(shadow);
  
  // 첫 번째 이미지 로드
  if (imageList.length > 0) {
    loadImage(shadow, 0);
  } else {
    // 이미지가 아예 없으면 박스 숨김
    shadow.getElementById('carousel-box').style.display = 'none';
  }

  startStreaming(shadow, document.body.innerText);
}

// 이미지 로드 (Background에 요청)
function loadImage(shadow, index) {
  if (index < 0 || index >= imageList.length) return;
  
  const imgElement = shadow.getElementById('current-img');
  const counter = shadow.getElementById('img-counter');
  
  // 로딩 중 표시
  imgElement.style.opacity = '0.5';
  
  chrome.runtime.sendMessage({ action: "FETCH_IMAGE_BLOB", url: imageList[index] }, (response) => {
    if (response && response.success) {
      imgElement.src = response.data;
      imgElement.style.opacity = '1';
      // 카운터 업데이트 (예: 1 / 5)
      counter.innerText = `${index + 1} / ${imageList.length}`;
    } else {
      // 실패하면 다음 거 시도 (재귀)
      if (index + 1 < imageList.length) {
         currentIndex++;
         loadImage(shadow, currentIndex);
      }
    }
  });
}

// UI 렌더링
function renderCarouselUI(shadow) {
  shadow.innerHTML = `
    <style>
      :host { width: 100%; min-height: 100vh; background: #fff; }
      .wrap { 
        width: 100%; max-width: 800px; margin: 0 auto;
        padding: 80px 20px 100px; 
        font-family: -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif;
      }
      .close-btn { 
        position: fixed; top: 30px; right: 40px; font-size: 40px; cursor: pointer; border: none; background: none; z-index: 99999; 
      }
      
      h1 { font-size: 40px; font-weight: 900; margin-bottom: 30px; color: #111; }
      
      /* [슬라이더 스타일] */
      #carousel-box { 
        width: 100%; height: 50vh; margin-bottom: 40px; 
        background: #f4f4f4; border-radius: 20px; 
        position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;
      }
      
      #current-img { 
        max-width: 100%; max-height: 100%; object-fit: contain; 
        transition: opacity 0.3s;
      }
      
      /* 화살표 버튼 */
      .nav-btn {
        position: absolute; top: 50%; transform: translateY(-50%);
        background: rgba(255,255,255,0.8); border: none; border-radius: 50%;
        width: 50px; height: 50px; cursor: pointer; font-size: 24px; font-weight: bold;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1); z-index: 10;
        display: flex; align-items: center; justify-content: center;
      }
      .nav-btn:hover { background: #fff; transform: translateY(-50%) scale(1.1); }
      #prev-btn { left: 20px; }
      #next-btn { right: 20px; }
      
      /* 카운터 */
      #img-counter {
        position: absolute; bottom: 15px; right: 20px;
        background: rgba(0,0,0,0.6); color: #fff; padding: 5px 12px;
        border-radius: 20px; font-size: 14px;
      }

      #stream-text { font-size: 20px; line-height: 1.8; color: #333; white-space: pre-wrap; }
    </style>
    
    <div class="wrap">
      <button class="close-btn" id="close-x">✕</button>
      
      <h1>Liquid View</h1>
      
      <div id="carousel-box">
        <button class="nav-btn" id="prev-btn">‹</button>
        <img id="current-img" src="">
        <button class="nav-btn" id="next-btn">›</button>
        <div id="img-counter">0 / 0</div>
      </div>
      
      <div id="stream-text">분석 중...</div>
    </div>
  `;
  
  // 이벤트 리스너 연결
  shadow.getElementById("close-x").onclick = () => {
    document.getElementById("liquid-ui-container").remove();
    document.body.style.overflow = "auto";
  };

  shadow.getElementById("prev-btn").onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      loadImage(shadow, currentIndex);
    }
  };

  shadow.getElementById("next-btn").onclick = () => {
    if (currentIndex < imageList.length - 1) {
      currentIndex++;
      loadImage(shadow, currentIndex);
    }
  };
  
  // 이미지가 1개 이하면 버튼 숨기기
  if (imageList.length <= 1) {
    shadow.getElementById("prev-btn").style.display = 'none';
    shadow.getElementById("next-btn").style.display = 'none';
  }
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
      const chunk = decoder.decode(value);
      if (!chunk.includes("IMAGE_URL::")) target.innerText += chunk;
    }
  } catch (e) { target.innerText = "서버 연결 실패"; }
}