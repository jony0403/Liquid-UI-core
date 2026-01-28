// [background.js] 이미지 데이터 직접 납치 버전
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_LIQUID_UI" })
    .catch((error) => console.log("탭 오류:", error));
});

// [핵심] Content Script의 요청을 받아 이미지를 Blob 데이터로 변환해 리턴한다.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FETCH_IMAGE_BLOB") {
    fetch(request.url)
      .then(response => response.blob())
      .then(blob => {
        // Blob을 Base64 문자열(Data URL)로 변환
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, data: reader.result });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error("이미지 납치 실패:", error);
        sendResponse({ success: false });
      });
    return true; // 비동기 응답을 위해 필수
  }
});