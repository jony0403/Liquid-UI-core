chrome.action.onClicked.addListener((tab) => {
  // 현재 보고 있는 탭(tab.id)에 메시지를 보낸다.
  chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_LIQUID_UI" })
    .catch((error) => {
      // 에러 방지: 만약 탭이 로딩 중이거나 권한이 없으면 무시
      console.log("메시지 전송 실패 (아마도 지원하지 않는 페이지):", error);
    });
});