import type { NextApiRequest, NextApiResponse } from 'next'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { units, region, propType } = req.body

  if (!units || !region) return res.status(400).json({ error: 'Missing fields' })

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      temperature: 0.5,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content: 'You are an energy efficiency expert. Respond ONLY with valid JSON arrays, no markdown, no explanation.'
        },
        {
          role: 'user',
          content: `Give 6 personalized electricity saving tips for:
- Region: ${region}
- Usage: ${units} kWh/month
- Property type: ${propType}

Return ONLY a JSON array (no markdown, no extra text):
[{"emoji":"single emoji","title":"short title (max 5 words)","desc":"one actionable sentence","saving":"e.g. Save 5–15%"}]`
        }
      ]
    })

    const text = completion.choices[0]?.message?.content?.trim() ?? ''
    const clean = text.replace(/```json|```/g, '').trim()
    const data = JSON.parse(clean)
    return res.status(200).json(data)
  } catch (err) {
    console.error('Tips error:', err)
    return res.status(500).json({ error: 'AI tips failed' })
  }
}
