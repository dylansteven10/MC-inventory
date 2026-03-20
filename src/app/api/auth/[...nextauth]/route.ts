import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";

const handler = NextAuth({
  providers: [
    // 🔵 Azure AD (ya lo tienes)
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),

    // 🔐 LOGIN LOCAL
    CredentialsProvider({
      name: "Local",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const user = process.env.LOCAL_ADMIN_USER;
        const pass = process.env.LOCAL_ADMIN_PASSWORD;

        if (
          credentials?.username === user &&
          credentials?.password === pass
        ) {
          return {
            id: "1",
            name: "Administrator",
            email: "admin@example.com",
          };
        }

        return null;
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/login",
  },
});

export { handler as GET, handler as POST };