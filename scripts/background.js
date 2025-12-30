// scripts/background.js
const BACKEND_URL = "https://vaper-scope-backend.vapor-scope.workers.dev";

// 1. Get or Create a Unique User ID
async function getUserId() {
  const result = await chrome.storage.local.get(['userId']);
  if (result.userId) {
    return result.userId;
  } else {
    // Generate a random ID (e.g., "550e8400-e29b-41d4...")
    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ userId: newId });
    return newId;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetch_summary") {
    
    // We must use an async wrapper to use 'await' inside the listener
    (async () => {
      try {
        const userId = await getUserId();

        const response = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appId: request.appId,
            reviews: request.reviews,
            userId: userId // <--- SEND THE BADGE
          })
        });

        const data = await response.json();

        // Pass status code so content script knows if it was a 429 (Limit Reached)
        sendResponse({ 
            success: response.ok, 
            status: response.status, 
            data: data, 
            userId: userId // <--- NEW: Pass the ID to the frontend
         });
        
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; 
  }
});