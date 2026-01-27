let liquidRoot = null;
let shadowRoot = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_LIQUID_UI") toggleUI();
});

function toggleUI() {
  if (liquidRoot) {
    document.body.removeChild(liquidRoot);
    liquidRoot = null;
    return;
  }

  liquidRoot = document.createElement("div");
  liquidRoot.style.cssText = `
    position: fixed; top: 20px; right: 20px; width: 375px; height: 800px;
    z-index: 2147483647; box-shadow: -5px 0 15px rgba(0,0,0,0.2);
    border-radius: 20px; background: white;
  `;
  shadowRoot = liquidRoot.attachShadow({ mode: "open" });
  document.body.appendChild(liquidRoot);

  renderUI("loading");
  analyzePage(window.location.href, document.body.innerText);
}

function renderUI(state, data = "") {
  const style = `<style>body{padding:20px;font-family:sans-serif;} a{display:block;padding:10px;border-bottom:1px solid #eee;}</style>`;
  
  if (state === "loading") {
    shadowRoot.innerHTML = style + `<h3>🧠 AI 분석 중...</h3>`;
  } else {
    shadowRoot.innerHTML = style + `
      <h2>🌊 Liquid Summary</h2>
      <div id="stream-target">${data}</div>
      <br>
      <a href="[https://www.google.com](https://www.google.com)">테스트 링크 (클릭해보셈)</a>
    `;
    attachLinkInterceptors();
  }
}

async function analyzePage(url, text) {
  try {
    const response = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url, text_content: text }),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    renderUI("success", "");
    const target = shadowRoot.getElementById("stream-target");
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      target.innerText += decoder.decode(value);
    }
  } catch (e) { shadowRoot.innerHTML += `<p style="color:red">${e.message}</p>`; }
}

function attachLinkInterceptors() {
  shadowRoot.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault(); // 이동 막기
      renderUI("loading");
      // 여기서 나중에 '새 URL' 분석 요청 보내면 됨
      analyzePage(link.href, "새 링크 클릭됨. (실제론 크롤링 필요)");
    });
  });
}