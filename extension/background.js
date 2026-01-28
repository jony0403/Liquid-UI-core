// [background.js] 탭 새로고침 및 실행 지휘관

// 새로고침 후 실행할 탭들을 기억하는 장부
const pendingTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  // 1. 현재 탭에 상태 확인 요청
  chrome.tabs.sendMessage(tab.id, { action: "CHECK_STATUS" })
    .then((response) => {
      if (response && response.status === "OPEN") {
        // [이미 켜져 있음] -> 끄라고 명령
        chrome.tabs.sendMessage(tab.id, { action: "CLOSE_UI" });
      } else {
        // [꺼져 있음] -> 새로고침 후 실행 절차 시작
        reloadAndRun(tab.id);
      }
    })
    .catch(() => {
      // [응답 없음/먹통] -> 스크립트가 죽었으므로 새로고침 후 살려냄
      reloadAndRun(tab.id);
    });
});

function reloadAndRun(tabId) {
  pendingTabs.add(tabId);
  chrome.tabs.reload(tabId); // 2. 강제 새로고침
}

// 3. 탭 로딩 상태 감시
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (pendingTabs.has(tabId) && changeInfo.status === 'complete') {
    // 로딩 끝! 이제 실행 명령 하달
    console.log(`[Background] Tab ${tabId} reloaded. Sending OPEN command.`);
    pendingTabs.delete(tabId);
    
    // 스크립트가 로드될 틈을 0.5초 주고 명령 (안정성 확보)
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: "OPEN_UI" })
        .catch((err) => console.log("실행 명령 실패 (페이지 권한 확인):", err));
    }, 500);
  }
});

// 이미지 다운로드 셔틀 (기존 유지)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FETCH_IMAGE_BLOB") {
    fetch(request.url)
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => sendResponse({ success: true, data: reader.result });
        reader.readAsDataURL(blob);
      })
      .catch(() => sendResponse({ success: false }));
    return true; 
  }
});