-- Fix: Adicionar tabelas faltantes à publicação supabase_realtime
-- e habilitar REPLICA IDENTITY FULL em campaign_contacts para permitir
-- filtros por campaign_id no Supabase Realtime.
--
-- Contexto: Os canais Realtime (centralized-realtime-v1, campaign-progress,
-- account-alerts-realtime) falhavam silenciosamente porque:
-- 1. contacts, templates, flows e account_alerts não estavam na publicação
-- 2. campaign_contacts tinha REPLICA IDENTITY DEFAULT (só PK), impedindo
--    filtros por campaign_id

-- Adicionar tabelas à publicação (idempotente com IF NOT EXISTS via DO block)
DO $$
BEGIN
  -- contacts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
  END IF;

  -- templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'templates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE templates;
  END IF;

  -- flows
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'flows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE flows;
  END IF;

  -- account_alerts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'account_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE account_alerts;
  END IF;
END;
$$;

-- Habilitar REPLICA IDENTITY FULL em campaign_contacts
-- Permite que o Supabase Realtime filtre por qualquer coluna (ex: campaign_id)
-- Trade-off: aumenta levemente o volume de WAL, mas campaign_contacts tem
-- volume controlado (ligado ao tamanho das campanhas)
ALTER TABLE campaign_contacts REPLICA IDENTITY FULL;
