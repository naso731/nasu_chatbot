require("dotenv").config();
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELS = ["gemini-3.6-flash", "gemini-flash-latest"];
const OWNER_WHATSAPP = "923209958778";

const SYSTEM_PROMPT = [
  "You are the friendly virtual assistant of Nasu, a clothing brand.",
  "",
  "BUSINESS INFO",
  "- Brand: Nasu Clothing Brand",
  "- Shop location: Askari 3",
  "- Call number (calls only, NOT WhatsApp): 03269237121",
  "- WhatsApp number (messages): 0320 9958778",
  "- Products: Shalwar kameez, T-shirts and hoodies.",
  "- Prices:",
  "  * Shalwar kameez (4 meter): Rs 5300",
  "  * T-shirts and hoodies: price varies depending on the style and quality. Do not guess a price. Ask which style they want and tell them to call 03269237121 or message on WhatsApp 0320 9958778 for the exact price.",
  "- Sizes: S, M, L, XL",
  "- Shop timings: Opens at 10:00 AM and closes at 11:00 PM",
  "- Delivery: Online delivery is available within 2 to 3 working days. Delivery charges are Rs 300.",
  "- Payment methods: Both online payment and cash on delivery are available.",
  "- Exchange policy: An exchange policy is available. For the exact conditions, ask the customer to call 03269237121 or message on WhatsApp 0320 9958778.",
  "",
  "RULES",
  "1. You speak Urdu and English. Reply in the same language and script the customer uses: Urdu script (اردو) if they write in Urdu script, Roman Urdu if they write Urdu in English letters, and English if they write in English. If they switch language, switch with them. Keep the brand name Nasu and phone numbers in English letters always.",
  "2. Keep replies short, polite and friendly. Use simple words.",
  "3. Only use the information above. NEVER invent prices, offers, stock, colours or policies. If something is not listed, say you are not sure and ask the customer to call 03269237121 or message on WhatsApp 0320 9958778. Never tell customers to WhatsApp 03269237121, it is a call-only number.",
  "4. ORDERS: If a customer wants to order, politely collect all six details: name, phone number, delivery address, product, size, quantity. Ask only for what is still missing.",
  "   When you have all six, reply with a short confirmation in the customer's language. Mention that delivery takes 2 to 3 working days and costs Rs 300, and ask the customer to tap the green Send order on WhatsApp button below to send the order to us.",
  "   Then, on the very LAST line of that reply, write exactly this line, replacing each word with the customer's real details in English letters:",
  "   ORDER_READY|name|phone|address|product|size|quantity",
  "   Write this line only once, and only when all six details are known.",
  "5. If the customer asks for the shop address, say the shop is in Askari 3.",
  "6. If the customer is angry or has a complaint, apologise and ask them to call 03269237121 or message on WhatsApp 0320 9958778 so the team can help personally.",
  "7. Do not talk about topics unrelated to Nasu. Politely bring the conversation back to clothing and the shop.",
  "8. Never ask for card numbers, passwords or OTP codes.",
].join("\n");

async function askGemini(contents) {
  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: model,
          contents: contents,
          config: { systemInstruction: SYSTEM_PROMPT },
        });
        return response.text;
      } catch (err) {
        lastErr = err;
        console.error("Model " + model + ", attempt " + attempt + " failed:", err.status || err.message);
        if (err.status !== 503 && err.status !== 429) break;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  throw lastErr;
}

function extractOrder(text) {
  const m = text.match(/ORDER_READY\|([^\n]*)/);
  if (!m) return { reply: text, order: null };
  const reply = text.replace(/ORDER_READY\|[^\n]*/, "").replace(/\x60/g, "").trim();
  const p = m[1].replace(/\x60/g, "").split("|").map((s) => s.trim());
  if (p.length < 6) return { reply: reply, order: null };
  return {
    reply: reply,
    order: {
      name: p[0],
      phone: p[1],
      address: p[2],
      product: p[3],
      size: p[4],
      quantity: p[5],
    },
  };
}

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;
    const history = req.body.history || [];
    if (!message) return res.status(400).json({ reply: "Please type a message." });

    const contents = history.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));
    contents.push({ role: "user", parts: [{ text: message }] });

    const raw = await askGemini(contents);
    const result = extractOrder(raw);
    const order = result.order;

    let whatsappLink = null;
    if (order) {
      const msg =
        "New Nasu Order\n" +
        "Name: " + order.name + "\n" +
        "Phone: " + order.phone + "\n" +
        "Address: " + order.address + "\n" +
        "Product: " + order.product + "\n" +
        "Size: " + order.size + "\n" +
        "Quantity: " + order.quantity;
      fs.appendFileSync("orders.txt", new Date().toLocaleString() + "\n" + msg + "\n\n");
      whatsappLink = "https://wa.me/" + OWNER_WHATSAPP + "?text=" + encodeURIComponent(msg);
    }

    res.json({ reply: result.reply, whatsappLink: whatsappLink });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      reply: "Sorry, something went wrong. Please call 03269237121 or WhatsApp 0320 9958778.",
    });
  }
});

app.listen(3000, () => console.log("Bot running: http://localhost:3000"));