/**
 * T042: AI Model Configuration
 * Gemini model configuration for support agent
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'

// =============================================================================
// Model Configuration Schema
// =============================================================================

/**
 * Schema for AI agent call options
 * Used to configure individual agent invocations
 */
export const callOptionsSchema = z.object({
  /** Maximum tokens in the response */
  maxTokens: z.number().int().positive().max(8192).default(2048),
  /** Temperature for response randomness (0-2) */
  temperature: z.number().min(0).max(2).default(0.7),
  /** Top-p sampling parameter */
  topP: z.number().min(0).max(1).optional(),
  /** Stop sequences to end generation */
  stopSequences: z.array(z.string()).optional(),
})

export type CallOptions = z.infer<typeof callOptionsSchema>

// =============================================================================
// Model Factory
// =============================================================================

/**
 * Get Gemini model instance
 * Uses environment variables for API key
 */
export function getGeminiModel(modelId: string = 'gemini-2.5-flash') {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY environment variable')
  }

  const google = createGoogleGenerativeAI({
    apiKey,
  })

  return google(modelId)
}

/**
 * Default model for support agent
 * gemini-3-flash-preview is the latest generation
 */
export const DEFAULT_MODEL_ID = 'gemini-3-flash-preview'

/**
 * Available models for AI agents
 * Organized by generation (newest first)
 *
 * Todos os modelos funcionam com RAG próprio (pgvector)
 */
export const AI_AGENT_MODELS = [
  // Gemini 3 - Latest generation
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    description: 'Mais recente, rápido e inteligente (recomendado)',
    generation: 3,
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    description: 'Máxima qualidade, melhor raciocínio',
    generation: 3,
  },
  // Gemini 2.5 - Current stable generation
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Estável, rápido e eficiente',
    generation: 2.5,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Alta qualidade, raciocínio avançado',
    generation: 2.5,
  },
  // Gemini 2.0 - Previous generation
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Geração anterior, rápido',
    generation: 2.0,
  },
] as const

/**
 * @deprecated Use AI_AGENT_MODELS instead
 */
export const SUPPORT_AGENT_MODELS = AI_AGENT_MODELS

/**
 * Get model info by ID
 */
export function getModelInfo(modelId: string) {
  return AI_AGENT_MODELS.find(m => m.id === modelId)
}

// =============================================================================
// Response Schema
// =============================================================================

/**
 * Schema for structured AI responses
 * Ensures consistent response format from the agent
 */
export const supportResponseSchema = z.object({
  /** The response message to send to the user */
  message: z.string().describe('A resposta para enviar ao usuário'),
  /** Sentiment detected in user message */
  sentiment: z
    .enum(['positive', 'neutral', 'negative', 'frustrated'])
    .describe('Sentimento detectado na mensagem do usuário'),
  /** Confidence level in the response (0-1) */
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Nível de confiança na resposta (0 = incerto, 1 = certo)'),
  /** Whether the agent should hand off to a human */
  shouldHandoff: z
    .boolean()
    .describe('Se deve transferir para um atendente humano'),
  /** Reason for handoff if shouldHandoff is true */
  handoffReason: z
    .string()
    .optional()
    .describe('Motivo da transferência para humano'),
  /** Summary of the conversation for handoff */
  handoffSummary: z
    .string()
    .optional()
    .describe('Resumo da conversa para o atendente'),
  /** Sources used to generate the response */
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

export type SupportResponse = z.infer<typeof supportResponseSchema>

// =============================================================================
// Default Call Options
// =============================================================================

export const DEFAULT_CALL_OPTIONS: CallOptions = {
  maxTokens: 2048,
  temperature: 0.7,
}
