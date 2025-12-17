/**
 * Setup Validation API
 * 
 * POST: Validate credentials for each service
 */

import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout, safeJson, safeText, isAbortError } from '@/lib/server-http'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, credentials } = body as {
      type: 'database' | 'qstash' | 'whatsapp'
      credentials: Record<string, string>
    }

    switch (type) {
      case 'database':
        return await validateSupabase(credentials)
      case 'qstash':
        return await validateQStash(credentials)
      case 'whatsapp':
        return await validateWhatsApp(credentials)
      default:
        return NextResponse.json(
          { error: 'Tipo de validação inválido' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Validation error:', error)
    return NextResponse.json(
      { error: 'Erro ao validar credenciais' },
      { status: 500 }
    )
  }
}

function cleanCredential(value: string | undefined): string {
  if (!value) return ''
  let cleaned = value.trim()

  // Handle "KEY=VALUE" format (pasted from .env)
  // Matches uppercase/underscore key followed by =
  const envVarMatch = cleaned.match(/^[A-Z0-9_]+=(.*)$/)
  if (envVarMatch) {
    cleaned = envVarMatch[1].trim()
  }

  // Remove surrounding quotes (" or ')
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1)
  }

  return cleaned.trim()
}

async function validateSupabase(credentials: Record<string, string>) {
  const url = cleanCredential(credentials.url)
  // Backward-compatible: `key` (old payload) == publishable/public key
  const publishableKey = cleanCredential(credentials.publishableKey ?? credentials.key)
  const secretKey = cleanCredential(credentials.secretKey)

  if (!url || !publishableKey) {
    return NextResponse.json(
      { valid: false, error: 'URL e chave são obrigatórios' },
      { status: 400 }
    )
  }

  const looksLikeJwt = (key: string) => {
    // Very loose JWT check: three base64url-ish segments separated by dots
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)
  }

  const looksLikeSbKey = (key: string) => {
    return key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')
  }

  type KeyTestOk = { ok: true; status: number }
  type KeyTestFail = {
    ok: false
    status: number
    error: string
    debugBody?: string
    debug?: {
      baseUrl: string
      keyType: string
      keyLength: number
      keySuffix: string
    }
  }
  type KeyTestResult = KeyTestOk | KeyTestFail

  const testKey = async (label: string, key: string): Promise<KeyTestResult> => {
    const baseUrl = url.replace(/\/+$/, '')

    // Doc: publishable/secret (sb_*) are NOT JWTs.
    // - Always send `apikey`.
    // - Do NOT send sb_* inside Authorization.
    // - For legacy JWT keys, Authorization is fine.
    const headers: Record<string, string> = {
      apikey: key,
      Accept: 'application/json',
    }

    const isSb = looksLikeSbKey(key)
    const isJwt = looksLikeJwt(key)

    if (isJwt && !isSb) {
      headers.Authorization = `Bearer ${key}`
    }

    const endpoints = isSb
      ? [
        // Lightweight endpoint that should be reachable with publishable key.
        `${baseUrl}/auth/v1/settings`,
        // Fallback: PostgREST root. The gateway should accept `apikey` and mint an internal JWT.
        `${baseUrl}/rest/v1/`,
      ]
      : [
        // Legacy JWT keys work fine with PostgREST.
        `${baseUrl}/rest/v1/`,
      ]

    let last: { status: number; body?: string } | null = null
    for (const endpoint of endpoints) {
      const response = await fetchWithTimeout(endpoint, { headers, timeoutMs: 8000 })
      if (response.ok) {
        return { ok: true, status: response.status }
      }
      const status = response.status
      // Try to capture a tiny body snippet in dev for diagnosis (never include keys)
      let body: string | undefined
      if (process.env.NODE_ENV !== 'production') {
        body = (await safeText(response)) || undefined
        if (body && body.length > 400) body = body.slice(0, 400)
      }
      last = { status, body }

      // If this endpoint returned something other than auth errors, stop early.
      // For 401/403 keep trying fallbacks.
      if (status !== 401 && status !== 403) break
    }

    const status = last?.status ?? 0

    const safeDebug = process.env.NODE_ENV !== 'production'
      ? {
        baseUrl,
        keyType: isSb ? (key.startsWith('sb_publishable_') ? 'sb_publishable' : key.startsWith('sb_secret_') ? 'sb_secret' : 'sb_unknown') : (isJwt ? 'jwt' : 'unknown'),
        keyLength: key.length,
        keySuffix: key.slice(-6),
      }
      : undefined

    // 401/403 usually mean bad key (or key doesn't match the project URL)
    if (status === 401 || status === 403) {
      const maybeProjectMismatch =
        label.includes('Publishable')
          ? ' (confira se a URL do projeto é a mesma de onde você copiou a chave)'
          : ''

      return {
        ok: false,
        status,
        error: `${label} inválida${maybeProjectMismatch}`,
        ...(process.env.NODE_ENV !== 'production'
          ? { debugBody: last?.body, debug: safeDebug }
          : {}),
      }
    }

    return {
      ok: false,
      status,
      error: `Erro de conexão com Supabase (${status})`,
      ...(process.env.NODE_ENV !== 'production'
        ? { debugBody: last?.body, debug: safeDebug }
        : {}),
    }
  }

  try {
    // Common mistake: user pasted a secret key into the publishable field.
    if (publishableKey.startsWith('sb_secret_')) {
      return NextResponse.json({
        valid: false,
        error: 'Você colou uma Secret Key no campo Publishable Key. Use a sb_publishable_... (Public) nesse campo.'
      })
    }

    const pubResult = await testKey('Publishable Key (Public)', publishableKey)
    if (!pubResult.ok) {
      return NextResponse.json({
        valid: false,
        error: pubResult.error,
        ...(process.env.NODE_ENV !== 'production'
          ? { debug: { publishableStatus: pubResult.status, publishableBody: (pubResult as any).debugBody } }
          : {}),
      })
    }

    // Secret Key é opcional no payload de validação, mas se veio preenchida, validamos também.
    if (secretKey) {
      const secretResult = await testKey('Secret Key (Secret)', secretKey)
      if (!secretResult.ok) {
        return NextResponse.json({
          valid: false,
          error: secretResult.error,
          ...(process.env.NODE_ENV !== 'production'
            ? {
              debug: {
                publishableStatus: pubResult.status,
                secretStatus: secretResult.status,
                secretBody: (secretResult as any).debugBody,
              },
            }
            : {}),
        })
      }
    }

    return NextResponse.json({ valid: true, message: 'Conexão Supabase OK!' })
  } catch (error) {
    console.error('Supabase validation error:', error)
    return NextResponse.json({
      valid: false,
      error: 'Não foi possível conectar ao Supabase (verifique a URL)'
    })
  }
}

