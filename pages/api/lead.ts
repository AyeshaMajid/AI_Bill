import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, phone, city, bill, units } = req.body

  if (!name || !phone || !city) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Log lead to console (visible in Vercel logs dashboard)
  console.log('🔆 NEW SOLAR LEAD:', {
    name,
    phone,
    city,
    bill,
    units,
    timestamp: new Date().toISOString(),
  })

  // TODO: You can add email/CRM integration here later
  // e.g. send to your email via Resend, save to Airtable, etc.

  return res.status(200).json({ success: true })
}
