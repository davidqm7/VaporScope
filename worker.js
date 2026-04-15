import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 🔒 SECURITY: Replace with your actual Extension ID
const ALLOWED_ORIGIN = "chrome-extension://jjijnfboadbbebbbljkohheepooleinb"; 

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    // 1. Security Check (Stop Hackers)
    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN && !origin.includes("localhost")) {
       return new Response("Forbidden", { status: 403 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
      const { appId, reviews, userId } = await request.json();
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

      // --- 🚨 SIMPLE DAILY LIMIT (No Pro Mode) ---
      // Limit everyone to 10 scans per day (generous but safe)
      const DAILY_LIMIT = 10; 

      if (userId) {
        const today = new Date().toISOString().split('T')[0];
        
        const { data: usage } = await supabase
          .from('user_usage')
          .select('request_count')
          .eq('user_id', userId)
          .eq('usage_date', today)
          .single();

        if (usage && usage.request_count >= DAILY_LIMIT) {
          return new Response(JSON.stringify({ 
            error: "Daily demo limit reached. Come back tomorrow!",
            isLimit: true 
          }), { status: 429, headers: corsHeaders });
        }

        const newCount = (usage ? usage.request_count : 0) + 1;
        await supabase.from('user_usage').upsert({ 
          user_id: userId, 
          usage_date: today, 
          request_count: newCount 
        }, { onConflict: 'user_id, usage_date' });
      }
      // ---------------------------------

      // CACHE CHECK
      const { data: cachedData, error } = await supabase
        .from('game_summaries')
        .select('*')
        .eq('steam_app_id', appId)
        .single();

      if (cachedData && !error) {
        return new Response(JSON.stringify(cachedData.summary_json), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // AI GENERATION
      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const todayDate = new Date().toLocaleDateString("en-US");
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      const prompt = `
        You are a helpful game critic. Context: Today is ${todayDate}.
        Analyze these reviews: ${JSON.stringify(reviews)}
        Return JSON: { "verdict": "Buy / Wait / Avoid", "one_liner": "...", "pros": [], "cons": [] }
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Robust JSON Extraction
      const firstCurly = responseText.indexOf('{');
      const lastCurly = responseText.lastIndexOf('}');
      if (firstCurly === -1) throw new Error("Invalid AI Response");
      
      const cleanJson = responseText.substring(firstCurly, lastCurly + 1);
      const summary = JSON.parse(cleanJson);

      await supabase.from('game_summaries').insert([
        { steam_app_id: appId, summary_json: summary }
      ]);

      return new Response(JSON.stringify(summary), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  },
};