'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TokenInput } from '../TokenInput';
import { ValidatingOverlay } from '../ValidatingOverlay';
import { SuccessCheckmark } from '../SuccessCheckmark';
import { VALIDATION } from '@/lib/installer/types';
import type { FormProps } from './types';

/**
 * Form de PAT Supabase - Tema Blade Runner.
 * "Configurar Memória Base" - banco de dados para implantes.
 */
export function SupabaseForm({ data, onComplete, onBack, showBack }: FormProps) {
  const [pat, setPat] = useState(data.supabasePat);
  const [validating, setValidating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  const isValidFormat = pat.trim().startsWith(VALIDATION.SUPABASE_PAT_PREFIX) &&
                        pat.trim().length >= VALIDATION.SUPABASE_PAT_MIN_LENGTH;

  const handleValidate = async () => {
    if (!isValidFormat) {
      setError(`Token deve começar com ${VALIDATION.SUPABASE_PAT_PREFIX}`);
      return;
    }

    setValidating(true);
    setError(null);

    // Tempo mínimo para apreciar a narrativa
    const MIN_VALIDATION_TIME = 2500;
    const startTime = Date.now();

    try {
      const res = await fetch('/api/installer/supabase/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: pat.trim() }),
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        throw new Error(result.error || 'Credenciais inválidas');
      }

      // Garantir tempo mínimo de exibição
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_VALIDATION_TIME) {
        await new Promise(r => setTimeout(r, MIN_VALIDATION_TIME - elapsed));
      }

      const firstOrg = result.organizations?.[0];
      setOrgName(firstOrg?.name || 'Setor conectado');
      setSuccess(true);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_VALIDATION_TIME) {
        await new Promise(r => setTimeout(r, MIN_VALIDATION_TIME - elapsed));
      }
      setError(err instanceof Error ? err.message : 'Falha na autenticação');
      setPat('');
    } finally {
      setValidating(false);
    }
  };

  const handleSuccessComplete = () => {
    onComplete({ supabasePat: pat.trim() });
  };

  const handleAutoSubmit = () => {
    if (isValidFormat) {
      handleValidate();
    }
  };

  if (success) {
    return (
      <SuccessCheckmark
        message={orgName ? `Setor "${orgName}" localizado` : 'Memória base conectada'}
        onComplete={handleSuccessComplete}
      />
    );
  }

  return (
    <div className="relative space-y-5">
      <ValidatingOverlay
        isVisible={validating}
        message="Escaneando permissões..."
        subMessage="Verificando acesso ao setor"
      />

      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--br-deep-navy)] border border-[var(--br-neon-cyan)]/30 flex items-center justify-center">
          <svg className="w-7 h-7 text-[var(--br-neon-cyan)]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.362 9.354H12V.396a.396.396 0 00-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 00.836 1.659H12v8.959a.396.396 0 00.716.233l9.081-12.261.401-.562a1.04 1.04 0 00-.836-1.66z" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-wide text-[var(--br-hologram-white)] uppercase">
          Configurar Memória Base
        </h2>
        <p className="mt-1 text-sm text-[var(--br-muted-cyan)] font-mono">
          Banco de dados para implantes
        </p>
      </div>

      {/* Token Input */}
      <TokenInput
        value={pat}
        onChange={(val) => {
          setPat(val);
          setError(null);
        }}
        placeholder="sbp_..."
        validating={validating}
        error={error || undefined}
        minLength={VALIDATION.SUPABASE_PAT_MIN_LENGTH}
        autoSubmitLength={VALIDATION.SUPABASE_PAT_MIN_LENGTH}
        onAutoSubmit={handleAutoSubmit}
        showCharCount={false}
        accentColor="cyan"
        autoFocus
      />

      {/* Collapsible help - esconde durante validação */}
      {!validating && (
      <details className="w-full group">
        <summary className="flex items-center justify-center gap-1.5 text-sm font-mono text-[var(--br-dust-gray)] hover:text-[var(--br-muted-cyan)] cursor-pointer list-none transition-colors">
          <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          como obter credenciais?
        </summary>
        <div className="mt-3 p-3 rounded-lg bg-[var(--br-void-black)]/50 border border-[var(--br-dust-gray)]/30 text-left space-y-2">
          <ol className="text-xs font-mono text-[var(--br-muted-cyan)] space-y-1.5 list-decimal list-inside">
            <li>
              Acesse{' '}
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--br-neon-cyan)] hover:underline"
              >
                supabase.com/dashboard/account/tokens
              </a>
            </li>
            <li>
              Clique em <strong className="text-[var(--br-hologram-white)]">Generate new token</strong>
            </li>
            <li>
              Nome: <strong className="text-[var(--br-hologram-white)]">smartzap</strong>
            </li>
            <li>Copie o token (começa com sbp_)</li>
          </ol>
          <p className="text-xs font-mono text-[var(--br-dust-gray)] mt-2 pt-2 border-t border-[var(--br-dust-gray)]/30">
            Uma nova unidade será criada automaticamente durante incubação.
          </p>
        </div>
      </details>
      )}
    </div>
  );
}
