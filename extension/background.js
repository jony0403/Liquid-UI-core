// [background.js]
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_LIQUID_UI") {
    chrome.tabs.sendMessage(sender.tab ? sender.tab.id : request.tabId, { action: "TOGGLE_LIQUID_UI" })
      .catch(() => console.log("탭 연결 실패"));
    return;
  }

  if (request.action === "FETCH_IMAGE_BLOB") {
    fetch(request.url)
      .then(response => {
        if (!response.ok) throw new Error('Network fail');
        return response.blob();
      })
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, data: reader.result });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        // 실패해도 응답은 보내야 UI가 안 멈춤
        sendResponse({ success: false });
      });
    return true; 
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_LIQUID_UI" }).catch(() => {});
});