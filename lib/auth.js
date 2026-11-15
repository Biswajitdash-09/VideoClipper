import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Needs AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in the environment.
// Sessions are signed cookies (no database adapter); the user row is created on first use.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/dashboard" },
  callbacks: {
    session({ session, token }) {
      session.user.id = token.sub;
      return session;
    },
  },
});
