chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "esp-fetch-html" || !message.url) {
    return false;
  }

  fetch(message.url, {
    credentials: "include",
    redirect: "follow",
  })
    .then(async (response) => {
      const text = await response.text();
      sendResponse({
        ok: response.ok,
        status: response.status,
        text,
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        status: 0,
        error: error && error.message ? error.message : "Failed to fetch",
      });
    });

  return true;
});
