import React, { forwardRef, useEffect, useState } from 'react';
import { HelpCircle, Save, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppSettings } from '../../../types';
import type { MetaAppInfo } from './types';
import { settingsService } from '@/services/settingsService';
import { Container } from '@/components/ui/container';
import { SectionHeader } from '@/components/ui/section-header';

interface CredentialsFormProps {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  onTestConnection?: () => void;
  isTestingConnection?: boolean;
  metaApp?: MetaAppInfo | null;
  refreshMetaApp?: () => void;
}

export const CredentialsForm = forwardRef<HTMLDivElement, CredentialsFormProps>(
  (
    {
      settings,
      setSettings,
      onSave,
      onClose,
      isSaving,
      onTestConnection,
      isTestingConnection,
      metaApp,
      refreshMetaApp,
    },
    ref
  ) => {
    // Meta App ID (rapido) - usado para uploads do Template Builder (header_handle)
    const [metaAppIdQuick, setMetaAppIdQuick] = useState('');

    useEffect(() => {
      setMetaAppIdQuick(metaApp?.appId || '');
    }, [metaApp?.appId]);

    const handleSave = async () => {
      try {
        await onSave();
        onClose();

        // Best-effort: salva Meta App ID junto, sem bloquear o salvamento do WhatsApp.
        const nextAppId = metaAppIdQuick.trim();
        const currentAppId = String(metaApp?.appId || '').trim();
        if (nextAppId && nextAppId !== currentAppId) {
          settingsService
            .saveMetaAppConfig({ appId: nextAppId, appSecret: '' })
            .then(() => {
              refreshMetaApp?.();
            })
            .catch((e) => {
              // Nao bloqueia o fluxo principal.
              toast.warning(e instanceof Error ? e.message : 'Falha ao salvar Meta App ID');
            });
        }
      } catch {
        // Erro já tratado no hook, não fecha o formulário
      }
    };

    return (
      <div ref={ref} className="scroll-mt-24">
        <Container
          variant="glass"
          padding="lg"
          className="animate-in slide-in-from-top-4 duration-300"
        >
          <SectionHeader
          title="Configuracao da API"
          color="brand"
          showIndicator={true}
        />

        <div className="mt-6 space-y-6">
          {/* Phone Number ID */}
          <div>
            <label className="block text-sm font-medium text-[var(--ds-text-primary)] mb-2">
              Identificação do número de telefone (Phone Number ID) <span className="text-primary-500">*</span>
            </label>
            <div className="relative group">
              <input
                type="text"
                value={settings.phoneNumberId}
                onChange={(e) => setSettings({ ...settings, phoneNumberId: e.target.value })}
                placeholder="ex: 298347293847"
                className="w-full px-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none font-mono text-sm text-[var(--ds-text-primary)] transition-all group-hover:border-[var(--ds-border-strong)]"
              />
              <div
                className="absolute right-4 top-3.5 text-[var(--ds-text-muted)] cursor-help hover:text-[var(--ds-text-primary)] transition-colors"
                title="Encontrado no Meta Business Manager"
              >
                <HelpCircle size={16} />
              </div>
            </div>
          </div>

          {/* Business Account ID */}
          <div>
            <label className="block text-sm font-medium text-[var(--ds-text-primary)] mb-2">
              Identificação da conta do WhatsApp Business (WABA ID) <span className="text-primary-500">*</span>
            </label>
            <div className="relative group">
              <input
                type="text"
                value={settings.businessAccountId}
                onChange={(e) => setSettings({ ...settings, businessAccountId: e.target.value })}
                placeholder="ex: 987234987234"
                className="w-full px-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none font-mono text-sm text-[var(--ds-text-primary)] transition-all group-hover:border-[var(--ds-border-strong)]"
              />
              <div
                className="absolute right-4 top-3.5 text-[var(--ds-text-muted)] cursor-help hover:text-[var(--ds-text-primary)] transition-colors"
                title="Encontrado no Meta Business Manager"
              >
                <HelpCircle size={16} />
              </div>
            </div>
          </div>

          {/* Access Token */}
          <div>
            <label className="block text-sm font-medium text-[var(--ds-text-primary)] mb-2">
              Token de acesso <span className="text-primary-500">*</span>
            </label>
            <div className="relative group">
              <input
                type="password"
                value={settings.accessToken}
                onChange={(e) => setSettings({ ...settings, accessToken: e.target.value })}
                placeholder="EAAG........"
                className="w-full px-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none font-mono text-sm text-[var(--ds-text-primary)] transition-all group-hover:border-[var(--ds-border-strong)] tracking-widest"
              />
            </div>
          </div>

          {/* Meta App ID (Optional) */}
          <div>
            <label className="block text-sm font-medium text-[var(--ds-text-primary)] mb-2">
              ID do Aplicativo (Meta App ID)
            </label>
            <div className="relative group">
              <input
                type="text"
                value={metaAppIdQuick}
                onChange={(e) => setMetaAppIdQuick(e.target.value)}
                placeholder="ex: 123456789012345"
                className="w-full px-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none font-mono text-sm text-[var(--ds-text-primary)] transition-all group-hover:border-[var(--ds-border-strong)]"
              />
              <div
                className="absolute right-4 top-3.5 text-[var(--ds-text-muted)] cursor-help hover:text-[var(--ds-text-primary)] transition-colors"
                title="Encontrado em developers.facebook.com > Seu App > Configurações > Básico"
              >
                <HelpCircle size={16} />
              </div>
            </div>
            <p className="text-xs text-[var(--ds-text-muted)] mt-2">
              Necessário para criar templates com imagem, vídeo ou documento no cabeçalho. Encontre em{' '}
              <span className="font-medium text-[var(--ds-text-secondary)]">developers.facebook.com › Meus apps › Seu App</span> (aparece no topo).
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-10 pt-8 border-t border-[var(--ds-border-subtle)] flex justify-end gap-4">
          <button
            className="h-10 px-6 rounded-xl border border-[var(--ds-border-default)] text-[var(--ds-text-primary)] font-medium hover:bg-[var(--ds-bg-hover)] active:scale-95 active:opacity-80 transition-all duration-150 flex items-center gap-2"
            onClick={() => onTestConnection?.()}
            disabled={!!isTestingConnection}
          >
            {isTestingConnection ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
            {isTestingConnection ? 'Testando...' : 'Testar Conexao'}
          </button>
          <button
            className="h-10 px-8 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-500 active:scale-95 active:opacity-90 dark:bg-white dark:text-black dark:hover:bg-neutral-100 dark:active:bg-neutral-200 transition-all duration-150 flex items-center gap-2 shadow-[var(--ds-shadow-lg)]"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save size={18} /> {isSaving ? 'Salvando...' : 'Salvar Config'}
          </button>
        </div>
      </Container>
      </div>
    );
  }
);

CredentialsForm.displayName = 'CredentialsForm';
