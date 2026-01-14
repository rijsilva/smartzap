'use client';

import React from 'react';
import { Users, ShieldAlert } from 'lucide-react';
import { getPricingBreakdown } from '@/lib/whatsapp-pricing';
import { CheckCircleFilled } from '@/components/ui/icons/CheckCircleFilled';
import { AudienceCardAllProps } from './types';

export function AudienceCardAll({
  eligibleContactsCount,
  currentLimit,
  isSelected,
  onSelect,
  selectedTemplate,
  exchangeRate,
}: AudienceCardAllProps) {
  const isOverLimit = eligibleContactsCount > currentLimit;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative p-6 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-4 h-full min-h-47.5 ${
        isOverLimit
          ? 'bg-zinc-900/50 border-red-500/30 text-gray-400 opacity-60'
          : isSelected
            ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.10)] ring-2 ring-white/70'
            : 'bg-zinc-900/50 border-white/10 hover:bg-zinc-900 hover:border-white/20 text-gray-300'
      }`}
    >
      {isSelected && !isOverLimit && (
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
            : isSelected
              ? 'bg-gray-200 text-black'
              : 'bg-zinc-800 text-gray-400'
        }`}
      >
        <Users size={24} />
      </div>
      <div className="text-center">
        <h3 className="font-bold text-sm">Todos</h3>
        <p
          className={`text-xs mt-1 ${
            isOverLimit ? 'text-red-400' : isSelected ? 'text-gray-600' : 'text-gray-500'
          }`}
        >
          {eligibleContactsCount} contatos • exclui opt-out e supressões
        </p>
        {isOverLimit ? (
          <p className="text-xs mt-2 font-bold text-red-400">
            Excede limite ({currentLimit})
          </p>
        ) : isSelected && selectedTemplate ? (
          <p className="text-xs mt-2 font-bold text-primary-600">
            {
              getPricingBreakdown(
                selectedTemplate.category,
                eligibleContactsCount,
                0,
                exchangeRate ?? 5.0
              ).totalBRLFormatted
            }
          </p>
        ) : null}
      </div>
    </button>
  );
}
