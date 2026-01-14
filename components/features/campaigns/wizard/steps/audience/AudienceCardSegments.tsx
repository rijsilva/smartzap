'use client';

import React from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { getPricingBreakdown } from '@/lib/whatsapp-pricing';
import { CheckCircleFilled } from '@/components/ui/icons/CheckCircleFilled';
import { AudienceCardSegmentsProps } from './types';

export function AudienceCardSegments({
  isSelected,
  subtitle,
  recipientCount,
  onSelect,
  selectedTemplate,
  exchangeRate,
}: AudienceCardSegmentsProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative p-6 rounded-2xl border transition-all duration-200 flex flex-col items-center justify-center gap-4 h-full min-h-47.5 ${
        isSelected
          ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.10)] ring-2 ring-white/70'
          : 'bg-zinc-900/50 border-white/10 hover:bg-zinc-900 hover:border-white/20 text-gray-300'
      }`}
    >
      {isSelected && (
        <div className="absolute top-3 right-3 text-black">
          <CheckCircleFilled size={20} />
        </div>
      )}

      <div
        className={`p-4 rounded-full ${
          isSelected ? 'bg-gray-200 text-black' : 'bg-zinc-800 text-gray-400'
        }`}
      >
        <LinkIcon size={24} />
      </div>

      <div className="text-center">
        <h3 className="font-bold text-sm">Segmentos</h3>
        <p
          className={`text-xs mt-1 ${
            isSelected ? 'text-gray-600' : 'text-gray-500'
          }`}
        >
          {subtitle}
        </p>
        {isSelected && selectedTemplate ? (
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
        ) : null}
      </div>
    </button>
  );
}
