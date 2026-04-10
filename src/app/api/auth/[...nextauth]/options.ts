import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getOrCreateUser, storeUserTokens } from '@/lib/db';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid', 'email', 'profile',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/gmail.readonly',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && token.email) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;

        const userId = await getOrCreateUser(
          token.email,
          token.name || (profile as { name?: string })?.name || undefined,
          token.picture || undefined
        );
        token.userId = userId;

        if (account.access_token && account.refresh_token) {
          await storeUserTokens(token.email, account.access_token, account.refresh_token);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session as unknown as Record<string, unknown>).userId = token.userId;
      }
      return session;
    },
  },
  pages: { signIn: '/login', error: '/login' },
};
