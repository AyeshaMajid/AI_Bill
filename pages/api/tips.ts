import type { NextApiRequest, NextApiResponse } from 'next'

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { units, region, propType } = req.body

  if (!units || !region) return res.status(400).json({ error: 'Missing fields' })

  try {
    const prompt = `You are an energy efficiency expert. Respond ONLY with valid JSON arrays, no markdown, no explanation.

Give 6 personalized electricity saving tips for:
- Region: ${region}
- Usage: ${units} kWh/month
- Property type: ${propType}

Return ONLY a JSON array (no markdown, no extra text):
[{"emoji":"single emoji","title":"short title (max 5 words)","desc":"one actionable sentence","saving":"e.g. Save 5–15%"}]`

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY as string,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 900 },
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`Gemini API error ${response.status}: ${errBody}`)
    }

    const json = await response.json()
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    const clean = text.replace(/```json|```/g, '').trim()
    const data = JSON.parse(clean)
    return res.status(200).json(data)
  } catch (err) {
    console.error('Tips error:', err)
    return res.status(500).json({ error: 'AI tips failed' })
  }
}
