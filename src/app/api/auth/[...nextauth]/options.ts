import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/db';

export const authOptions: NextAuthOptions = {
  providers: [
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
    async jwt({ token, user }) {
      // Email/password sign-in: user object is returned from authorize()
      if (user) {
        token.userId = user.id;
        return token;
      }
      // Existing session missing userId (e.g. legacy token from before we
      // started stamping userId on the JWT in authorize())
      if (token.email && !token.userId) {
        token.userId = await getOrCreateUser(
          token.email,
          token.name || undefined,
          token.picture || undefined
        );
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
