'use client';

import React from 'react';
import { Users, Smartphone, ShieldAlert, Sparkles } from 'lucide-react';
import { getPricingBreakdown } from '@/lib/whatsapp-pricing';
import { CheckCircleFilled } from '@/components/ui/icons/CheckCircleFilled';
import type { Template } from '@/types';

interface LegacyAudienceModeProps {
  recipientSource: 'all' | 'specific' | 'test' | null;
  setRecipientSource: (source: 'all' | 'specific' | 'test' | null) => void;
  totalContacts: number;
  recipientCount: number;
  currentLimit: number;
  selectedTemplate?: Template;
  exchangeRate?: number | null;
}

export function LegacyAudienceMode({
  recipientSource,
  setRecipientSource,
  totalContacts,
  recipientCount,
  currentLimit,
  selectedTemplate,
  exchangeRate,
}: LegacyAudienceModeProps) {
  const isOverLimit = totalContacts > currentLimit;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* All Contacts */}
      <button
        onClick={() => setRecipientSource('all')}
        className={`relative p-6 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-4 h-full min-h-47.5 ${
          isOverLimit
            ? 'bg-zinc-900/50 border-red-500/30 text-gray-400 opacity-60'
            : recipientSource === 'all'
              ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.10)] ring-2 ring-white/70'
              : 'bg-zinc-900/50 border-white/10 hover:bg-zink-900 hover:border-white/20 text-gray-300'
        }`}
      >
        {recipientSource === 'all' && !isOverLimit && (
          <div className="absolute top-3 right-3 text-black">
            <CheckCircleFilled size={20} />
          </div>
        )}
        {isOverLimit && (
          <div className="absolute top-3 right-3 text-red-400">
            <ShieldAlert size={18} />
          </div>
        )}
        <div
          className={`p-4 rounded-full ${
            isOverLimit
              ? 'bg-red-500/20 text-red-400'
              : recipientSource === 'all'
                ? 'bg-gray-200 text-black'
                : 'bg-zinc-800 text-gray-400'
          }`}
        >
          <Users size={24} />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-sm">Todos os Contatos</h3>
          <p
            className={`text-xs mt-1 ${
              isOverLimit
                ? 'text-red-400'
                : recipientSource === 'all'
                  ? 'text-gray-600'
                  : 'text-gray-500'
            }`}
          >
            {totalContacts} contatos
          </p>
          {isOverLimit ? (
            <p className="text-xs mt-2 font-bold text-red-400">
              Excede limite ({currentLimit})
            </p>
          ) : recipientSource === 'all' && selectedTemplate ? (
            <p className="text-xs mt-2 font-bold text-primary-600">
              {
                getPricingBreakdown(
                  selectedTemplate.category,
                  totalContacts,
                  0,
                  exchangeRate ?? 5.0
                ).totalBRLFormatted
              }
            </p>
          ) : null}
        </div>
      </button>

      {/* Select Specific */}
      <button
        onClick={() => setRecipientSource('specific')}
        className={`relative p-6 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-4 h-full min-h-47.5 ${
          recipientSource === 'specific'
            ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.10)] ring-2 ring-white/70'
            : isOverLimit && recipientSource === 'all'
              ? 'bg-primary-500/10 border-primary-500/50 text-primary-300 hover:bg-primary-500/20 ring-2 ring-primary-500/30'
              : 'bg-zinc-900/50 border-white/10 hover:bg-zinc-900 hover:border-white/20 text-gray-300'
        }`}
      >
        {recipientSource === 'specific' && (
          <div className="absolute top-3 right-3 text-black">
            <CheckCircleFilled size={20} />
          </div>
        )}
        {isOverLimit && recipientSource !== 'specific' && (
          <div className="absolute top-3 right-3 text-primary-400">
            <Sparkles size={18} />
          </div>
        )}
        <div
          className={`p-4 rounded-full ${
            recipientSource === 'specific'
              ? 'bg-gray-200 text-black'
              : isOverLimit
                ? 'bg-primary-500/20 text-primary-400'
                : 'bg-zinc-800 text-gray-400'
          }`}
        >
          <Smartphone size={24} />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-sm">Selecionar Específicos</h3>
          <p
            className={`text-xs mt-1 ${
              isOverLimit && recipientSource !== 'specific'
                ? 'text-primary-400 font-medium'
                : recipientSource === 'specific'
                  ? 'text-gray-600'
                  : 'text-gray-500'
            }`}
          >
            {recipientSource === 'specific'
              ? `${recipientCount} selecionados`
              : isOverLimit
                ? `Selecione até ${currentLimit}`
                : 'Escolher contatos'}
          </p>
          {recipientSource === 'specific' && selectedTemplate && recipientCount > 0 && (
            <p className="text-xs mt-2 font-bold text-primary-600">
              {
                getPricingBreakdown(
                  selectedTemplate.category,
                  recipientCount,
                  0,
                  exchangeRate ?? 5.0
                ).totalBRLFormatted
              }
            </p>
          )}
        </div>
      </button>
    </div>
  );
}
