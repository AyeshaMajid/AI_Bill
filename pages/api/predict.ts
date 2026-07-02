import type { NextApiRequest, NextApiResponse } from 'next'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { units, region, propType, total, symbol } = req.body

  if (!units || !region) return res.status(400).json({ error: 'Missing fields' })

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content: `You are an electricity bill prediction AI. Always respond ONLY with valid JSON, no markdown, no explanation.`
        },
        {
          role: 'user',
          content: `Predict next month electricity bill for:
- Region: ${region}
- Current usage: ${units} kWh
- Current bill: ${symbol}${Number(total).toFixed(2)}
- Property type: ${propType}

Return ONLY this JSON (no markdown, no extra text):
{"predictedBill":number,"predictedUnits":number,"changePercent":number,"direction":"up" or "down" or "stable","confidence":"High" or "Medium","rangeLow":number,"rangeHigh":number,"trendReason":"one short sentence"}`
        }
      ]
    })

    const text = completion.choices[0]?.message?.content?.trim() ?? ''
    const clean = text.replace(/```json|```/g, '').trim()
    const data = JSON.parse(clean)
    return res.status(200).json(data)
  } catch (err) {
    console.error('Prediction error:', err)
    return res.status(500).json({ error: 'AI prediction failed' })
  }
}