async function validateQStash(credentials: Record<string, string>) {
  const token = cleanCredential(credentials.token)

  if (!token) {
    return NextResponse.json(
      { valid: false, error: 'Token é obrigatório' },
      { status: 400 }
    )
  }

  try {
    // Test QStash by fetching signing keys (confirms token is valid and can retrieve keys)
    const response = await fetchWithTimeout('https://qstash.upstash.io/v2/keys', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      timeoutMs: 8000,
    })

    if (!response.ok) {
      const errorText = (await safeText(response)) || 'Erro desconhecido'
      return NextResponse.json({
        valid: false,
        error: response.status === 401 ? 'Token do QStash inválido. Verifique o QSTASH_TOKEN (não é o Current Signing Key).' : `Erro QStash: ${errorText}`
      })
    }

    // Optional: could return keys here to verify they match if frontend had them
    const keys = (await safeJson<any>(response)) || {}
    if (!keys.current || !keys.next) {
      return NextResponse.json({
        valid: false,
        error: 'Token válido, mas não foi possível recuperar as Signing Keys. Verifique se sua conta QStash está ativa.'
      })
    }

    return NextResponse.json({ valid: true, message: 'QStash OK! (Keys recuperadas com sucesso)' })
  } catch (error) {
    console.error('QStash validation error:', error)
    return NextResponse.json({
      valid: false,
      error: `Erro ao conectar QStash: ${error instanceof Error ? error.message : String(error)}`
    })
  }
}

async function validateWhatsApp(credentials: Record<string, string>) {
  const token = cleanCredential(credentials.token)
  const phoneId = cleanCredential(credentials.phoneId)
  const businessId = cleanCredential(credentials.businessId)

  if (!token || !phoneId || !businessId) {
    return NextResponse.json(
      { valid: false, error: 'Todos os campos são obrigatórios' },
      { status: 400 }
    )
  }

  try {
    // Test WhatsApp by getting phone number info
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v21.0/${phoneId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        timeoutMs: 8000,
      }
    )

    if (!response.ok) {
      const error = await safeJson<any>(response)
      return NextResponse.json({
        valid: false,
        error: error?.error?.message || 'Token ou Phone ID inválido'
      })
    }

    const data = await safeJson<any>(response)

    return NextResponse.json({
      valid: true,
      message: `WhatsApp OK! (${data.verified_name || data.display_phone_number || 'Conectado'})`
    })
  } catch (error) {
    console.error('WhatsApp validation error:', error)
    return NextResponse.json({
      valid: false,
      error: isAbortError(error) ? 'Timeout ao conectar ao WhatsApp' : 'Não foi possível conectar ao WhatsApp'
    })
  }
}
