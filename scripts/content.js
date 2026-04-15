console.log("🚀 VaporScope Loaded!");

// 1. INJECT BUTTON
const button = document.createElement('button');
button.innerText = "✨ Analyze Reviews";
button.className = "btn_green_white_innerfade btn_medium"; 
button.style.marginBottom = "15px"; 
button.style.width = "100%";

function injectButton() {
    const potentialAnchors = [
        '.user_reviews_summary_bar', 
        '.glance_ctn_responsive_right', 
        '#game_highlights .rightcol',
        '.apphub_OtherSiteInfo'
    ];
    let anchor = null;
    for (const selector of potentialAnchors) {
        const found = document.querySelector(selector);
        if (found) { anchor = found; break; }
    }
    if (anchor) {
        if (anchor.classList.contains('glance_ctn_responsive_right')) {
            anchor.insertBefore(button, anchor.firstChild);
        } else {
            anchor.parentNode.insertBefore(button, anchor);
        }
    }
}
injectButton();

// 2. CREATE CARD
const card = document.createElement('div');
card.className = "vapor-scope-card"; 

function showLoadingState(card) {
    card.innerHTML = `
        <div class="vs-header"><span class="vs-logo">VaporScope AI</span></div>
        <div class="vs-skeleton">
            <div class="vs-skeleton-title"></div>
            <div class="vs-skeleton-text"></div>
            <br>
            <div class="vs-grid">
                <div><div class="vs-skeleton-text"></div></div>
                <div><div class="vs-skeleton-text"></div></div>
            </div>
        </div>`;
}

function renderCard(card, data) {
    let verdictClass = 'wait';
    if (data.verdict.toLowerCase().includes('buy')) verdictClass = 'buy';
    if (data.verdict.toLowerCase().includes('avoid')) verdictClass = 'avoid';

    card.innerHTML = `
        <div class="vs-header">
            <span class="vs-logo">VaporScope AI</span>
        </div>
        <div class="vs-verdict ${verdictClass}">${data.verdict}</div>
        <div class="vs-one-liner">"${data.one_liner}"</div>
        <div class="vs-grid">
            <div class="vs-pros">
                <span class="vs-list-title">Pros</span>
                <ul class="vs-list">${data.pros.map(p => `<li>${p}</li>`).join('')}</ul>
            </div>
            <div class="vs-cons">
                <span class="vs-list-title">Cons</span>
                <ul class="vs-list">${data.cons.map(c => `<li>${c}</li>`).join('')}</ul>
            </div>
        </div>`;
}

// 3. EVENT LISTENER
button.addEventListener('click', async () => {
    const url = window.location.href;
    const appIdMatch = url.match(/\/app\/(\d+)/);
    const appId = appIdMatch ? appIdMatch[1] : null;

    if (!appId) { alert("Could not find App ID!"); return; }

    button.parentNode.insertBefore(card, button.nextSibling);
    showLoadingState(card);

    try {
        // Fetch raw JSON reviews directly from Steam's internal API
        const apiUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&filter=summary&language=english&review_type=all&purchase_type=all&num_per_page=10`;
        
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (!data || !data.reviews || data.reviews.length === 0) {
            card.innerHTML = `<div style="padding:20px;">No reviews found for this game yet.</div>`;
            return;
        }

        let reviews = data.reviews
            .map(r => r.review.trim())
            .filter(text => text.length > 15);

        chrome.runtime.sendMessage(
            { action: "fetch_summary", appId: appId, reviews: reviews },
            (response) => {
                // 🚨 SAFETY NET: Check if the extension was just updated/reloaded
                if (chrome.runtime.lastError) {
                    console.error("Chrome Runtime Error:", chrome.runtime.lastError.message);
                    card.innerHTML = `<div style="padding:20px; color:#c02942"><b>Connection Lost:</b> Please refresh the Steam page and try again.</div>`;
                    return;
                }

                if (response && response.success) {
                    renderCard(card, response.data);
                } else if (response && response.status === 429) {
                    card.innerHTML = `
                        <div style="text-align:center; padding: 25px;">
                            <h2 style="color:#66c0f4; margin-top:0; font-size: 20px;">Daily Limit Reached</h2>
                            <p style="color:#8f98a0;">This is a free demo tool. You have used your 10 free scans for today. <br><br>Please come back tomorrow!</p>
                        </div>`;
                } else {
                    // Log the detailed error so we can see it in DevTools
                    console.error("Backend Response Error:", response);
                    const errorData = (response && response.data) || {};
                    const errorMsg = errorData.error || response?.error || "Unknown error";
                    card.innerHTML = `<div style="padding:20px; color:#c02942">Error: ${errorMsg} <br><br><small>(Check Console for details)</small></div>`;
                }
            }
        );
    } catch (err) {
        console.error("Fetch Error:", err);
        card.innerHTML = `<div style="padding:20px; color:#c02942">Failed to connect to Steam. Please try again.</div>`;
    }
});