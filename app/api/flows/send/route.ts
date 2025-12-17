import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { buildFlowMessage } from '@/lib/whatsapp/flows'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const toRaw = String(body?.to || '')
    const flowId = String(body?.flowId || '')
    const flowToken = String(body?.flowToken || '')

    const to = normalizePhoneNumber(toRaw)

    if (!to || !flowId || !flowToken) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: to, flowId, flowToken' },
        { status: 400 }
      )
    }

    const credentials = await getWhatsAppCredentials()
    if (!credentials?.accessToken || !credentials?.phoneNumberId) {
      return NextResponse.json(
        { error: 'Credenciais do WhatsApp não configuradas' },
        { status: 400 }
      )
    }

    const payload = buildFlowMessage({
      to,
      body: String(body?.body || 'Vamos começar?'),
      flowId,
      flowToken,
      ctaText: body?.ctaText ? String(body.ctaText) : 'Abrir',
      action: body?.action === 'data_exchange' ? 'data_exchange' : 'navigate',
      actionPayload: body?.actionPayload && typeof body.actionPayload === 'object' ? body.actionPayload : undefined,
      footer: body?.footer ? String(body.footer) : undefined,
      flowMessageVersion: body?.flowMessageVersion ? String(body.flowMessageVersion) : '3',
    })

    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${credentials.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeoutMs: 8000,
      }
    )

    const data = await safeJson<any>(response)

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Falha ao enviar Flow', details: data },
        { status: response.status }
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    console.error('Failed to send flow:', error)
    return NextResponse.json({ error: 'Falha ao enviar Flow' }, { status: 500 })
  }
}
