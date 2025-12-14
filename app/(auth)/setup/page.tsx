'use client'

/**
 * Setup Page - Redirects to the appropriate setup step
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function SetupPage() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        // Se o setup já está concluído, não faz sentido empurrar o usuário pro wizard.
        // Isso acontece bastante após limpar cookies/localStorage.
        const res = await fetch('/api/auth/status', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (cancelled) return

        if (res.ok && data?.isConfigured && data?.isSetup) {
          router.push('/login')
          return
        }
      } catch {
        // Ignora e segue o fluxo local abaixo
      }

      // Check if we have Vercel token in storage
      const hasToken = localStorage.getItem('setup_token')

      if (hasToken) {
        // Continue with wizard
        router.push('/setup/wizard')
      } else {
        // Must enter token to potentially fix/finish setup
        router.push('/setup/start')
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
    </div>
  )
}
