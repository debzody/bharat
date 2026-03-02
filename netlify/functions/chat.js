// AI Chat Support — uses Google Gemini API (free tier)
// Set GEMINI_API_KEY in Netlify environment variables

const SYSTEM_PROMPT = `You are a friendly and knowledgeable travel assistant for "Bharat Tours & Travels" — an Andaman Islands tour operator.

PACKAGES WE OFFER:
1. Budget Andaman Escape — ₹15,999/person | 4 Nights / 5 Days
   Inclusions: Hotels, Ferries, Breakfast, Sightseeing
   Highlights: Radhanagar Beach, Cellular Jail, Ross Island, Havelock Ferry
   Itinerary: Day 1 Port Blair arrival, Day 2 Havelock Island, Day 3 Beaches, Day 4 Return, Day 5 Departure

2. Standard Andaman Bliss — ₹21,999/person | 6 Nights / 7 Days
   Inclusions: Deluxe Hotels, Ferries, Breakfast, All Sightseeing, Scuba Diving
   Highlights: Havelock, Neil Island, Scuba Diving, Cellular Jail
   Itinerary: Port Blair 2 nights → Havelock 2 nights → Neil Island 1 night → Port Blair

3. Luxury Andaman Retreat — ₹28,999/person | 6 Nights / 7 Days
   Inclusions: 5-Star Resorts, Private Yacht, All Meals, Advanced Scuba, Spa
   Highlights: Private Beach, Advanced Scuba Diving, Sunset Cruise, Private Yacht

4. Honeymoon Paradise — ₹24,999/couple | 5 Nights / 6 Days
   Inclusions: Couple Resort, Candlelight Dinner, Spa, Sunset Cruise, Photoshoot
   Highlights: Romantic Beach Dinners, Couple Spa, Professional Photoshoot

KEY INFORMATION:
- Location: Andaman & Nicobar Islands, India
- Best time to visit: October to May (avoid monsoon June–September)
- Airport: Veer Savarkar International Airport, Port Blair
- Popular beaches: Radhanagar Beach (Asia's best), Elephant Beach, Laxmanpur Beach
- Popular activities: Scuba diving, snorkeling, island hopping, glass-bottom boat, sea walking
- Booking: Via our website, payment accepted online via Razorpay
- Contact: Available on the website's Contact page

INSTRUCTIONS:
- Be warm, helpful, and concise
- Always mention prices in ₹
- If asked about booking, direct them to click "Book Now" on any package
- For complex queries, suggest contacting us directly
- Keep replies under 150 words unless detailed info is needed
- Do not make up package details not mentioned above`;

exports.handler = async function (event) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let message, history;
    try {
        ({ message, history = [] } = JSON.parse(event.body));
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // ── Fallback rule-based replies if no API key ──────────────
    if (!apiKey) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ reply: getFallback(message) })
        };
    }

    // ── Call Gemini API ─────────────────────────────────────────
    try {
        const contents = [
            // Seed the conversation with system context
            { role: 'user', parts: [{ text: 'You are a travel assistant. Follow these instructions:\n' + SYSTEM_PROMPT }] },
            { role: 'model', parts: [{ text: 'Understood! I\'m your Andaman travel assistant for Bharat Tours & Travels. How can I help you plan your perfect island getaway?' }] },
            // Prior chat history
            ...history.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.text }]
            })),
            // Current message
            { role: 'user', parts: [{ text: message }] }
        ];

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
                })
            }
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Gemini API error ' + res.status);
        }

        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || getFallback(message);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ reply })
        };
    } catch (err) {
        console.error('Chat error:', err.message);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ reply: getFallback(message) })
        };
    }
};

// ── Smart rule-based fallback ──────────────────────────────────
function getFallback(msg) {
    const q = (msg || '').toLowerCase();

    if (/price|cost|rate|how much|₹|rupee|cheap/.test(q))
        return 'Our packages start at ₹15,999/person for the 4N/5D Budget Escape, ₹21,999 for Standard (7 days), ₹28,999 for Luxury, and ₹24,999 for Honeymoon. All include hotels, ferries & breakfast. 🏖️';

    if (/honeymoon|couple|romantic|anniversary/.test(q))
        return 'Our **Honeymoon Paradise** package (5N/6D at ₹24,999) is perfect for couples! It includes a sea-view suite, candlelight beach dinner, couple spa, sunset cruise & professional photoshoot. 💑';

    if (/luxury|premium|5 star|five star|best/.test(q))
        return 'Our **Luxury Andaman Retreat** (6N/7D at ₹28,999) includes 5-star resorts, private yacht, all meals, advanced PADI scuba diving & spa. The ultimate island experience! ✨';

    if (/budget|cheap|affordable|economy/.test(q))
        return 'Our **Budget Andaman Escape** (4N/5D at ₹15,999) covers Port Blair + Havelock Island with hotels, ferries, breakfast & sightseeing. Great value! 🌊';

    if (/scuba|dive|diving|snorkel/.test(q))
        return 'Andaman has world-class diving! Our Standard & Luxury packages include scuba diving. Elephant Beach is great for snorkeling, and Neil Island for beginners. 🤿';

    if (/beach|radhanagar|havelock|neil|port blair/.test(q))
        return 'Radhanagar Beach (Asia\'s best!) is on Havelock Island. Other gems: Elephant Beach (snorkeling), Laxmanpur Beach (sunset), Natural Bridge (Neil Island). All covered in our packages! 🏝️';

    if (/when|best time|season|monsoon/.test(q))
        return 'Best time to visit Andaman: **October to May**. The weather is sunny with calm seas. Avoid June–September (monsoon season). December–January is peak season — book early! ☀️';

    if (/book|booking|reserve|payment|pay/.test(q))
        return 'Easy online booking! Click **"Book Now"** on any package, choose your dates & guests, and pay securely via Razorpay (UPI, cards, net banking). Instant confirmation! 📱';

    if (/how long|duration|days|nights/.test(q))
        return 'Our packages range from 4N/5D (Budget) to 6N/7D (Standard, Luxury, Honeymoon). Custom durations are available — contact us for a tailor-made itinerary! 📅';

    if (/include|inclus|what is include/.test(q))
        return 'All packages include: ✅ Hotel stay ✅ Ferry transfers ✅ Breakfast ✅ Airport pickup & drop. Luxury adds private yacht, all meals & spa. Honeymoon adds candlelight dinners & photoshoot.';

    if (/contact|phone|email|call|reach|whatsapp/.test(q))
        return 'Contact us via the **Contact page** on our website, or reach out through WhatsApp. Our team is available Mon–Sat, 9am–7pm IST. We\'d love to help plan your trip! 📞';

    if (/hi|hello|hey|good morning|good evening|namaste/.test(q))
        return 'Hello! 👋 Welcome to Bharat Tours & Travels! I\'m your Andaman travel assistant. Ask me about our packages, prices, activities, or best beaches. How can I help? 🏖️';

    return 'Great question! For the best answer, our travel experts are just a message away on the Contact page. You can also browse our packages directly — we have options from ₹15,999 to ₹28,999 for amazing Andaman experiences! 😊';
}