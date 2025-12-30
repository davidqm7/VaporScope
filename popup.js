document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('analyze-btn');
  const status = document.getElementById('status');
  
  
  const BACKEND_URL = "https://vaper-scope-backend.vapor-scope.workers.dev";

  btn.addEventListener('click', async () => {
    // 1. Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 2. Check if we are on Steam
    if (!tab.url.includes("store.steampowered.com/app/")) {
      status.textContent = "Error: Not a Steam game page.";
      return;
    }

    status.textContent = "Scraping reviews...";
    btn.disabled = true;

    try {
      // 3. Send message to content.js to scrape reviews
      const response = await chrome.tabs.sendMessage(tab.id, { action: "get_reviews" });
      
      if (!response || !response.reviews || response.reviews.length === 0) {
        throw new Error("No reviews found.");
      }

      status.textContent = "Analyzing with AI...";

      // 4. Send data to your Backend
      const apiRes = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: response.appId,
          reviews: response.reviews
        })
      });

      if (!apiRes.ok) throw new Error("API Error");
      const data = await apiRes.json();

      // 5. Display Results
      displayResults(data);
      status.textContent = "Done!";

    } catch (err) {
      status.textContent = "Error: " + err.message;
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });

  function displayResults(data) {
    document.getElementById('result-card').style.display = 'block';
    
    // Fill Text
    document.getElementById('verdict').textContent = data.verdict;
    document.getElementById('oneliner').textContent = data.one_liner;
    document.getElementById('perf-score').textContent = data.performance_score + "/10";
    
    // Fill Lists
    const fillList = (id, items) => {
      const el = document.getElementById(id);
      el.innerHTML = "";
      items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        el.appendChild(li);
      });
    };
    fillList('pros-list', data.pros);
    fillList('cons-list', data.cons);

    // Animate Bar
    document.getElementById('perf-fill').style.width = (data.performance_score * 10) + "%";
  }
});