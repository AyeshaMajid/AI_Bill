import type { NextApiRequest, NextApiResponse } from 'next'

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { units, region, propType, total, symbol } = req.body

  if (!units || !region) return res.status(400).json({ error: 'Missing fields' })

  try {
    const prompt = `You are an electricity bill prediction AI. Always respond ONLY with valid JSON, no markdown, no explanation.

Predict next month electricity bill for:
- Region: ${region}
- Current usage: ${units} kWh
- Current bill: ${symbol}${Number(total).toFixed(2)}
- Property type: ${propType}

Return ONLY this JSON (no markdown, no extra text):
{"predictedBill":number,"predictedUnits":number,"changePercent":number,"direction":"up" or "down" or "stable","confidence":"High" or "Medium","rangeLow":number,"rangeHigh":number,"trendReason":"one short sentence"}`

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY as string,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
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
    console.error('Prediction error:', err)
    return res.status(500).json({ error: 'AI prediction failed' })
  }
}
