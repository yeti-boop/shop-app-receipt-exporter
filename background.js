chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url) {
    return;
  }

  if (tab.url.includes("shop.app/orders")) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } else {
    console.warn(
      "Export failed: Please navigate to a specific receipt on shop.app/orders to use this extension."
    );
  }
});
