import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { checkPassword, credentialsSchema } from "./accounts.js";
import { getDb } from "./db.js";
import { hit } from "./rate-limit.js";

const LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

// Needs AUTH_SECRET in the environment.
// Sessions are signed cookies (no database adapter); accounts live in the users collection.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      async authorize(input) {
        const parsed = credentialsSchema.safeParse(input);
        if (!parsed.success) {
          return null;
        }

        // Slows password guessing against one account, wherever the attempts come from.
        const db = await getDb();
        const { allowed } = await hit(db, `login:${parsed.data.email}`, {
          limit: LOGIN_ATTEMPTS,
          windowSeconds: LOGIN_WINDOW_SECONDS,
        });
        if (!allowed) {
          return null;
        }

        return checkPassword(db, parsed.data);
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/dashboard" },
  callbacks: {
    session({ session, token }) {
      session.user.id = token.sub;
      return session;
    },
  },
});
