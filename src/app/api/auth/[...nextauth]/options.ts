import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrCreateUser, storeUserTokens } from '@/lib/db';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Mandatory calendar scope for 1:1 mirror; gmail.readonly feeds the briefing
          scope: [
            'openid', 'email', 'profile',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/gmail.readonly',
          ].join(' '),
          // prompt=consent forces Google to always return a refresh_token so
          // background sync keeps working after the access_token expires
          prompt: 'consent',
          access_type: 'offline',
          include_granted_scopes: 'true',
        },
      },
    }),

    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id, email, name, avatar_url, password_hash')
          .eq('email', credentials.email.toLowerCase())
          .single();

        if (!user || !user.password_hash) return null;

        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name || null,
          image: user.avatar_url || null,
        };
      },
    }),
  ],

  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Email/password sign-in: user object is returned from authorize()
      if (user && !account) {
        token.userId = user.id;
        return token;
      }

      if (account && token.email) {
        // Google sign-in: store tokens and set userId
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
      } else if (token.email && !token.userId) {
        // Existing session missing userId
        const userId = await getOrCreateUser(
          token.email,
          token.name || undefined,
          token.picture || undefined
        );
        token.userId = userId;
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
