
import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout, safeJson, isAbortError } from '@/lib/server-http'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null)
        if (!body) {
            return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
        }

        const { token, projectId, teamId } = body as any

        if (!token || !projectId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const queryFn = new URLSearchParams()
        if (teamId) queryFn.append('teamId', teamId)

        // Fetch envs from Vercel
        // We need decrypt=true to get the actual values of sensitive vars
        const res = await fetchWithTimeout(
            `https://api.vercel.com/v9/projects/${projectId}/env?${queryFn.toString()}&decrypt=true`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                timeoutMs: 12000,
            }
        )

        if (!res.ok) {
            const error = await safeJson<any>(res)
            console.error('Vercel API error:', error)
            return NextResponse.json({ error: 'Failed to fetch env vars' }, { status: res.status })
        }

        const data = await safeJson<any>(res)

        // Vercel returns { envs: [...] }
        return NextResponse.json({ envs: data?.envs || [] })
    } catch (error: any) {
        console.error('Get env error:', error)
        return NextResponse.json({ error: error.message }, { status: isAbortError(error) ? 504 : 502 })
    }
}
