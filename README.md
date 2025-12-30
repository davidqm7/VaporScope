# VaporScope: AI-Powered Steam Review Analyzer

**VaporScope** is a specialized Chrome Extension designed to solve "Review Paralysis" on the Steam store. Modern games often have tens of thousands of reviews, making it impossible for a user to get a clear consensus quickly. VaporScope injects a lightweight, native-feeling interface directly into the Steam DOM that uses Google's Gemini AI to read, synthesize, and summarize user sentiment in real-time.

It transforms a wall of text into a structured "Report Card" containing a Buying Verdict, a Pros/Cons list, and a cynical "One-Liner" summary.

---

## 🏗️ Architecture: The Serverless Edge

The project is built on a **Serverless Micro-SaaS Architecture**. This was chosen to eliminate server management overhead ("Zero Ops") and to ensure the application scales automatically from 1 user to 100,000 without crashing or costing money when idle.



[Image of serverless architecture diagram]


* **Frontend (The Client):** A Manifest V3 Chrome Extension that lives in the user's browser. It acts as the "Presentation Layer," handling DOM manipulation and user events.
* **Middleware (The API Gateway):** Cloudflare Workers. Unlike traditional servers (Node.js/Express) that live in a specific region (e.g., "us-east-1"), this API lives on the "Edge"—running on thousands of servers simultaneously worldwide to ensure low latency.
* **Persistence (The Memory):** Supabase (PostgreSQL). It acts as both a cache (to save money) and a usage tracker (to prevent abuse).
* **Intelligence (The Brain):** Google Gemini 2.5 Flash. Chosen specifically for its high token limit and extremely fast inference speed compared to GPT-4.

---

## 🛠️ Deep Dive: The Tech Stack

### 1. Frontend: Chrome Extension (Manifest V3)
The extension is the only part of the code the user sees. It is designed to be "invisible" until needed.

* **Manifest V3 Configuration:**
    * **Permissions:** strictly limited to `storage` (for local user ID) and `host_permissions` for `store.steampowered.com`. This "Least Privilege" model ensures fast Chrome Web Store reviews.
* **`content.js` ( The DOM Orchestrator):**
    * **Injection Logic:** Uses a heuristic algorithm to find the correct insertion point in Steam's HTML structure (targeting `.glance_ctn_responsive_right` or `.user_reviews_summary_bar`).
    * **Scraper Engine:** When triggered, it doesn't just grab text; it targets specific CSS selectors (`.review_box .content`) to extract the most "Helpful" rated reviews visible to the user.
    * **Shadow UI:** Renders the analysis card using vanilla JavaScript to keep the bundle size tiny (no React/Vue overhead).
* **`inject.css` (The Design System):**
    * Replicates Steam's exact color palette (`#1b2838` background, `#66c0f4` accents) and font stacks (Motiva Sans) so the button looks official, not like a third-party hack.
    * **Skeleton Loading:** Uses CSS keyframe animations to create a "pulsing" gray placeholder, reducing perceived latency while the AI thinks.

### 2. Backend: Cloudflare Workers
This is the security boundary. We **never** expose the Google Gemini API key or Supabase credentials to the frontend.

* **Runtime:** V8 JavaScript (Edge Network).
* **Security Handshake:**
    * **Origin Locking:** The worker inspects the `Origin` header of every incoming request. If it does not match `chrome-extension://[YOUR_ID]`, the request is instantly rejected (403 Forbidden). This prevents hackers from using your API on their own websites.
    * **CORS:** Configured to strictly allow only `POST` methods from the extension, blocking browser-based attacks.
* **Proxy Logic:**
    * It receives the raw data (`appId`, `reviews`).
    * It makes the decisions: "Do I have this cached?", "Is this user banned?", "Should I call AI?".

### 3. Database: Supabase (PostgreSQL)
We use Supabase not just for storage, but for logic control via two primary tables:

* **Table 1: `user_usage` (Rate Limiting)**
    * **Columns:** `user_id` (UUID), `usage_date` (DATE), `request_count` (INT).
    * **Logic:** We use a "Composite Key" constraint on `(user_id, usage_date)`. This allows us to perform an atomic "Upsert" (Update if exists, Insert if new) to track daily scans.
    * **The Rule:** If `request_count > 10`, the API returns a `429` error before ever calling the expensive AI.
