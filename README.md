# 💎 JEWEL SHOT — NVIDIA AI Prompt Studio

Upload a photo of your jewelry → get 6 cinematic, WOW-factor prompts for **GPT Image / GPT Image 2** and **Nano Banana Pro** in seconds — powered by a **free NVIDIA vision model**.

---

## 🧠 How it works

1. **Upload** your jewelry photo (JPG, PNG, WEBP). The browser compresses it client-side.
2. A free **NVIDIA vision model** looks at the exact metal, stones, cut, style, and scale of the piece.
3. You get **6 prompts** across 6 cinematic moods:
   - 🌅 **Golden** — warm golden-hour lifestyle
   - 🖤 **Dramatic** — dark studio hero shot
   - ✨ **Editorial** — high-fashion editorial
   - 🌿 **Nature** — organic textures (marble, flowers, stone)
   - 💫 **Story** — cinematic emotional narrative
   - 🌀 **Surreal** — dreamlike artistic luxury
4. **Copy** individual prompts or all 6 at once.
5. Paste into GPT Image / Nano Banana Pro **with your jewelry image attached**.

Every prompt ends with a **fidelity lock** so the image tools don't redesign your actual piece.

### Models (free NVIDIA endpoints)
Pick one in the app's dropdown:
- `meta/llama-3.2-90b-vision-instruct` — best quality (default)
- `meta/llama-3.2-11b-vision-instruct` — faster
- `microsoft/phi-3.5-vision-instruct` — lightweight

---

## ⚠️ Why this app needs a (tiny) backend

NVIDIA's API (`integrate.api.nvidia.com`) does **not** allow direct calls from a browser
(no CORS headers). So this app ships a **one-file serverless proxy** (`api/generate.js`)
that forwards requests to NVIDIA and keeps your API key on the server. It is **not** a pure
static HTML page anymore — deploy it somewhere that runs serverless functions (Vercel works
out of the box; Netlify, Cloudflare, etc. also work with minor config).

---

## 🔑 Get an NVIDIA API key

1. Go to [build.nvidia.com](https://build.nvidia.com) and sign in.
2. Open any vision model (e.g. *Llama 3.2 90B Vision*) → **Get API Key**.
3. Copy the key (it starts with `nvapi-`).

You can either:
- **Recommended:** set it as the `NVIDIA_API_KEY` environment variable on your deployment
  (the key never touches the browser), or
- Paste it into the app's optional key field (stored only in your browser's `localStorage`
  and sent only to your own proxy).

---

## 🚀 Deploy on Vercel (recommended)

```bash
npm i -g vercel
vercel            # from the project root — deploys index.html + api/generate.js
vercel env add NVIDIA_API_KEY   # paste your nvapi-... key, choose Production
vercel --prod
```

Or via the dashboard: import the repo → **Settings → Environment Variables** →
add `NVIDIA_API_KEY` → redeploy. The `api/generate.js` function is detected automatically.

> GitHub Pages is **not** supported anymore because it can't run the serverless proxy.

---

## 💻 Run locally

```bash
# Node 18+ (uses built-in fetch)
NVIDIA_API_KEY=nvapi-xxxxx node dev-server.js
# open http://localhost:3000
```

If you don't set `NVIDIA_API_KEY`, just paste your key into the app's key field.

---

## 📁 File structure

```
prompt-generator/
├── index.html        ← frontend (UI, image upload + compression)
├── api/generate.js   ← serverless proxy → NVIDIA NIM (prompt engineering lives here)
├── dev-server.js     ← local dev server (testing only)
├── vercel.json       ← Vercel function config
└── README.md
```

---

## 🔒 Privacy

- Your image is sent to your own proxy, then to NVIDIA, for analysis only.
- With `NVIDIA_API_KEY` set on the server, your key is never exposed to the browser.
- No database, no tracking.

---

*JEWEL SHOT — Powered by NVIDIA Vision AI*
