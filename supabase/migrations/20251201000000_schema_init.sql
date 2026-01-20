-- =============================================================================
-- SMARTZAP - SCHEMA CONSOLIDADO
-- Gerado: 2026-01-20
-- Padrão: Igual CRM - arquivo único com todas as tabelas, indexes, FKs e RLS
-- =============================================================================

-- =============================================================================
-- PARTE 0: EXTENSÕES
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- PARTE 1: FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_stats() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  total_sent bigint;
  total_delivered bigint;
  total_read bigint;
  total_failed bigint;
  active_campaigns bigint;
  delivery_rate integer;
BEGIN
  SELECT
    coalesce(sum(sent), 0),
    coalesce(sum(delivered), 0),
    coalesce(sum(read), 0),
    coalesce(sum(failed), 0)
  INTO
    total_sent,
    total_delivered,
    total_read,
    total_failed
  FROM campaigns;

  SELECT count(*)
  INTO active_campaigns
  FROM campaigns
  WHERE status in ('Enviando', 'Agendado');

  IF total_sent > 0 THEN
    delivery_rate := round((total_delivered::numeric / total_sent::numeric) * 100);
  ELSE
    delivery_rate := 0;
  END IF;

  RETURN json_build_object(
    'totalSent', total_sent,
    'totalDelivered', total_delivered,
    'totalRead', total_read,
    'totalFailed', total_failed,
    'activeCampaigns', active_campaigns,
    'deliveryRate', delivery_rate
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_campaign_stat(campaign_id_input text, field text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF field = 'sent' THEN
    UPDATE campaigns SET sent = COALESCE(sent, 0) + 1 WHERE id = campaign_id_input;
  ELSIF field = 'delivered' THEN
    UPDATE campaigns SET delivered = COALESCE(delivered, 0) + 1 WHERE id = campaign_id_input;
  ELSIF field = 'read' THEN
    UPDATE campaigns SET read = COALESCE(read, 0) + 1 WHERE id = campaign_id_input;
  ELSIF field = 'failed' THEN
    UPDATE campaigns SET failed = COALESCE(failed, 0) + 1 WHERE id = campaign_id_input;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_campaign_dispatch_metrics() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if (new.sending_at is not null) and (old.sending_at is null) then
    update public.campaigns
      set first_dispatch_at = coalesce(first_dispatch_at, new.sending_at)
      where id = new.campaign_id;
  end if;

  if (new.sent_at is not null) and (old.sent_at is null) then
    update public.campaigns
      set last_sent_at = greatest(coalesce(last_sent_at, new.sent_at), new.sent_at)
      where id = new.campaign_id;
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_campaign_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

SET default_tablespace = '';
SET default_table_access_method = heap;

-- =============================================================================
-- PARTE 2: TABLES (baseline)
-- =============================================================================

CREATE TABLE public.account_alerts (
    id text DEFAULT concat('alert_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    type text NOT NULL,
    code integer,
    message text NOT NULL,
    details jsonb,
    dismissed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaign_batch_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id text NOT NULL,
    trace_id text NOT NULL,
    batch_index integer NOT NULL,
    configured_batch_size integer,
    batch_size integer NOT NULL,
    concurrency integer NOT NULL,
    adaptive_enabled boolean DEFAULT false NOT NULL,
    target_mps integer,
    floor_delay_ms integer,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    meta_requests integer DEFAULT 0 NOT NULL,
    meta_time_ms integer DEFAULT 0 NOT NULL,
    db_time_ms integer DEFAULT 0 NOT NULL,
    saw_throughput_429 boolean DEFAULT false NOT NULL,
    batch_ok boolean DEFAULT true NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaign_contacts (
    id text DEFAULT concat('cc_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    campaign_id text NOT NULL,
    contact_id text,
    phone text NOT NULL,
    name text,
    email text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text,
    message_id text,
    sending_at timestamp with time zone,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    failed_at timestamp with time zone,
    skipped_at timestamp with time zone,
    error text,
    skip_code text,
    skip_reason text,
    failure_code integer,
    failure_reason text,
    trace_id text,
    failure_title text,
    failure_details text,
    failure_fbtrace_id text,
    failure_subcode integer,
    failure_href text,
    CONSTRAINT campaign_contacts_skipped_reason_check CHECK (((status <> 'skipped'::text) OR (failure_reason IS NOT NULL) OR (error IS NOT NULL)))
);

COMMENT ON COLUMN public.campaign_contacts.email IS 'Snapshot do email do contato no momento da criação da campanha';
COMMENT ON COLUMN public.campaign_contacts.custom_fields IS 'Snapshot dos custom_fields do contato no momento da criação da campanha';
COMMENT ON COLUMN public.campaign_contacts.sending_at IS 'Quando o contato foi "claimado" para envio (idempotência/at-least-once)';
COMMENT ON COLUMN public.campaign_contacts.skipped_at IS 'Quando o envio foi ignorado pelo pré-check/guard-rail';
COMMENT ON COLUMN public.campaign_contacts.skip_code IS 'Código estável do motivo de skip (ex.: MISSING_REQUIRED_PARAM)';
COMMENT ON COLUMN public.campaign_contacts.skip_reason IS 'Motivo legível do skip (para UI e auditoria)';

CREATE TABLE public.campaign_run_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id text NOT NULL,
    trace_id text NOT NULL,
    template_name text,
    recipients integer,
    sent_total integer,
    failed_total integer,
    skipped_total integer,
    first_dispatch_at timestamp with time zone,
    last_sent_at timestamp with time zone,
    dispatch_duration_ms integer,
    throughput_mps numeric,
    meta_avg_ms numeric,
    db_avg_ms numeric,
    saw_throughput_429 boolean DEFAULT false NOT NULL,
    config jsonb,
    config_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaigns (
    id text DEFAULT concat('c_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'Rascunho'::text NOT NULL,
    template_name text,
    template_id text,
    template_variables jsonb,
    template_snapshot jsonb,
    template_spec_hash text,
    template_parameter_format text,
    template_fetched_at timestamp with time zone,
    scheduled_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    total_recipients integer DEFAULT 0,
    sent integer DEFAULT 0,
    delivered integer DEFAULT 0,
    read integer DEFAULT 0,
    failed integer DEFAULT 0,
    skipped integer DEFAULT 0,
    last_sent_at timestamp with time zone,
    first_dispatch_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    qstash_schedule_message_id text,
    qstash_schedule_enqueued_at timestamp with time zone,
    flow_id text,
    flow_name text,
    folder_id UUID
);

COMMENT ON COLUMN public.campaigns.flow_id IS 'ID do Flow/MiniApp usado na campanha (meta_flow_id)';
COMMENT ON COLUMN public.campaigns.flow_name IS 'Nome do Flow para exibição';

CREATE VIEW public.campaign_stats_summary AS
 SELECT (count(*))::integer AS total_campaigns,
    (COALESCE(sum(sent), (0)::bigint))::integer AS total_sent,
    (COALESCE(sum(delivered), (0)::bigint))::integer AS total_delivered,
    (COALESCE(sum(read), (0)::bigint))::integer AS total_read,
    (COALESCE(sum(failed), (0)::bigint))::integer AS total_failed,
    (count(CASE WHEN (status = ANY (ARRAY['enviando'::text, 'sending'::text, 'SENDING'::text])) THEN 1 ELSE NULL::integer END))::integer AS active_campaigns,
    (count(CASE WHEN (status = ANY (ARRAY['concluida'::text, 'completed'::text, 'COMPLETED'::text])) THEN 1 ELSE NULL::integer END))::integer AS completed_campaigns,
    (count(CASE WHEN (status = ANY (ARRAY['rascunho'::text, 'draft'::text, 'DRAFT'::text])) THEN 1 ELSE NULL::integer END))::integer AS draft_campaigns,
    (count(CASE WHEN (status = ANY (ARRAY['pausado'::text, 'paused'::text, 'PAUSED'::text])) THEN 1 ELSE NULL::integer END))::integer AS paused_campaigns,
    (count(CASE WHEN (status = ANY (ARRAY['agendado'::text, 'scheduled'::text, 'SCHEDULED'::text])) THEN 1 ELSE NULL::integer END))::integer AS scheduled_campaigns,
    (count(CASE WHEN (status = ANY (ARRAY['falhou'::text, 'failed'::text, 'FAILED'::text])) THEN 1 ELSE NULL::integer END))::integer AS failed_campaigns,
    (COALESCE(sum(CASE WHEN (created_at > (now() - '24:00:00'::interval)) THEN sent ELSE 0 END), (0)::bigint))::integer AS sent_24h,
    (COALESCE(sum(CASE WHEN (created_at > (now() - '24:00:00'::interval)) THEN delivered ELSE 0 END), (0)::bigint))::integer AS delivered_24h,
    (COALESCE(sum(CASE WHEN (created_at > (now() - '24:00:00'::interval)) THEN failed ELSE 0 END), (0)::bigint))::integer AS failed_24h
   FROM public.campaigns;

COMMENT ON VIEW public.campaign_stats_summary IS 'Pre-aggregated campaign statistics for dashboard. Reduces DB queries from O(n) to O(1).';

CREATE TABLE public.campaign_trace_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trace_id text NOT NULL,
    ts timestamp with time zone NOT NULL,
    campaign_id text,
    step text,
    phase text NOT NULL,
    ok boolean,
    ms integer,
    batch_index integer,
    contact_id text,
    phone_masked text,
    extra jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contacts (
    id text DEFAULT concat('ct_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    phone text NOT NULL,
    email text,
    status text DEFAULT 'Opt-in'::text,
    tags jsonb DEFAULT '[]'::jsonb,
    notes text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.custom_field_definitions (
    id text DEFAULT concat('cfd_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    type text DEFAULT 'text'::text NOT NULL,
    options jsonb,
    entity_type text DEFAULT 'contact'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.flow_submissions (
    id text DEFAULT concat('fs_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    message_id text NOT NULL,
    from_phone text NOT NULL,
    contact_id text,
    flow_id text,
    flow_name text,
    flow_token text,
    response_json_raw text NOT NULL,
    response_json jsonb,
    waba_id text,
    phone_number_id text,
    message_timestamp timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    flow_local_id text,
    mapped_data jsonb,
    mapped_at timestamp with time zone,
    campaign_id text
);

CREATE TABLE public.flows (
    id text DEFAULT concat('fl_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    meta_flow_id text,
    spec jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    template_key text,
    flow_json jsonb,
    flow_version text,
    mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    meta_status text,
    meta_preview_url text,
    meta_validation_errors jsonb,
    meta_last_checked_at timestamp with time zone,
    meta_published_at timestamp with time zone
);

CREATE TABLE public.lead_forms (
    id text DEFAULT concat('lf_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    tag text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    success_message text,
    webhook_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    collect_email boolean DEFAULT true NOT NULL
);

CREATE TABLE public.phone_suppressions (
    id text DEFAULT concat('ps_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    phone text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    reason text,
    source text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    expires_at timestamp with time zone
);

COMMENT ON TABLE public.phone_suppressions IS 'Lista global de supressão (não enviar para estes telefones).';
COMMENT ON COLUMN public.phone_suppressions.phone IS 'Telefone normalizado em E.164 (ex.: +5511999999999)';
COMMENT ON COLUMN public.phone_suppressions.source IS 'Origem: inbound_keyword, meta_opt_out_error, manual, etc.';
COMMENT ON COLUMN public.phone_suppressions.expires_at IS 'Quando definido, a supressão expira automaticamente (quarentena).';

CREATE TABLE public.settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.template_project_items (
    id text DEFAULT concat('tpi_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    project_id text NOT NULL,
    name text NOT NULL,
    content text NOT NULL,
    language text DEFAULT 'pt_BR'::text,
    category text DEFAULT 'UTILITY'::text,
    status text DEFAULT 'draft'::text,
    meta_id text,
    meta_status text,
    rejected_reason text,
    submitted_at timestamp with time zone,
    components jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.template_projects (
    id text DEFAULT concat('tp_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    user_id text,
    title text NOT NULL,
    prompt text,
    status text DEFAULT 'draft'::text,
    template_count integer DEFAULT 0,
    approved_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.templates (
    id text DEFAULT concat('tpl_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    category text,
    language text DEFAULT 'pt_BR'::text,
    status text,
    parameter_format text DEFAULT 'positional'::text,
    components jsonb,
    spec_hash text,
    fetched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    header_media_preview_url text,
    header_media_preview_expires_at timestamp with time zone,
    header_media_preview_updated_at timestamp with time zone
);

CREATE TABLE public.whatsapp_status_events (
    id text DEFAULT concat('wse_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    message_id text NOT NULL,
    status text NOT NULL,
    event_ts timestamp with time zone,
    event_ts_raw text,
    dedupe_key text NOT NULL,
    recipient_id text,
    errors jsonb,
    payload jsonb,
    apply_state text DEFAULT 'pending'::text NOT NULL,
    applied boolean DEFAULT false NOT NULL,
    applied_at timestamp with time zone,
    apply_error text,
    attempts integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    campaign_contact_id text,
    campaign_id text,
    first_received_at timestamp with time zone DEFAULT now() NOT NULL,
    last_received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workflow_builder_executions (
    id text NOT NULL,
    workflow_id text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);

CREATE TABLE public.workflow_builder_logs (
    id bigint NOT NULL,
    execution_id text NOT NULL,
    node_id text NOT NULL,
    node_name text,
    node_type text,
    status text NOT NULL,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);

CREATE SEQUENCE public.workflow_builder_logs_id_seq
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.workflow_builder_logs_id_seq OWNED BY public.workflow_builder_logs.id;

CREATE TABLE public.workflow_conversations (
    id text NOT NULL,
    workflow_id text NOT NULL,
    phone text NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    resume_node_id text,
    variable_key text,
    variables jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workflow_run_logs (
    id bigint NOT NULL,
    run_id text NOT NULL,
    node_id text NOT NULL,
    node_name text,
    node_type text,
    status text NOT NULL,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);

CREATE SEQUENCE public.workflow_run_logs_id_seq
    START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.workflow_run_logs_id_seq OWNED BY public.workflow_run_logs.id;

CREATE TABLE public.workflow_runs (
    id text NOT NULL,
    workflow_id text NOT NULL,
    version_id text,
    status text DEFAULT 'running'::text NOT NULL,
    trigger_type text,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);

CREATE TABLE public.workflow_versions (
    id text NOT NULL,
    workflow_id text NOT NULL,
    version integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    nodes jsonb NOT NULL,
    edges jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone
);

CREATE TABLE public.workflows (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    owner_company_id text,
    active_version_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =============================================================================
-- PARTE 3: TABLES (inbox/ai - feature 001)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  temperature REAL NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 1024,
  -- RAG: Configuração de embeddings (substituiu file_search_store_id)
  embedding_provider TEXT DEFAULT 'google',
  embedding_model TEXT DEFAULT 'gemini-embedding-001',
  embedding_dimensions INTEGER DEFAULT 768,
  -- RAG: Configuração de reranking
  rerank_enabled BOOLEAN DEFAULT false,
  rerank_provider TEXT,
  rerank_model TEXT,
  rerank_top_k INTEGER DEFAULT 5,
  -- RAG: Configuração de busca
  rag_similarity_threshold REAL DEFAULT 0.5,
  rag_max_results INTEGER DEFAULT 5,
  -- Outros
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  debounce_ms INTEGER NOT NULL DEFAULT 5000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_agents IS 'AI agents configuration. RAG uses pgvector (ai_embeddings table) instead of Google File Search.';

-- inbox_conversations: contact_id FK adicionada no final como ALTER TABLE
-- NOTA: contact_id é TEXT porque contacts.id usa prefixo 'ct_' + uuid (não UUID puro)
CREATE TABLE IF NOT EXISTS inbox_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT,
  ai_agent_id UUID,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  mode TEXT NOT NULL DEFAULT 'bot',
  priority TEXT NOT NULL DEFAULT 'normal',
  unread_count INTEGER NOT NULL DEFAULT 0,
  total_messages INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  automation_paused_until TIMESTAMPTZ,
  automation_paused_by TEXT,
  handoff_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  direction TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  whatsapp_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  ai_response_id UUID,
  ai_sentiment TEXT,
  ai_sources JSONB,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT
);

CREATE TABLE IF NOT EXISTS ai_agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_agent_id UUID NOT NULL,
  conversation_id UUID,
  input_message TEXT NOT NULL,
  output_message TEXT,
  response_time_ms INTEGER,
  model_used TEXT,
  tokens_used INTEGER,
  sources_used JSONB,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbox_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'gray',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbox_conversation_labels (
  conversation_id UUID NOT NULL,
  label_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, label_id)
);

CREATE TABLE IF NOT EXISTS inbox_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_knowledge_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'text/plain',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content TEXT,
  external_file_id TEXT,
  external_file_uri TEXT,
  indexing_status TEXT NOT NULL DEFAULT 'pending',
  chunks_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de embeddings para RAG com pgvector
CREATE TABLE IF NOT EXISTS ai_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  file_id UUID,
  content TEXT NOT NULL,
  embedding VECTOR(768) NOT NULL,
  dimensions INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE ai_embeddings IS 'Armazena embeddings vetoriais para RAG (Retrieval-Augmented Generation)';
COMMENT ON COLUMN ai_embeddings.embedding IS 'Vetor de embedding (768 dimensões - Google Gemini)';

-- =============================================================================
-- PARTE 4: TABLES (campaign folders/tags - feature 004)
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campaign_folders_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS campaign_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campaign_tags_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS campaign_tag_assignments (
  campaign_id TEXT NOT NULL,
  tag_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, tag_id)
);

-- =============================================================================
-- PARTE 5: SEQUENCE DEFAULTS
-- =============================================================================

ALTER TABLE ONLY public.workflow_builder_logs ALTER COLUMN id SET DEFAULT nextval('public.workflow_builder_logs_id_seq'::regclass);
ALTER TABLE ONLY public.workflow_run_logs ALTER COLUMN id SET DEFAULT nextval('public.workflow_run_logs_id_seq'::regclass);

-- =============================================================================
-- PARTE 6: PRIMARY KEYS (baseline)
-- =============================================================================

ALTER TABLE ONLY public.account_alerts ADD CONSTRAINT account_alerts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.campaign_batch_metrics ADD CONSTRAINT campaign_batch_metrics_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.campaign_contacts ADD CONSTRAINT campaign_contacts_campaign_id_contact_id_key UNIQUE (campaign_id, contact_id);
ALTER TABLE ONLY public.campaign_contacts ADD CONSTRAINT campaign_contacts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.campaign_run_metrics ADD CONSTRAINT campaign_run_metrics_campaign_id_trace_id_key UNIQUE (campaign_id, trace_id);
ALTER TABLE ONLY public.campaign_run_metrics ADD CONSTRAINT campaign_run_metrics_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.campaign_trace_events ADD CONSTRAINT campaign_trace_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contacts ADD CONSTRAINT contacts_phone_key UNIQUE (phone);
ALTER TABLE ONLY public.contacts ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.custom_field_definitions ADD CONSTRAINT custom_field_definitions_entity_type_key_key UNIQUE (entity_type, key);
ALTER TABLE ONLY public.custom_field_definitions ADD CONSTRAINT custom_field_definitions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.flow_submissions ADD CONSTRAINT flow_submissions_message_id_key UNIQUE (message_id);
ALTER TABLE ONLY public.flow_submissions ADD CONSTRAINT flow_submissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.flows ADD CONSTRAINT flows_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.lead_forms ADD CONSTRAINT lead_forms_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.lead_forms ADD CONSTRAINT lead_forms_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.lead_forms ADD CONSTRAINT lead_forms_webhook_token_key UNIQUE (webhook_token);
ALTER TABLE ONLY public.phone_suppressions ADD CONSTRAINT phone_suppressions_phone_key UNIQUE (phone);
ALTER TABLE ONLY public.phone_suppressions ADD CONSTRAINT phone_suppressions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.settings ADD CONSTRAINT settings_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.template_project_items ADD CONSTRAINT template_project_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.template_projects ADD CONSTRAINT template_projects_pkey PRIMARY KEY (id);
-- Fix: templates unique constraint é name+language, não apenas name
ALTER TABLE ONLY public.templates ADD CONSTRAINT templates_name_language_key UNIQUE (name, language);
ALTER TABLE ONLY public.templates ADD CONSTRAINT templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.whatsapp_status_events ADD CONSTRAINT whatsapp_status_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workflow_builder_executions ADD CONSTRAINT workflow_builder_executions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workflow_builder_logs ADD CONSTRAINT workflow_builder_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workflow_conversations ADD CONSTRAINT workflow_conversations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workflow_run_logs ADD CONSTRAINT workflow_run_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workflow_runs ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workflow_versions ADD CONSTRAINT workflow_versions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workflows ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);

-- =============================================================================
-- PARTE 7: INDEXES (baseline)
-- =============================================================================

CREATE INDEX campaign_batch_metrics_campaign_idx ON public.campaign_batch_metrics USING btree (campaign_id, created_at DESC);
CREATE INDEX campaign_batch_metrics_trace_idx ON public.campaign_batch_metrics USING btree (trace_id, batch_index);
CREATE INDEX campaign_run_metrics_campaign_idx ON public.campaign_run_metrics USING btree (campaign_id, created_at DESC);
CREATE INDEX campaign_run_metrics_config_hash_idx ON public.campaign_run_metrics USING btree (config_hash, created_at DESC);
CREATE INDEX campaign_run_metrics_created_idx ON public.campaign_run_metrics USING btree (created_at DESC);
CREATE INDEX campaign_trace_events_campaign_idx ON public.campaign_trace_events USING btree (campaign_id, ts DESC);
CREATE INDEX campaign_trace_events_trace_idx ON public.campaign_trace_events USING btree (trace_id, ts DESC);
CREATE INDEX campaign_trace_events_trace_phase_idx ON public.campaign_trace_events USING btree (trace_id, phase, ts DESC);
CREATE INDEX campaigns_cancelled_at_idx ON public.campaigns USING btree (cancelled_at);
CREATE INDEX campaigns_first_dispatch_at_idx ON public.campaigns USING btree (first_dispatch_at DESC);
CREATE INDEX campaigns_last_sent_at_idx ON public.campaigns USING btree (last_sent_at DESC);
CREATE INDEX idx_account_alerts_dismissed ON public.account_alerts USING btree (dismissed);
CREATE INDEX idx_account_alerts_dismissed_created ON public.account_alerts USING btree (dismissed, created_at DESC);
CREATE INDEX idx_account_alerts_type ON public.account_alerts USING btree (type);
CREATE INDEX idx_campaign_contacts_campaign ON public.campaign_contacts USING btree (campaign_id);
CREATE INDEX idx_campaign_contacts_campaign_phone ON public.campaign_contacts USING btree (campaign_id, phone);
CREATE INDEX idx_campaign_contacts_failed_recent ON public.campaign_contacts USING btree (campaign_id, failed_at DESC) WHERE (status = 'failed'::text);
CREATE INDEX idx_campaign_contacts_failure ON public.campaign_contacts USING btree (failure_code);
CREATE INDEX idx_campaign_contacts_failure_fbtrace_id ON public.campaign_contacts USING btree (failure_fbtrace_id);
CREATE INDEX idx_campaign_contacts_failure_subcode ON public.campaign_contacts USING btree (failure_subcode);
CREATE INDEX idx_campaign_contacts_failure_title ON public.campaign_contacts USING btree (failure_title);
CREATE INDEX idx_campaign_contacts_message_id ON public.campaign_contacts USING btree (message_id);
CREATE INDEX idx_campaign_contacts_sending_at ON public.campaign_contacts USING btree (sending_at DESC);
CREATE INDEX idx_campaign_contacts_skipped_at ON public.campaign_contacts USING btree (skipped_at DESC);
CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts USING btree (status);
CREATE INDEX idx_campaign_contacts_trace_id ON public.campaign_contacts USING btree (trace_id);
CREATE INDEX idx_campaigns_created_at ON public.campaigns USING btree (created_at DESC);
CREATE INDEX idx_campaigns_flow_id ON public.campaigns USING btree (flow_id) WHERE (flow_id IS NOT NULL);
CREATE INDEX idx_campaigns_qstash_schedule_message_id ON public.campaigns USING btree (qstash_schedule_message_id);
CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);
CREATE INDEX idx_campaigns_folder_id ON public.campaigns USING btree (folder_id);
CREATE INDEX idx_contacts_custom_fields ON public.contacts USING gin (custom_fields);
CREATE INDEX idx_contacts_phone ON public.contacts USING btree (phone);
CREATE INDEX idx_contacts_status ON public.contacts USING btree (status);
CREATE INDEX idx_custom_field_definitions_entity ON public.custom_field_definitions USING btree (entity_type);
CREATE INDEX idx_flow_submissions_campaign_id ON public.flow_submissions USING btree (campaign_id);
CREATE INDEX idx_flow_submissions_contact_id ON public.flow_submissions USING btree (contact_id);
CREATE INDEX idx_flow_submissions_created_at ON public.flow_submissions USING btree (created_at DESC);
CREATE INDEX idx_flow_submissions_flow_id ON public.flow_submissions USING btree (flow_id);
CREATE INDEX idx_flow_submissions_flow_local_id ON public.flow_submissions USING btree (flow_local_id);
CREATE INDEX idx_flow_submissions_from_phone ON public.flow_submissions USING btree (from_phone);
CREATE INDEX idx_flows_created_at ON public.flows USING btree (created_at DESC);
CREATE INDEX idx_flows_meta_flow_id ON public.flows USING btree (meta_flow_id);
CREATE INDEX idx_flows_meta_status ON public.flows USING btree (meta_status);
CREATE INDEX idx_flows_status ON public.flows USING btree (status);
CREATE INDEX idx_flows_template_key ON public.flows USING btree (template_key);
CREATE INDEX idx_lead_forms_collect_email ON public.lead_forms USING btree (collect_email);
CREATE INDEX idx_lead_forms_is_active ON public.lead_forms USING btree (is_active);
CREATE INDEX idx_lead_forms_slug ON public.lead_forms USING btree (slug);
CREATE INDEX idx_phone_suppressions_active ON public.phone_suppressions USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_phone_suppressions_expires ON public.phone_suppressions USING btree (expires_at) WHERE (expires_at IS NOT NULL);
CREATE INDEX idx_phone_suppressions_phone ON public.phone_suppressions USING btree (phone);
CREATE INDEX idx_template_project_items_project ON public.template_project_items USING btree (project_id);
CREATE INDEX idx_template_project_items_status ON public.template_project_items USING btree (status);
CREATE INDEX idx_template_projects_status ON public.template_projects USING btree (status);
CREATE INDEX idx_templates_name ON public.templates USING btree (name);
CREATE INDEX idx_templates_status ON public.templates USING btree (status);
CREATE INDEX idx_whatsapp_status_events_apply_state ON public.whatsapp_status_events USING btree (apply_state);
CREATE INDEX idx_whatsapp_status_events_last_received_at ON public.whatsapp_status_events USING btree (last_received_at DESC);
CREATE INDEX idx_whatsapp_status_events_message_id ON public.whatsapp_status_events USING btree (message_id);
CREATE INDEX lead_forms_fields_gin_idx ON public.lead_forms USING gin (fields);
CREATE UNIQUE INDEX ux_whatsapp_status_events_dedupe_key ON public.whatsapp_status_events USING btree (dedupe_key);
CREATE INDEX workflow_builder_executions_workflow_id_idx ON public.workflow_builder_executions USING btree (workflow_id, started_at DESC);
CREATE INDEX workflow_builder_logs_execution_id_idx ON public.workflow_builder_logs USING btree (execution_id, started_at DESC);
CREATE INDEX workflow_conversations_phone_idx ON public.workflow_conversations USING btree (phone, updated_at DESC);
CREATE INDEX workflow_conversations_workflow_id_idx ON public.workflow_conversations USING btree (workflow_id, updated_at DESC);
CREATE INDEX workflow_run_logs_run_id_idx ON public.workflow_run_logs USING btree (run_id, started_at DESC);
CREATE INDEX workflow_runs_version_id_idx ON public.workflow_runs USING btree (version_id, started_at DESC);
CREATE INDEX workflow_runs_workflow_id_idx ON public.workflow_runs USING btree (workflow_id, started_at DESC);
CREATE INDEX workflow_versions_workflow_id_idx ON public.workflow_versions USING btree (workflow_id, created_at DESC);
CREATE UNIQUE INDEX workflow_versions_workflow_version_idx ON public.workflow_versions USING btree (workflow_id, version);

-- Indexes inbox
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_phone ON inbox_conversations(phone);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_mode_status ON inbox_conversations(mode, status);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_last_message_at ON inbox_conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_contact_id ON inbox_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_conversation_id ON inbox_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_created_at ON inbox_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_whatsapp_id ON inbox_messages(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_agent_id ON ai_agent_logs(ai_agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_conversation_id ON ai_agent_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_created_at ON ai_agent_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_files_agent_id ON ai_knowledge_files(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_files_created_at ON ai_knowledge_files(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agents_single_default ON ai_agents (is_default) WHERE is_default = true;

-- Indexes ai_embeddings (RAG)
CREATE INDEX IF NOT EXISTS ai_embeddings_embedding_idx ON ai_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ai_embeddings_agent_id_idx ON ai_embeddings(agent_id);
CREATE INDEX IF NOT EXISTS ai_embeddings_file_id_idx ON ai_embeddings(file_id);
CREATE INDEX IF NOT EXISTS ai_embeddings_agent_dimensions_idx ON ai_embeddings(agent_id, dimensions);

-- Indexes campaign folders/tags
CREATE INDEX IF NOT EXISTS idx_campaign_tag_assignments_campaign ON campaign_tag_assignments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_tag_assignments_tag ON campaign_tag_assignments(tag_id);

-- =============================================================================
-- PARTE 8: TRIGGERS
-- =============================================================================

CREATE TRIGGER trg_campaign_contacts_dispatch_metrics AFTER UPDATE OF sending_at, sent_at ON public.campaign_contacts FOR EACH ROW EXECUTE FUNCTION public.update_campaign_dispatch_metrics();

DROP TRIGGER IF EXISTS update_inbox_conversations_updated_at ON inbox_conversations;
CREATE TRIGGER update_inbox_conversations_updated_at BEFORE UPDATE ON inbox_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_agents_updated_at ON ai_agents;
CREATE TRIGGER update_ai_agents_updated_at BEFORE UPDATE ON ai_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_knowledge_files_updated_at ON ai_knowledge_files;
CREATE TRIGGER update_ai_knowledge_files_updated_at BEFORE UPDATE ON ai_knowledge_files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_campaign_folders_updated_at ON campaign_folders;
CREATE TRIGGER trg_campaign_folders_updated_at BEFORE UPDATE ON campaign_folders FOR EACH ROW EXECUTE FUNCTION update_campaign_folders_updated_at();

-- =============================================================================
-- PARTE 9: FOREIGN KEYS (todas juntas no final para evitar problemas de ordem)
-- =============================================================================

-- Baseline FKs
ALTER TABLE ONLY public.campaign_contacts ADD CONSTRAINT campaign_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.campaign_contacts ADD CONSTRAINT campaign_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.flow_submissions ADD CONSTRAINT flow_submissions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.flow_submissions ADD CONSTRAINT flow_submissions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.flow_submissions ADD CONSTRAINT flow_submissions_flow_local_id_fkey FOREIGN KEY (flow_local_id) REFERENCES public.flows(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.template_project_items ADD CONSTRAINT template_project_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.template_projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.whatsapp_status_events ADD CONSTRAINT whatsapp_status_events_campaign_contact_id_fkey FOREIGN KEY (campaign_contact_id) REFERENCES public.campaign_contacts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.whatsapp_status_events ADD CONSTRAINT whatsapp_status_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.workflow_builder_logs ADD CONSTRAINT workflow_builder_logs_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.workflow_builder_executions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workflow_conversations ADD CONSTRAINT workflow_conversations_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workflow_run_logs ADD CONSTRAINT workflow_run_logs_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workflow_runs ADD CONSTRAINT workflow_runs_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.workflow_versions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.workflow_runs ADD CONSTRAINT workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workflow_versions ADD CONSTRAINT workflow_versions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workflows ADD CONSTRAINT workflows_active_version_fk FOREIGN KEY (active_version_id) REFERENCES public.workflow_versions(id) ON DELETE SET NULL;

-- Campaign folder FK
ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES campaign_folders(id) ON DELETE SET NULL;

-- Inbox FKs (movidas para cá para garantir que contacts/ai_agents existem)
ALTER TABLE ONLY inbox_conversations ADD CONSTRAINT inbox_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE ONLY inbox_conversations ADD CONSTRAINT inbox_conversations_ai_agent_id_fkey FOREIGN KEY (ai_agent_id) REFERENCES ai_agents(id) ON DELETE SET NULL;
ALTER TABLE ONLY inbox_messages ADD CONSTRAINT inbox_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES inbox_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY ai_agent_logs ADD CONSTRAINT ai_agent_logs_ai_agent_id_fkey FOREIGN KEY (ai_agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE;
ALTER TABLE ONLY ai_agent_logs ADD CONSTRAINT ai_agent_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES inbox_conversations(id) ON DELETE SET NULL;
ALTER TABLE ONLY inbox_conversation_labels ADD CONSTRAINT inbox_conversation_labels_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES inbox_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY inbox_conversation_labels ADD CONSTRAINT inbox_conversation_labels_label_id_fkey FOREIGN KEY (label_id) REFERENCES inbox_labels(id) ON DELETE CASCADE;
ALTER TABLE ONLY ai_knowledge_files ADD CONSTRAINT ai_knowledge_files_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE;

-- AI Embeddings FKs
ALTER TABLE ONLY ai_embeddings ADD CONSTRAINT ai_embeddings_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE;
ALTER TABLE ONLY ai_embeddings ADD CONSTRAINT ai_embeddings_file_id_fkey FOREIGN KEY (file_id) REFERENCES ai_knowledge_files(id) ON DELETE CASCADE;

-- Campaign tags FKs
ALTER TABLE ONLY campaign_tag_assignments ADD CONSTRAINT campaign_tag_assignments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE ONLY campaign_tag_assignments ADD CONSTRAINT campaign_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES campaign_tags(id) ON DELETE CASCADE;

-- =============================================================================
-- PARTE 10: CHECK CONSTRAINTS (inbox)
-- =============================================================================

ALTER TABLE inbox_conversations ADD CONSTRAINT chk_inbox_conversations_status CHECK (status IN ('open', 'closed'));
ALTER TABLE inbox_conversations ADD CONSTRAINT chk_inbox_conversations_mode CHECK (mode IN ('bot', 'human'));
ALTER TABLE inbox_conversations ADD CONSTRAINT chk_inbox_conversations_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE inbox_messages ADD CONSTRAINT chk_inbox_messages_direction CHECK (direction IN ('inbound', 'outbound'));
ALTER TABLE inbox_messages ADD CONSTRAINT chk_inbox_messages_type CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'template', 'interactive', 'internal_note'));
ALTER TABLE inbox_messages ADD CONSTRAINT chk_inbox_messages_delivery_status CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed'));
ALTER TABLE inbox_messages ADD CONSTRAINT chk_inbox_messages_sentiment CHECK (ai_sentiment IS NULL OR ai_sentiment IN ('positive', 'neutral', 'negative', 'frustrated'));
ALTER TABLE ai_knowledge_files ADD CONSTRAINT chk_ai_knowledge_files_indexing_status CHECK (indexing_status IN ('pending', 'processing', 'completed', 'failed', 'local_only'));

-- =============================================================================
-- PARTE 11: RLS POLICIES
-- =============================================================================

-- AI Agents
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_agents_select_authenticated" ON ai_agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_agents_insert_authenticated" ON ai_agents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_agents_update_authenticated" ON ai_agents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ai_agents_delete_authenticated" ON ai_agents FOR DELETE TO authenticated USING (true);

-- Inbox Conversations
ALTER TABLE inbox_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_conversations_select_authenticated" ON inbox_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "inbox_conversations_insert_authenticated" ON inbox_conversations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inbox_conversations_update_authenticated" ON inbox_conversations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inbox_conversations_delete_authenticated" ON inbox_conversations FOR DELETE TO authenticated USING (true);

-- Inbox Messages
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_messages_select_authenticated" ON inbox_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "inbox_messages_insert_authenticated" ON inbox_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inbox_messages_update_authenticated" ON inbox_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inbox_messages_delete_authenticated" ON inbox_messages FOR DELETE TO authenticated USING (true);

-- AI Agent Logs
ALTER TABLE ai_agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_agent_logs_select_authenticated" ON ai_agent_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_agent_logs_insert_authenticated" ON ai_agent_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_agent_logs_update_authenticated" ON ai_agent_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ai_agent_logs_delete_authenticated" ON ai_agent_logs FOR DELETE TO authenticated USING (true);

-- Inbox Labels
ALTER TABLE inbox_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_labels_select_authenticated" ON inbox_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "inbox_labels_insert_authenticated" ON inbox_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inbox_labels_update_authenticated" ON inbox_labels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inbox_labels_delete_authenticated" ON inbox_labels FOR DELETE TO authenticated USING (true);

-- Inbox Conversation Labels
ALTER TABLE inbox_conversation_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_conversation_labels_select_authenticated" ON inbox_conversation_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "inbox_conversation_labels_insert_authenticated" ON inbox_conversation_labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inbox_conversation_labels_delete_authenticated" ON inbox_conversation_labels FOR DELETE TO authenticated USING (true);

-- Inbox Quick Replies
ALTER TABLE inbox_quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_quick_replies_select_authenticated" ON inbox_quick_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "inbox_quick_replies_insert_authenticated" ON inbox_quick_replies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inbox_quick_replies_update_authenticated" ON inbox_quick_replies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inbox_quick_replies_delete_authenticated" ON inbox_quick_replies FOR DELETE TO authenticated USING (true);

-- AI Knowledge Files
ALTER TABLE ai_knowledge_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_knowledge_files_select_authenticated" ON ai_knowledge_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_knowledge_files_insert_authenticated" ON ai_knowledge_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_knowledge_files_update_authenticated" ON ai_knowledge_files FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ai_knowledge_files_delete_authenticated" ON ai_knowledge_files FOR DELETE TO authenticated USING (true);

-- RLS ai_embeddings
ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_embeddings_select_authenticated" ON ai_embeddings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_embeddings_insert_authenticated" ON ai_embeddings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_embeddings_update_authenticated" ON ai_embeddings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ai_embeddings_delete_authenticated" ON ai_embeddings FOR DELETE TO authenticated USING (true);

-- Campaign Folders
ALTER TABLE campaign_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_folders_select" ON campaign_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaign_folders_insert" ON campaign_folders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "campaign_folders_update" ON campaign_folders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "campaign_folders_delete" ON campaign_folders FOR DELETE TO authenticated USING (true);

-- Campaign Tags
ALTER TABLE campaign_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_tags_select" ON campaign_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaign_tags_insert" ON campaign_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "campaign_tags_update" ON campaign_tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "campaign_tags_delete" ON campaign_tags FOR DELETE TO authenticated USING (true);

-- Campaign Tag Assignments
ALTER TABLE campaign_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_tag_assignments_select" ON campaign_tag_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaign_tag_assignments_insert" ON campaign_tag_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "campaign_tag_assignments_delete" ON campaign_tag_assignments FOR DELETE TO authenticated USING (true);

-- =============================================================================
-- PARTE 12: REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE inbox_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_messages;

-- =============================================================================
-- PARTE 13: STORAGE BUCKET
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('wa-template-media', 'wa-template-media', true, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "wa_template_media_public_read" ON storage.objects;
CREATE POLICY "wa_template_media_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'wa-template-media');

DROP POLICY IF EXISTS "wa_template_media_service_upload" ON storage.objects;
CREATE POLICY "wa_template_media_service_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'wa-template-media');

DROP POLICY IF EXISTS "wa_template_media_service_delete" ON storage.objects;
CREATE POLICY "wa_template_media_service_delete" ON storage.objects FOR DELETE USING (bucket_id = 'wa-template-media');

-- =============================================================================
-- PARTE 14: FUNÇÕES RAG (pgvector)
-- =============================================================================

CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding VECTOR(768),
  agent_id_filter UUID,
  expected_dimensions INTEGER,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.content,
    (1 - (e.embedding <=> query_embedding))::FLOAT AS similarity,
    e.metadata
  FROM ai_embeddings e
  WHERE e.agent_id = agent_id_filter
    AND e.dimensions = expected_dimensions
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_embeddings IS 'Busca embeddings similares usando distância de cosseno. Retorna apenas vetores com dimensões compatíveis.';

-- =============================================================================
-- FIM DO SCHEMA
-- =============================================================================
