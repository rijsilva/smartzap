/**
 * T055: Test AI Agent endpoint (V2 - AI SDK Patterns)
 * Allows testing an agent with a sample message before activation
 *
 * Uses streamText + tools for structured output (AI SDK v6 pattern)
 * Supports RAG with pgvector for knowledge base search
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'
import { DEFAULT_MODEL_ID } from '@/lib/ai/model'
import {
  findRelevantContent,
  buildEmbeddingConfigFromAgent,
  hasIndexedContent,
} from '@/lib/ai/rag-store'
import type { AIAgent, EmbeddingProvider } from '@/types'

// Mapeamento de provider para chave de API na tabela settings
const EMBEDDING_API_KEY_MAP: Record<EmbeddingProvider, { settingKey: string; envVar: string }> = {
  google: { settingKey: 'gemini_api_key', envVar: 'GEMINI_API_KEY' },
  openai: { settingKey: 'openai_api_key', envVar: 'OPENAI_API_KEY' },
  voyage: { settingKey: 'voyage_api_key', envVar: 'VOYAGE_API_KEY' },
  cohere: { settingKey: 'cohere_api_key', envVar: 'COHERE_API_KEY' },
}

// =============================================================================
// Response Schema (same as support-agent-v2)
// =============================================================================

const testResponseSchema = z.object({
  message: z.string().describe('A resposta para enviar ao usuário'),
  sentiment: z
    .enum(['positive', 'neutral', 'negative', 'frustrated'])
    .describe('Sentimento detectado na mensagem do usuário'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Nível de confiança na resposta (0 = incerto, 1 = certo)'),
  shouldHandoff: z
    .boolean()
    .describe('Se deve transferir para um atendente humano'),
  handoffReason: z
    .string()
    .optional()
    .describe('Motivo da transferência para humano'),
  sources: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
      })
    )
    .optional()
    .describe('Fontes utilizadas para gerar a resposta'),
})

type TestResponse = z.infer<typeof testResponseSchema>

// Helper to get admin client with null check
function getClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured. Check SUPABASE_SECRET_KEY env var.')
  }
  return client
}

const testMessageSchema = z.object({
  message: z.string().min(1, 'Mensagem é obrigatória').max(2000),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = getClient()
    const body = await request.json()

    // Validate body
    const parsed = testMessageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { message } = parsed.data

    // Get agent configuration
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agente não encontrado' },
        { status: 404 }
      )
    }

    console.log(`[ai-agents/test] Agent: ${agent.name}, embedding_provider: ${agent.embedding_provider}`)

    // Check if agent has indexed content in pgvector
    const hasKnowledgeBase = await hasIndexedContent(id)

    // Get count of indexed files for this agent
    const { count: indexedFilesCount } = await supabase
      .from('ai_knowledge_files')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', id)
      .eq('indexing_status', 'completed')

    console.log(`[ai-agents/test] hasKnowledgeBase: ${hasKnowledgeBase}, indexed files: ${indexedFilesCount}`)

    // Import AI dependencies dynamically
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
    const { streamText, tool } = await import('ai')
    const { withDevTools } = await import('@/lib/ai/devtools')

    // Get Gemini API key
    const { data: geminiSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gemini_api_key')
      .maybeSingle()

    const apiKey = geminiSetting?.value || process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key do Gemini não configurada' },
        { status: 500 }
      )
    }

    // Create Google provider with DevTools support
    const google = createGoogleGenerativeAI({ apiKey })
    const modelId = agent.model || DEFAULT_MODEL_ID
    const baseModel = google(modelId)
    const model = await withDevTools(baseModel, { name: `agente:${agent.name}` })

    console.log(`[ai-agents/test] Using model: ${modelId}`)

    // Use system prompt exactly as configured
    const systemPrompt = agent.system_prompt

    // Generate response
    const startTime = Date.now()

    // Capture structured response from tool
    let structuredResponse: TestResponse | undefined
    let ragContext: string | null = null
    let ragSources: Array<{ title: string; content: string }> = []

    console.log(`[ai-agents/test] hasKnowledgeBase: ${hasKnowledgeBase}`)

    // If agent has knowledge base, search for relevant content
    if (hasKnowledgeBase) {
      try {
        // Get embedding API key for the configured provider
        const embeddingProvider = (agent.embedding_provider || 'google') as EmbeddingProvider
        const config = EMBEDDING_API_KEY_MAP[embeddingProvider]

        const { data: embeddingKeySetting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', config.settingKey)
          .maybeSingle()

        const embeddingApiKey = embeddingKeySetting?.value || process.env[config.envVar]

        if (embeddingApiKey) {
          console.log(`[ai-agents/test] Searching knowledge base with ${embeddingProvider}`)

          const embeddingConfig = buildEmbeddingConfigFromAgent(agent as AIAgent, embeddingApiKey)

          const relevantContent = await findRelevantContent({
            agentId: id,
            query: message,
            embeddingConfig,
            topK: agent.rag_max_results || 5,
            threshold: agent.rag_similarity_threshold || 0.5,
          })

          if (relevantContent.length > 0) {
            console.log(`[ai-agents/test] Found ${relevantContent.length} relevant chunks`)

            // Build context string
            ragContext = relevantContent
              .map((r, i) => `[${i + 1}] ${r.content}`)
              .join('\n\n')

            // Build sources for response
            ragSources = relevantContent.map((r, i) => ({
              title: `Trecho ${i + 1} (${(r.similarity * 100).toFixed(0)}% relevante)`,
              content: r.content.slice(0, 200) + (r.content.length > 200 ? '...' : ''),
            }))
          } else {
            console.log(`[ai-agents/test] No relevant content found above threshold`)
          }
        } else {
          console.log(`[ai-agents/test] Embedding API key not configured for ${embeddingProvider}`)
        }
      } catch (ragError) {
        console.error(`[ai-agents/test] RAG search error:`, ragError)
        // Continue without RAG context
      }
    }

    // Build final system prompt with RAG context
    const finalSystemPrompt = ragContext
      ? `${systemPrompt}\n\n---\nCONTEXTO DA BASE DE CONHECIMENTO:\n${ragContext}\n---\n\nUse as informações acima para responder à pergunta do usuário. Se a informação não estiver no contexto, diga que não tem essa informação disponível.`
      : systemPrompt

    console.log(`[ai-agents/test] Using ${ragContext ? 'RAG-enhanced' : 'standard'} prompt`)

    // Define the respond tool
    const respondTool = tool({
      description: 'Envia uma resposta estruturada ao usuário.',
      inputSchema: testResponseSchema,
      execute: async (params) => {
        structuredResponse = {
          ...params,
          sources: ragSources.length > 0 ? ragSources : params.sources,
        }
        return structuredResponse
      },
    })

    const result = streamText({
      model,
      system: finalSystemPrompt,
      prompt: message,
      temperature: agent.temperature ?? 0.7,
      maxOutputTokens: agent.max_tokens ?? 1024,
      tools: {
        respond: respondTool,
      },
      toolChoice: 'required',
    })

    // Consume the stream completely to trigger tool execution
    for await (const _part of result.fullStream) {
      // Just consume - the tool execute function captures the response
    }

    const latencyMs = Date.now() - startTime

    // If no structured response was captured, something went wrong
    if (!structuredResponse) {
      throw new Error('No structured response generated from AI')
    }

    console.log(`[ai-agents/test] Response generated in ${latencyMs}ms. Used RAG: ${!!ragContext}`)

    return NextResponse.json({
      response: structuredResponse.message,
      latency_ms: latencyMs,
      model: modelId,
      knowledge_files_used: indexedFilesCount ?? 0,
      rag_enabled: hasKnowledgeBase,
      rag_chunks_used: ragSources.length,
      // Structured output fields
      sentiment: structuredResponse.sentiment,
      confidence: structuredResponse.confidence,
      shouldHandoff: structuredResponse.shouldHandoff,
      handoffReason: structuredResponse.handoffReason,
      sources: structuredResponse.sources,
    })
  } catch (error) {
    console.error('[ai-agents/test] Error:', error)

    // Handle AI SDK specific errors
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: 'Erro de autenticação com o modelo de IA' },
          { status: 401 }
        )
      }
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        return NextResponse.json(
          { error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' },
          { status: 429 }
        )
      }
      if (error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
        return NextResponse.json(
          { error: 'Quota excedida. Verifique seu plano do Gemini e configure billing.' },
          { status: 429 }
        )
      }
      // Return the actual error message for debugging
      return NextResponse.json(
        { error: `Erro ao testar agente: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Erro ao testar agente' },
      { status: 500 }
    )
  }
}
