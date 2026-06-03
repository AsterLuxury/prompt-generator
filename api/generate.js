// Serverless proxy: browser -> this function -> NVIDIA NIM (integrate.api.nvidia.com)
//
// Why this exists: NVIDIA's hosted API does not send CORS headers, so a browser
// cannot call it directly. This function forwards the request and keeps the API
// key on the server. It is written with plain Node req/res primitives so the same
// handler runs both on Vercel and in the local dev server (dev-server.js).

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const ALLOWED_MODELS = new Set([
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.2-11b-vision-instruct',
  'microsoft/phi-3.5-vision-instruct',
]);

const SYSTEM_PROMPT = `You are a world-class luxury jewelry photography director and AI prompt engineer for high-end brands.
Your task: look closely at the uploaded jewelry image and write EXACTLY 6 hyper-detailed, cinematic prompts for AI image generators (GPT Image / GPT Image 2 and Nano Banana Pro) that produce scroll-stopping, WOW-factor shots that make a client instantly think "I want it".

First, silently observe the actual piece:
- TYPE (ring, necklace, bracelet, earrings, pendant, etc.)
- METAL (yellow gold, rose gold, white gold, platinum, silver — note the exact tone)
- STONES (diamonds, rubies, emeralds, sapphires, pearls, none — note color, cut, setting)
- STYLE (minimalist, ornate, vintage, art deco, modern, delicate, bold, layered)
- SCALE (dainty vs large statement piece)

Then generate 6 prompts, one per mood below, each 90-150 words, ultra-specific to the ACTUAL piece in the image.

Moods to cover, in this order:
1. Golden – warm golden-hour lifestyle, a person elegantly wearing the piece
2. Dramatic – dark studio hero shot, product only, dramatic rim light
3. Editorial – high-fashion magazine editorial with a model in context
4. Nature – organic luxury textures: fresh flowers, marble, silk, water, stone
5. Story – cinematic emotional narrative moment (proposal, celebration, intimate gift)
6. Surreal – dreamlike, artistic, unexpected luxury setting

Each prompt MUST:
- Reference the actual metal color, stone color/type/cut, and style of THIS piece throughout
- Specify camera/lens feel, lighting, mood, background, and composition for a premium look
- Sell desire: aspirational, sensory, emotionally magnetic language (without naming a brand)
- End with this EXACT sentence: "The jewelry must match the uploaded reference image EXACTLY — same design, same metal color, same stones, same proportions. Do not alter the piece in any way."

Respond with ONLY a valid JSON array. No preamble, no markdown fences, no explanation.

JSON shape:
[
  {
    "title": "3-5 word evocative title",
    "mood": "one of: Golden / Dramatic / Editorial / Nature / Story / Surreal",
    "bestFor": "one sentence on why this scene sells this specific piece",
    "prompt": "full prompt text ending with the fidelity lock sentence"
  }
]`;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-nvidia-api-key, Authorization');
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

// Pull a JSON array out of the model output even if it adds stray text/fences.
function extractPrompts(text) {
  if (!text) return null;
  let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  return null;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  const body = await readBody(req);
  if (!body) return sendJson(res, 400, { error: 'Invalid JSON body.' });

  const apiKey =
    process.env.NVIDIA_API_KEY ||
    (req.headers && req.headers['x-nvidia-api-key']) ||
    body.apiKey;

  if (!apiKey) {
    return sendJson(res, 400, {
      error:
        'No NVIDIA API key. Set NVIDIA_API_KEY in your deployment, or enter a key in the app.',
    });
  }

  const model = body.model && ALLOWED_MODELS.has(body.model)
    ? body.model
    : 'meta/llama-3.2-90b-vision-instruct';

  const imageBase64 = body.imageBase64;
  const imageMime = body.imageMime || 'image/jpeg';
  if (!imageBase64) {
    return sendJson(res, 400, { error: 'No image provided.' });
  }

  const dataUri = `data:${imageMime};base64,${imageBase64}`;

  const payload = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyze this jewelry carefully and return the 6 tailored, WOW-factor prompts as a pure JSON array only.',
          },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
    max_tokens: 3000,
    temperature: 0.8,
    top_p: 0.9,
    stream: false,
  };

  let nvRes;
  try {
    nvRes = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return sendJson(res, 502, { error: `Could not reach NVIDIA API: ${err.message}` });
  }

  const text = await nvRes.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }

  if (!nvRes.ok) {
    const msg =
      (data && (data.detail || (data.error && (data.error.message || data.error)) || data.message)) ||
      text ||
      `NVIDIA API error ${nvRes.status}`;
    return sendJson(res, nvRes.status, { error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }

  const content =
    (data && data.choices && data.choices[0] && data.choices[0].message &&
      data.choices[0].message.content) || '';

  const prompts = extractPrompts(content);
  if (!prompts || prompts.length === 0) {
    return sendJson(res, 502, {
      error: 'The model did not return valid prompt JSON. Try again or switch models.',
      raw: content.slice(0, 600),
    });
  }

  return sendJson(res, 200, { prompts, model });
};

module.exports.SYSTEM_PROMPT = SYSTEM_PROMPT;
module.exports.ALLOWED_MODELS = [...ALLOWED_MODELS];
