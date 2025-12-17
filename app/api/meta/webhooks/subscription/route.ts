import { NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { normalizeSubscribedFields, type MetaSubscribedApp } from '@/lib/meta-webhook-subscription'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

const META_API_VERSION = 'v24.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

async function getMetaSubscriptionStatus(params: { wabaId: string; accessToken: string }) {
  const { wabaId, accessToken } = params

  const url = `${META_API_BASE}/${wabaId}/subscribed_apps?fields=id,name,subscribed_fields`
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
    timeoutMs: 12000,
  })

  if (!response.ok) {
    const errorData = await safeJson<any>(response)
    return {
      ok: false as const,
      status: response.status,
      error: errorData?.error?.message || 'Erro ao consultar subscribed_apps',
      details: errorData?.error || errorData,
    }
  }

  const data = (await safeJson<{ data?: MetaSubscribedApp[] }>(response)) || {}
  const apps = data?.data || []
  const subscribedFields = normalizeSubscribedFields(apps)

  return {
    ok: true as const,
    status: 200,
    apps,
    subscribedFields,
    messagesSubscribed: subscribedFields.includes('messages'),
  }
}

/**
 * GET /api/meta/webhooks/subscription
 * Consulta status de subscription do WABA (subscribed_apps).
 */
export async function GET() {
  const credentials = await getWhatsAppCredentials()

  if (!credentials?.businessAccountId || !credentials?.accessToken) {
    return NextResponse.json(
      { error: 'Credenciais não configuradas. Configure em Ajustes.' },
      { status: 401 }
    )
  }

  const result = await getMetaSubscriptionStatus({
    wabaId: credentials.businessAccountId,
    accessToken: credentials.accessToken,
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        details: result.details,
      },
      { status: result.status }
    )
  }

  return NextResponse.json({
    ok: true,
    wabaId: credentials.businessAccountId,
    messagesSubscribed: result.messagesSubscribed,
    subscribedFields: result.subscribedFields,
    apps: result.apps,
  })
}

/**
 * POST /api/meta/webhooks/subscription
 * Inscreve o app no WABA para receber eventos do campo `messages`.
 *
 * Body opcional:
 * { fields?: string[] }
 */
export async function POST(request: Request) {
  const credentials = await getWhatsAppCredentials()

  if (!credentials?.businessAccountId || !credentials?.accessToken) {
    return NextResponse.json(
      { error: 'Credenciais não configuradas. Configure em Ajustes.' },
      { status: 401 }
    )
  }

  let fields: string[] = ['messages']
  try {
    const body = (await request.json().catch(() => ({}))) as { fields?: unknown }
    if (Array.isArray(body.fields) && body.fields.every((f) => typeof f === 'string')) {
      fields = body.fields
    }
  } catch {
    // ignore
  }

  // Graph costuma aceitar form-urlencoded de forma mais consistente
  const form = new URLSearchParams()
  form.set('subscribed_fields', fields.join(','))

  const response = await fetchWithTimeout(`${META_API_BASE}/${credentials.businessAccountId}/subscribed_apps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
    cache: 'no-store',
    timeoutMs: 12000,
  })

  if (!response.ok) {
    const errorData = await safeJson<any>(response)
    return NextResponse.json(
      {
        ok: false,
        error: errorData?.error?.message || 'Erro ao inscrever subscribed_apps',
        details: errorData?.error || errorData,
      },
      { status: response.status }
    )
  }

  // Retorna status atualizado (melhor UX)
  const status = await getMetaSubscriptionStatus({
    wabaId: credentials.businessAccountId,
    accessToken: credentials.accessToken,
  })

  return NextResponse.json({
    ok: true,
    wabaId: credentials.businessAccountId,
    requestedFields: fields,
    confirmed: status.ok ? status.messagesSubscribed : false,
    status: status.ok
      ? {
          messagesSubscribed: status.messagesSubscribed,
          subscribedFields: status.subscribedFields,
          apps: status.apps,
        }
      : null,
  })
}

/**
 * DELETE /api/meta/webhooks/subscription
 * Remove inscrição do app no WABA (desinscrever subscribed_apps).
 */
export async function DELETE() {
  const credentials = await getWhatsAppCredentials()

  if (!credentials?.businessAccountId || !credentials?.accessToken) {
    return NextResponse.json(
      { error: 'Credenciais não configuradas. Configure em Ajustes.' },
      { status: 401 }
    )
  }

  const response = await fetchWithTimeout(`${META_API_BASE}/${credentials.businessAccountId}/subscribed_apps`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
    },
    cache: 'no-store',
    timeoutMs: 12000,
  })

  if (!response.ok) {
    const errorData = await safeJson<any>(response)
    return NextResponse.json(
      {
        ok: false,
        error: errorData?.error?.message || 'Erro ao desinscrever subscribed_apps',
        details: errorData?.error || errorData,
      },
      { status: response.status }
    )
  }

  // Melhor UX: devolve status após remoção
  const status = await getMetaSubscriptionStatus({
    wabaId: credentials.businessAccountId,
    accessToken: credentials.accessToken,
  })

  return NextResponse.json({
    ok: true,
    wabaId: credentials.businessAccountId,
    confirmed: status.ok ? !status.messagesSubscribed : null,
    status: status.ok
      ? {
          messagesSubscribed: status.messagesSubscribed,
          subscribedFields: status.subscribedFields,
          apps: status.apps,
        }
      : null,
  })
}
