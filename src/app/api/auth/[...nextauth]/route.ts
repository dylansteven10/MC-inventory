import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

// Definición de roles disponibles
export type UserRole = "admin" | "infraestructura" | "telecomunicaciones" | "basedatos" | "seguridad";

// Extender el tipo de sesión
declare module "next-auth" {
  interface User {
    role?: UserRole;
  }
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: UserRole;
      lastLogin?: string;
    }
  }
}

// Función para asignar rol basado en email (maneja null)
function getUserRole(email: string | null | undefined, name?: string | null): UserRole {
  if (!email) return "infraestructura";
  
  const emailLower = email.toLowerCase();
  
  // 🔥 ADMIN: emails específicos (puedes agregar más)
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
  if (adminEmails.includes(emailLower)) {
    return "admin";
  }
  
  // 🔥 Asignar por palabras clave en el email
  if (emailLower.includes("admin") || emailLower.includes("administrator")) {
    return "admin";
  }
  
  if (emailLower.includes("infra") || emailLower.includes("devops") || emailLower.includes("sysops")) {
    return "infraestructura";
  }
  
  if (emailLower.includes("teleco") || emailLower.includes("red") || emailLower.includes("network")) {
    return "telecomunicaciones";
  }
  
  if (emailLower.includes("dba") || emailLower.includes("database") || emailLower.includes("db")) {
    return "basedatos";
  }
  
  if (emailLower.includes("security") || emailLower.includes("seguridad") || emailLower.includes("sec")) {
    return "seguridad";
  }
  
  // Rol por defecto para usuarios del dominio ux.local
  if (emailLower.endsWith("@ux.local")) {
    return "infraestructura";
  }
  
  return "infraestructura";
}

const authOptions: NextAuthOptions = {
  providers: [
    // 🔵 Azure AD (Office 365)
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
            email: "admin@ux.local",
            role: "admin" as UserRole,
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

  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Cuando el usuario inicia sesión por primera vez
      if (user) {
        token.role = user.role || getUserRole(user.email, user.name);
        token.lastLogin = new Date().toISOString();
      }
      
      // Para Azure AD, asignar rol basado en email
      if (account?.provider === "azure-ad") {
        const email = (profile as any)?.email || token.email;
        token.role = getUserRole(email as string | null | undefined);
        token.email = email;
      }
      
      return token;
    },
    
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as UserRole;
        session.user.lastLogin = token.lastLogin as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };