import GoogleProvider from 'next-auth/providers/google'
import type { NextAuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'

const isProduction = process.env.NODE_ENV === 'production'

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken as string,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw data
    console.log('[Auth] Token refreshed successfully')
    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      refreshToken: data.refresh_token ?? token.refreshToken,
    }
  } catch (e) {
    console.error('[Auth] Token refresh failed:', e)
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/drive.file',
          ].join(' '),
          access_type: 'offline',
          prompt: 'select_account consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        const scope = account.scope ?? ''
        const hasDriveScope = scope.includes('drive')
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          hasDriveScope,
        }
      }
      const expiresAt = (token.expiresAt as number) ?? 0
      if (Date.now() / 1000 < expiresAt - 60) {
        return token
      }
      console.log('[Auth] Access token expired, refreshing...')
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      ;(session as any).hasDriveScope = token.hasDriveScope ?? true
      if (token.error) {
        (session as any).error = token.error
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  // 本機開發用寬鬆 cookie，production 才用 secure
  ...(isProduction ? {
    cookies: {
      pkceCodeVerifier: {
        name: 'next-auth.pkce.code_verifier',
        options: { httpOnly: true, sameSite: 'none', path: '/', secure: true },
      },
      state: {
        name: 'next-auth.state',
        options: { httpOnly: true, sameSite: 'none', path: '/', secure: true, maxAge: 900 },
      },
    },
    useSecureCookies: true,
  } : {
    cookies: {
      pkceCodeVerifier: {
        name: 'next-auth.pkce.code_verifier',
        options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false },
      },
      state: {
        name: 'next-auth.state',
        options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 900 },
      },
    },
    useSecureCookies: false,
  }),
  debug: false,
}
