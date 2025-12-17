import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fetchWithTimeout, safeJson, isAbortError } from '@/lib/server-http'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Credentials are stored in Supabase settings table
// Environment variables are used as fallback (read-only)

interface WhatsAppCredentials {
  phoneNumberId: string
  businessAccountId: string
  accessToken: string
  displayPhoneNumber?: string
  verifiedName?: string
}

// GET - Fetch credentials from DB, fallback to Env
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        source: 'none',
        isConnected: false,
        warning: 'Supabase não configurado (variáveis de ambiente ausentes).',
      })
    }

    // 1. Try to get from DB (sem derrubar a UI em caso de erro)
    let dbSettings = {
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false,
    }

    let dbErrorMsg: string | null = null
    try {
      dbSettings = await settingsDb.getAll()
    } catch (err: any) {
      dbErrorMsg = String(err?.message || err)
    }

    let phoneNumberId = dbSettings.phoneNumberId
    let businessAccountId = dbSettings.businessAccountId
    let accessToken = dbSettings.accessToken
    let source: 'db' | 'env_fallback' | 'db_error' = dbErrorMsg ? 'db_error' : 'db'

    // 2. Fallback to Env if missing in DB
    if (!phoneNumberId || !businessAccountId || !accessToken) {
      phoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_ID || ''
      businessAccountId = businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || ''
      accessToken = accessToken || process.env.WHATSAPP_TOKEN || ''
      source = dbErrorMsg ? 'db_error' : 'env_fallback'
    }

    if (phoneNumberId && businessAccountId && accessToken) {
      // Fetch display phone number from Meta API
      let displayPhoneNumber: string | undefined
      let verifiedName: string | undefined

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2500)
        const metaResponse = await fetch(
          `https://graph.facebook.com/v24.0/${phoneNumberId}?fields=display_phone_number,verified_name`,
          { headers: { 'Authorization': `Bearer ${accessToken}` }, signal: controller.signal }
        )
        clearTimeout(timeout)
        if (metaResponse.ok) {
          const metaData = await metaResponse.json()
          displayPhoneNumber = metaData.display_phone_number
          verifiedName = metaData.verified_name
        }
      } catch {
        // Ignore errors, just won't have display number
      }

      return NextResponse.json({
        source,
        phoneNumberId,
        businessAccountId,
        displayPhoneNumber,
        verifiedName,
        hasToken: true,
        tokenPreview: '••••••••••',
        isConnected: true,
        ...(dbErrorMsg ? { warning: `Falha ao ler credenciais do DB: ${dbErrorMsg}` } : {}),
      })
    }

    // Not configured
    return NextResponse.json({
      source: dbErrorMsg ? 'db_error' : 'none',
      isConnected: false,
      ...(dbErrorMsg ? { warning: `Falha ao ler credenciais do DB: ${dbErrorMsg}` } : {}),
    })
  } catch (error) {
    console.error('Error fetching credentials:', error)
    // Evita 500 para não causar cascata de retries/lentidão no frontend.
    return NextResponse.json({
      source: 'none',
      isConnected: false,
      error: 'Failed to fetch credentials',
      details: String((error as any)?.message || error),
    })
  }
}

// POST - Validate AND Save credentials to DB
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const { phoneNumberId, businessAccountId, accessToken } = body

    if (!phoneNumberId || !businessAccountId || !accessToken) {
      return NextResponse.json(
        { error: 'Missing required fields: phoneNumberId, businessAccountId, accessToken' },
        { status: 400 }
      )
    }

    // Validate token by making a test call to Meta API
    const testResponse = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        timeoutMs: 8000,
      }
    )

    if (!testResponse.ok) {
      const error = await safeJson<any>(testResponse)
      return NextResponse.json(
        {
          error: 'Invalid credentials - Meta API rejected the token',
          details: error?.error?.message || 'Unknown error'
        },
        { status: 401 }
      )
    }

    const phoneData = await safeJson<any>(testResponse)

    // Save to Database (Persist across refreshes)
    await settingsDb.saveAll({
      phoneNumberId,
      businessAccountId,
      accessToken,
      isConnected: true
    })

    return NextResponse.json({
      success: true,
      phoneNumberId,
      businessAccountId,
      displayPhoneNumber: phoneData.display_phone_number,
      verifiedName: phoneData.verified_name,
      qualityRating: phoneData.quality_rating,
      message: 'Credentials verified and saved successfully.'
    })
  } catch (error) {
    console.error('Error validating credentials:', error)
    return NextResponse.json(
      { error: 'Failed to validate credentials' },
      { status: isAbortError(error) ? 504 : 502 }
    )
  }
}

// DELETE - Clear credentials from DB
export async function DELETE() {
  try {
    await settingsDb.saveAll({
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false
    })

    return NextResponse.json({
      success: true,
      message: 'Credentials removed from database.'
    })
  } catch (error) {
    console.error('Error deleting credentials:', error)
    return NextResponse.json(
      { error: 'Failed to delete credentials' },
      { status: 500 }
    )
  }
}
