# 💎 JEWEL SHOT — AI Prompt Studio

Upload a photo of your jewelry → get 6 cinematic, WOW-factor prompts for **GPT Image 2** and **Nano Banana Pro** in seconds.

---

## 🚀 Deploy in 3 Steps

### Option A — GitHub Pages (Free, Instant)

1. Create a new GitHub repo (e.g. `jewel-shot`)
2. Upload `index.html` to the root
3. Go to **Settings → Pages → Source → main branch / root**
4. Your site is live at `https://yourusername.github.io/jewel-shot`

### Option B — Netlify (Free, Drag & Drop)

1. Go to [netlify.com](https://netlify.com) → **Add new site → Deploy manually**
2. Drag the folder containing `index.html` into the deploy area
3. Done — live in 30 seconds

### Option C — Vercel

```bash
npm i -g vercel
vercel --cwd /path/to/jewel-shot
```

---

## 🔑 API Key Setup

The app asks for your **Anthropic API key** on first use.

1. Get a key at [console.anthropic.com/account/keys](https://console.anthropic.com/account/keys)
2. Paste it into the app and click **Save**
3. It's stored in your browser's `localStorage` — never sent anywhere except directly to Anthropic's API

---

## ✨ How It Works

1. **Upload** your jewelry photo (JPG, PNG, WEBP)
2. Click **Generate WOW Prompts**
3. Claude analyzes the exact metal, stones, style, and scale of your piece
4. You receive **6 prompts** across 6 cinematic moods:
   - 🌅 **Golden** — warm golden-hour lifestyle
   - 🖤 **Dramatic** — dark studio hero shot
   - ✨ **Editorial** — high-fashion editorial
   - 🌿 **Nature** — organic textures (marble, flowers, stone)
   - 💫 **Story** — cinematic emotional narrative
   - 🌀 **Surreal** — dreamlike artistic luxury
5. **Copy** individual prompts or all 6 at once
6. Paste into GPT Image 2 or Nano Banana Pro **with your jewelry image attached**

---

## 🔒 Privacy

- Your image is sent directly to the Anthropic API for analysis only
- Your API key is stored only in your own browser (`localStorage`)
- No backend, no database, no tracking — it's a single static HTML file

---

## 📁 File Structure

```
jewel-shot/
└── index.html   ← entire app, no dependencies, no build step
```

Zero npm, zero frameworks, zero build required. Just one HTML file.

---

*JEWEL SHOT — Powered by Claude*
