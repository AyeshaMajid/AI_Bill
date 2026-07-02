# ⚡ Electricity Bill Calculator & Solar Savings Advisor

A free AI-powered electricity bill calculator using **Groq (Llama 3)** — zero API cost.

## Tech Stack
- **Next.js 14** + TypeScript
- **Groq API** (free tier, Llama 3) — for AI predictions & tips
- **Vercel** — deployment (free tier)

---

## 🚀 Step-by-Step Setup

### Step 1 — Get your FREE Groq API key
1. Go to https://console.groq.com
2. Sign up (free, no credit card needed)
3. Click **API Keys** → **Create API Key**
4. Copy the key (starts with `gsk_...`)

### Step 2 — Install & run locally
```bash
# Install dependencies
npm install

# Add your Groq API key
# Open .env.local and replace "your_groq_api_key_here" with your real key

# Run locally
npm run dev
```
Open http://localhost:3000 — it works!

### Step 3 — Deploy to Vercel (free hosting)
1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
2. Go to https://vercel.com → **New Project** → Import your GitHub repo
3. Click **Environment Variables** → Add:
   - Key: `GROQ_API_KEY`
   - Value: your `gsk_...` key
4. Click **Deploy** — done! You get a free `.vercel.app` URL

### Step 4 — Connect your domain (when ready)
- In Vercel dashboard → **Settings** → **Domains** → add your domain
- Update your domain's DNS to point to Vercel (they give you exact instructions)

---

## 📊 Groq Free Tier Limits
- **14,400 requests/day** on free tier
- **Llama 3 8B** model — fast and accurate
- No credit card required

## 📁 Project Structure
```
/pages
  index.tsx          ← Main UI
  /api
    predict.ts       ← AI bill prediction (Groq)
    tips.ts          ← AI saving tips (Groq)
    lead.ts          ← Lead form submission
/styles
  globals.css        ← Global styles
  Home.module.css    ← Page styles
```

## 🔒 Security
- API key stays server-side (never exposed to browser)
- `.env.local` is in `.gitignore` (never uploaded to GitHub)
- Add your key in Vercel Environment Variables for production
