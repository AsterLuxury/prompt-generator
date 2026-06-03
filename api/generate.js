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

// 11B is the default: it answers far faster than 90B (which can take minutes and
// time out on full-size photos) while still producing strong vision-grounded prompts.
const DEFAULT_MODEL = 'meta/llama-3.2-11b-vision-instruct';

// Hard cap on how long we wait for NVIDIA before returning a clean 504.
const REQUEST_TIMEOUT_MS = 55000;

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

// Pull prompt objects out of the model output even if it adds stray text/fences,
// returns a bare object instead of an array, or separates objects with commas or
// newlines instead of wrapping them in [ ]. We scan for every balanced {...} block
// and keep the ones that parse into a prompt-shaped object.
function extractPrompts(text) {
  if (!text) return null;
  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 1) Happy path: a valid JSON array.
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length) return parsed;
    if (parsed && typeof parsed === 'object' && parsed.prompt) return [parsed];
  } catch { /* fall through */ }

  // 2) Try the substring between the first [ and last ].
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1));
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch { /* fall through */ }
  }

  // 3) Salvage every balanced top-level {...} object and parse each one.
  const objects = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const chunk = clean.slice(objStart, i + 1);
        try {
          const obj = JSON.parse(chunk);
          if (obj && typeof obj === 'object' && (obj.prompt || obj.mood || obj.title)) {
            objects.push(obj);
          }
        } catch { /* skip malformed chunk */ }
        objStart = -1;
      }
    }
  }
  return objects.length ? objects : null;
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
    : DEFAULT_MODEL;

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
    max_tokens: 4096,
    temperature: 0.7,
    top_p: 0.9,
    stream: false,
  };

  // Abort if NVIDIA is taking too long so the user gets a clear error instead of a
  // 3-minute hang. Vercel's function maxDuration (vercel.json) is the hard ceiling.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err && err.name === 'AbortError') {
      return sendJson(res, 504, {
        error: 'NVIDIA took too long to respond. Try the faster 11B model, or try again.',
      });
    }
    return sendJson(res, 502, { error: `Could not reach NVIDIA API: ${err.message}` });
  }
  clearTimeout(timeout);

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