* **Table 2: `game_summaries` (The Smart Cache)**
    * **Columns:** `steam_app_id` (INT), `summary_json` (JSONB), `created_at` (TIMESTAMP).
    * **Efficiency:** If 500 users check "Cyberpunk 2077" on launch day, we only pay for the AI analysis **once**. The other 499 users get the cached JSON from Supabase in <50ms.

### 4. AI Engine: Google Gemini 2.5 Flash
* **Why Flash?** We need speed. Users on a store page will click away if loading takes >3 seconds. Flash offers sub-second inference for this volume of text.
* **Persona Prompting:** The AI is instructed to act as a "Cynical Game Critic." This prevents generic "It is a good game" responses and forces the AI to look for specific nuances (performance issues, microtransactions, bugs).
* **JSON Enforcement:** The prompt explicitly forces a JSON output format, and the Worker code uses regex extraction (`substring(firstCurly, lastCurly)`) to ensure the UI never crashes from bad AI formatting.

---

## 🔄 The Data Flow Lifecycle

1.  **Initialization:**
    * User opens a Steam URL (e.g., `store.steampowered.com/app/1086940/Baldurs_Gate_3/`).
    * `content.js` wakes up, verifies the URL pattern, and injects the "Analyze" button into the DOM.
2.  **User Trigger:**
    * User clicks "Analyze."
    * The extension scrapes the top 10 reviews currently visible in the DOM.
    * **Local Check:** It retrieves the anonymous `userId` from Chrome local storage.
3.  **The API Request (Secure Tunnel):**
    * A secure `POST` request is sent to the Cloudflare Worker.
    * *Payload:* `{ appId: "1086940", reviews: ["Best RPG ever...", "Buggy act 3..."], userId: "xyz-123" }`.
4.  **Backend Decision Tree:**
    * **Security:** Is the `Origin` valid? (If no -> 403).
    * **Quota:** Does `user_usage` show < 10 requests today? (If no -> 429).
    * **Cache:** Does `game_summaries` have an entry for ID `1086940`?
        * **YES:** Return cached JSON immediately.
        * **NO:** Forward review text to Google Gemini API.
5.  **AI Processing (Cache Miss Only):**
    * Gemini processes the reviews and generates the verdict.
    * Worker saves the result to `game_summaries` (Cache Warming).
    * Worker updates `user_usage` count (+1).
6.  **Response & Render:**
    * The JSON arrives back at the extension.
    * `content.js` destroys the Skeleton Loader and hydrates the UI Card with the Verdict, Pros, and Cons.

---

## 🛡️ Security & Financial Safety (Defense in Depth)

Since this is a free community tool, financial safety is paramount to prevent "Cloud Bankruptcy."

1.  **Hard Quota (The Kill Switch):**
    * Google Cloud Console Quotas are configured to strictly limit **Gemini 2.5 Flash** requests to **500 per day**. If a botnet attacks, the API simply shuts off at $0.05 cost.
2.  **Application Rate Limiting:**
    * The SQL logic in Supabase enforces a strict 10-request cap per user.
3.  **Origin Isolation:**
    * The Cloudflare Worker rejects all traffic that does not come from the specific, signed Chrome Extension.
4.  **Data Privacy:**
    * No PII (Personally Identifiable Information) is ever collected. User IDs are random UUIDs generated locally on the user's machine.

## 📂 Project Directory Structure

```text
VAPOR-SCOPE/
├── icons/                   # Static assets
│   ├── 16x16.png            # Toolbar icon
│   ├── 32x32.png            # Store listing icon
│   ├── 48x48.png            # Management page icon
│   └── 128x128.png          # High-res install icon
├── scripts/
│   ├── content.js           # Main client logic (Scraper + UI Injector)
│   ├── background.js        # Service worker (Event listener for install)
│   └── inject.css           # Steam-native CSS styles & animations
├── worker.js                # Cloudflare Worker (API Gateway + AI Logic)
├── manifest.json            # Extension Config (Permissions: Storage + Host)
└── wrangler.toml            # Cloudflare Infrastructure-as-Code Config