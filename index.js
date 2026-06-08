const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

let stockData = [
  { id: "PD-120001A", name: "Fiber", unit: "ห่อ", stock: { "คลังหลัก": -17, "คลังสาขา 1": 0, "คลังสาขา 2": 0 } },
  { id: "PD-600002A", name: "Body Sunscreen", unit: "ชิ้น", stock: { "คลังหลัก": 8, "คลังสาขา 1": 0, "คลังสาขา 2": 0 } },
  { id: "PD-900001A", name: "DARA MULTIPROTEIN PLUS", unit: "กล่อง", stock: { "คลังหลัก": 20, "คลังสาขา 1": 0, "คลังสาขา 2": 0 } },
  { id: "PD-110001A", name: "GENTLE GEL Cleanser", unit: "ชิ้น", stock: { "คลังหลัก": 50, "คลังสาขา 1": 0, "คลังสาขา 2": 0 } },
  { id: "PD-200001A", name: "Chlorophyll Fiber Plus", unit: "กระปุก", stock: { "คลังหลัก": 54, "คลังสาขา 1": 0, "คลังสาขา 2": 0 } },
  { id: "PD-300001A", name: "DARA XS COACO", unit: "กล่อง", stock: { "คลังหลัก": 61, "คลังสาขา 1": 0, "คลังสาขา 2": 0 } },
  { id: "PD-500001A", name: "ASTA PLUS", unit: "กระปุก", stock: { "คลังหลัก": 97, "คลังสาขา 1": 0, "คลังสาขา 2": 0 } },
  { id: "PD-100001A", name: "Birdnest Collagen", unit: "กระปุก", stock: { "คลังหลัก": 117, "คลังสาขา 1": 0, "คลังสาขา 2": 0 } },
];

async function replyMessage(replyToken, text) {
  const fetch = (await import('node-fetch')).default;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }]
    })
  });
}

async function analyzeWithClaude(userMessage) {
  const fetch = (await import('node-fetch')).default;
  const stockSummary = stockData.map(p => {
    const total = Object.values(p.stock).reduce((a, b) => a + b, 0);
    const detail = Object.entries(p.stock).map(([w, s]) => `${w}: ${s}`).join(', ');
    return `${p.name}: รวม ${total} ${p.unit} (${detail})`;
  }).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `คุณคือ AI จัดการสต็อก BSNG ตอบ JSON เท่านั้น ห้ามมี text อื่น:
{"action":"check_stock"|"add_stock"|"remove_stock"|"cancel_order"|"chat","product":"ชื่อสินค้าหรือnull","quantity":จำนวนหรือnull,"warehouse":"คลังหลัก","reply":"ข้อความตอบภาษาไทย"}
สต็อก:\n${stockSummary}`,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  const data = await res.json();
  const text = data.content[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

function processAction(result) {
  const { action, product, quantity, warehouse } = result;
  if (action === 'check_stock' || action === 'chat') return result.reply;

  const found = stockData.find(p =>
    p.name.toLowerCase().includes((product || '').toLowerCase())
  );
  if (!found) return `ไม่พบสินค้า "${product}" ครับ`;

  const w = warehouse || 'คลังหลัก';
  const delta = action === 'add_stock' || action === 'cancel_order' ? quantity : -quantity;
  found.stock[w] = (found.stock[w] || 0) + delta;

  const icon = action === 'add_stock' ? '➕' : action === 'remove_stock' ? '➖' : '↩️';
  const label = action === 'add_stock' ? 'เติมสต็อก' : action === 'remove_stock' ? 'ตัดสต็อก' : 'คืนสต็อก';
  return `${icon} ${label} ${found.name} ${Math.abs(delta)} ${found.unit}\n📦 ${w} คงเหลือ: ${found.stock[w]} ${found.unit}`;
}

app.get('/', (req, res) => {
  res.json({ status: 'BSNG Stock Bot running ✅' });
});

app.post('/webhook', (req, res) => {
  res.status(200).send('OK');

  const events = req.body.events || [];
  events.forEach(async (event) => {
    if (event.type !== 'message' || event.message.type !== 'text') return;
    const userMessage = event.message.text;
    const replyToken = event.replyToken;

    try {
      const result = await analyzeWithClaude(userMessage);
      const replyText = processAction(result);
      await replyMessage(replyToken, replyText);
    } catch (err) {
      console.error('Error:', err);
      try {
        await replyMessage(replyToken, 'ขอโทษครับ ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง 🙏');
      } catch(e) {}
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
