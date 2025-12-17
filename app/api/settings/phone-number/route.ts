import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export async function POST(request: NextRequest) {
  const { phoneNumberId, accessToken } = await request.json()

  if (!phoneNumberId || !accessToken) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
  }

  try {
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${phoneNumberId}?fields=display_phone_number,quality_rating,verified_name`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeoutMs: 3500,
      }
    )

    const data = (await safeJson<any>(response)) || {}
    
    if (!response.ok) {
      console.error('Meta API Error (phone-number):', JSON.stringify(data, null, 2))
      const errorMessage = data.error?.message || 'Failed to fetch phone details'
      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Meta API Error (phone-number):', error)
    // Evita 500 para não quebrar UX; o front consegue exibir erro amigável.
    return NextResponse.json({ error: 'Falha ao consultar a Meta (timeout/rede). Tente novamente.' }, { status: 502 })
  }
}
