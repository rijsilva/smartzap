import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, ChevronRight, Send } from 'lucide-react';
import { TestContactPanel } from './TestContactPanel';
import { AutoSuppressionPanel } from './AutoSuppressionPanel';
import { WorkflowExecutionPanel } from './WorkflowExecutionPanel';
import { MetaAppPanel } from './MetaAppPanel';
import { StatusCard } from './StatusCard';
import { TurboConfigSection } from './TurboConfigSection';
import { WebhookConfigSection } from './WebhookConfigSection';
import { CalendarBookingPanel } from './CalendarBookingPanel';
import { FlowEndpointPanel } from './FlowEndpointPanel';
import { CredentialsForm } from './CredentialsForm';
import { NgrokDevPanel } from './NgrokDevPanel';
import { DevModePanel } from './DevModePanel';
import { InboxRetentionPanel } from './InboxRetentionPanel';
import { useDevMode } from '@/components/providers/DevModeProvider';
import type { SettingsViewProps } from './types';

// Re-export types for consumers
export type { SettingsViewProps } from './types';

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  setSettings,
  isLoading,
  isSaving,
  onSave,
  // onSaveSettings - reserved for future use
  onDisconnect,
  accountLimits,
  // tierName - reserved for future use
  limitsError,
  limitsErrorMessage,
  limitsLoading,
  onRefreshLimits,
  webhookUrl,
  webhookToken,
  webhookStats,
  webhookSubscription,
  webhookSubscriptionLoading,
  webhookSubscriptionMutating,
  onRefreshWebhookSubscription,
  onSubscribeWebhookMessages,
  onUnsubscribeWebhookMessages,
  phoneNumbers,
  phoneNumbersLoading,
  onRefreshPhoneNumbers,
  onSetWebhookOverride,
  onRemoveWebhookOverride,
  availableDomains,
  webhookPath,
  hideHeader,

  onTestConnection,
  isTestingConnection,

  // Meta App
  metaApp,
  metaAppLoading,
  refreshMetaApp,
  // Test Contact Props - Supabase
  testContact,
  saveTestContact,
  removeTestContact,
  isSavingTestContact,

  // Turbo
  whatsappThrottle,
  whatsappThrottleLoading,
  saveWhatsAppThrottle,
  isSavingWhatsAppThrottle,

  // Auto-supressão
  autoSuppression,
  autoSuppressionLoading,
  saveAutoSuppression,
  isSavingAutoSuppression,

  // Calendar Booking
  calendarBooking,
  calendarBookingLoading,
  saveCalendarBooking,
  isSavingCalendarBooking,

  // Workflow Execution (global)
  workflowExecution,
  workflowExecutionLoading,
  saveWorkflowExecution,
  isSavingWorkflowExecution,

}) => {
  // Dev mode hook
  const { isDevMode } = useDevMode();

  // Always start collapsed
  const [isEditing, setIsEditing] = useState(false);
  const [devPublicBaseUrl, setDevPublicBaseUrl] = useState<string | null>(null);

  // Refs para UX: o formulário de credenciais fica bem abaixo do card.
  // Sem scroll automático, parece que o botão "Editar" não funcionou.
  const statusCardRef = useRef<HTMLDivElement | null>(null);
  const credentialsFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Quando o usuário ativa o modo edição, rolar até o formulário.
    if (!isEditing) return;

    // Aguarda o render do bloco condicional.
    const t = window.setTimeout(() => {
      credentialsFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    return () => window.clearTimeout(t);
  }, [isEditing]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    let isActive = true;

    const loadNgrok = async () => {
      try {
        const res = await fetch('/api/debug/ngrok?autostart=1', { method: 'GET' });
        if (!res.ok) return;
        const data = (await res.json()) as { publicUrl?: string | null };
        if (!isActive) return;
        const url = data?.publicUrl ? String(data.publicUrl) : null;
        setDevPublicBaseUrl(url);
      } catch {
        if (isActive) setDevPublicBaseUrl(null);
      }
    };

    loadNgrok();
    const interval = window.setInterval(loadNgrok, 4000);
    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, []);

  const devWebhookUrl = devPublicBaseUrl
    ? `${devPublicBaseUrl}${webhookPath || '/api/webhook'}`
    : null;

  if (isLoading) return <div className="text-[var(--ds-text-primary)]">Carregando configurações...</div>;

  return (
    <div>
      {!hideHeader && (
        <>
          <h1 className="text-3xl font-bold text-[var(--ds-text-primary)] tracking-tight mb-2">Configurações</h1>
          <p className="text-[var(--ds-text-secondary)] mb-10">Gerencie sua conexão com a WhatsApp Business API</p>
        </>
      )}

      <div className="space-y-8">
        {/* Status Card */}
        <StatusCard
          ref={statusCardRef}
          settings={settings}
          limitsLoading={limitsLoading}
          limitsError={limitsError}
          limitsErrorMessage={limitsErrorMessage}
          accountLimits={accountLimits}
          onRefreshLimits={onRefreshLimits}
          onDisconnect={onDisconnect}
          isEditing={isEditing}
          onToggleEdit={() => setIsEditing((v) => !v)}
        />

        {/* Meta App (opcional) — debug_token e diagnóstico avançado */}
        {isDevMode && settings.isConnected && (
          <MetaAppPanel
            metaApp={metaApp}
            metaAppLoading={metaAppLoading}
            refreshMetaApp={refreshMetaApp}
          />
        )}

        {/* Credentials Form - Only visible if disconnected OR editing */}
        {(!settings.isConnected || isEditing) && (
          <CredentialsForm
            ref={credentialsFormRef}
            settings={settings}
            setSettings={setSettings}
            onSave={onSave}
            onClose={() => setIsEditing(false)}
            isSaving={isSaving}
            onTestConnection={onTestConnection}
            isTestingConnection={isTestingConnection}
            metaApp={metaApp}
            refreshMetaApp={refreshMetaApp}
          />
        )}

        {/* Workflow Builder Default moved to /workflows */}

        {/* Calendar Booking Section */}
        {settings.isConnected && (
          <CalendarBookingPanel
            isConnected={settings.isConnected}
            calendarBooking={calendarBooking}
            calendarBookingLoading={calendarBookingLoading}
            saveCalendarBooking={saveCalendarBooking}
            isSavingCalendarBooking={isSavingCalendarBooking}
          />
        )}

        {/* Flow Endpoint (MiniApp Dinamico) - Dev only */}
        {isDevMode && settings.isConnected && <FlowEndpointPanel devBaseUrl={devPublicBaseUrl} />}

        {/* Test Contact Section - Dev only */}
        {isDevMode && settings.isConnected && (
          <TestContactPanel
            testContact={testContact}
            saveTestContact={saveTestContact}
            removeTestContact={removeTestContact}
            isSaving={isSavingTestContact}
          />
        )}

        {/* WhatsApp Turbo (Adaptive Throttle) */}
        {settings.isConnected && saveWhatsAppThrottle && (
          <TurboConfigSection
            whatsappThrottle={whatsappThrottle}
            whatsappThrottleLoading={whatsappThrottleLoading}
            saveWhatsAppThrottle={saveWhatsAppThrottle}
            isSaving={isSavingWhatsAppThrottle}
            settings={settings}
          />
        )}

        {/* Proteção de Qualidade (Auto-supressão) */}
        {settings.isConnected && saveAutoSuppression && (
          <AutoSuppressionPanel
            autoSuppression={autoSuppression}
            autoSuppressionLoading={autoSuppressionLoading}
            saveAutoSuppression={saveAutoSuppression}
            isSaving={isSavingAutoSuppression}
          />
        )}

        {/* Execução do workflow (global) */}
        {settings.isConnected && saveWorkflowExecution && (
          <WorkflowExecutionPanel
            workflowExecution={workflowExecution}
            workflowExecutionLoading={workflowExecutionLoading}
            saveWorkflowExecution={saveWorkflowExecution}
            isSaving={isSavingWorkflowExecution}
          />
        )}

        {/* Webhook Local (dev only) */}
        {isDevMode && <NgrokDevPanel />}

        {/* Developer Mode Toggle - sempre visível */}
        <DevModePanel />

        {/* T070: AI Agents Section - Link to AI Agents Configuration */}
        {settings.isConnected && (
          <div className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)]">
                  <Bot className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--ds-text-primary)]">Agentes de IA</h3>
                  <p className="text-sm text-[var(--ds-text-secondary)]">
                    Configure agentes de IA para responder automaticamente às conversas
                  </p>
                </div>
              </div>
              <Link
                href="/settings/ai/agents"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] transition-colors"
              >
                <span className="text-sm font-medium">Configurar</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Telegram Mini App Section */}
        {settings.isConnected && (
          <div className="rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)]">
                  <Send className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--ds-text-primary)]">Telegram Mini App</h3>
                  <p className="text-sm text-[var(--ds-text-secondary)]">
                    Configure o bot do Telegram para acessar o monitor via celular
                  </p>
                </div>
              </div>
              <Link
                href="/settings/telegram"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] transition-colors"
              >
                <span className="text-sm font-medium">Configurar</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* T071: Inbox Retention Configuration */}
        {settings.isConnected && <InboxRetentionPanel />}

        {/* Webhook Configuration Section */}
        {settings.isConnected && (webhookUrl || devWebhookUrl) && (
          <WebhookConfigSection
            webhookUrl={devWebhookUrl || webhookUrl}
            webhookToken={webhookToken}
            webhookStats={webhookStats}
            webhookPath={webhookPath}
            webhookSubscription={webhookSubscription}
            webhookSubscriptionLoading={webhookSubscriptionLoading}
            webhookSubscriptionMutating={webhookSubscriptionMutating}
            onRefreshWebhookSubscription={onRefreshWebhookSubscription}
            onSubscribeWebhookMessages={onSubscribeWebhookMessages}
            onUnsubscribeWebhookMessages={onUnsubscribeWebhookMessages}
            phoneNumbers={phoneNumbers}
            phoneNumbersLoading={phoneNumbersLoading}
            onRefreshPhoneNumbers={onRefreshPhoneNumbers}
            onSetWebhookOverride={onSetWebhookOverride}
            onRemoveWebhookOverride={onRemoveWebhookOverride}
            availableDomains={availableDomains}
          />
        )}
      </div>
    </div>
  );
};
