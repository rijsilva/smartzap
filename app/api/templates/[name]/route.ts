import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

// GET /api/templates/[name] - Buscar template específico
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const credentials = await getWhatsAppCredentials()
    
    if (!credentials?.businessAccountId || !credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Credenciais não configuradas.' }, 
        { status: 401 }
      )
    }

    // Buscar template específico pelo nome
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/message_templates?name=${encodeURIComponent(name)}&fields=id,name,status,language,category,parameter_format,components,last_updated_time,quality_score,rejected_reason`,
      {
        headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
        timeoutMs: 8000,
      }
    )

    if (!response.ok) {
      const error = await safeJson<any>(response)
      return NextResponse.json(
        { error: error?.error?.message || 'Template não encontrado' },
        { status: response.status }
      )
    }

    const data = await safeJson<any>(response)
    
    if (!data.data || data.data.length === 0) {
      return NextResponse.json(
        { error: 'Template não encontrado' },
        { status: 404 }
      )
    }

    const template = data.data[0]
    const bodyComponent = template.components?.find((c: { type: string }) => c.type === 'BODY')
    const headerComponent = template.components?.find((c: { type: string }) => c.type === 'HEADER')
    const footerComponent = template.components?.find((c: { type: string }) => c.type === 'FOOTER')
    const buttonsComponent = template.components?.find((c: { type: string }) => c.type === 'BUTTONS')

    return NextResponse.json({
      id: template.name,
      metaTemplateId: template.id || null,
      name: template.name,
      category: template.category,
      language: template.language,
      status: template.status,
      content: bodyComponent?.text || '',
      header: headerComponent?.text || headerComponent?.format || null,
      footer: footerComponent?.text || null,
      buttons: buttonsComponent?.buttons || [],
      components: template.components,
      qualityScore: template.quality_score?.score || null,
      rejectedReason: template.rejected_reason || null,
      lastUpdated: template.last_updated_time
    })

  } catch (error) {
    console.error('Get Template Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}

// DELETE /api/templates/[name] - Deletar template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const credentials = await getWhatsAppCredentials()
    
    if (!credentials?.businessAccountId || !credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Credenciais não configuradas.' }, 
        { status: 401 }
      )
    }

    // Deletar template via Meta API
    // A Meta exige que especifiquemos o nome do template
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/message_templates?name=${name}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
        timeoutMs: 8000,
      }
    )

    const result = await safeJson<any>(response)

    if (!response.ok) {
      console.error('Meta Delete Error:', result)
      
      let errorMessage = result?.error?.message || 'Erro ao deletar template'
      
      // Traduzir erros comuns
      if (result?.error?.code === 100) {
        errorMessage = 'Template não encontrado ou já foi deletado.'
      } else if (result?.error?.code === 190) {
        errorMessage = 'Token de acesso inválido ou expirado.'
      }
      
      return NextResponse.json(
        { error: errorMessage, metaError: result?.error },
        { status: response.status }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Template "${name}" deletado com sucesso!`
    })

  } catch (error) {
    console.error('Delete Template Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
