import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    /*
     * Aplica auth a todo EXCEPTO:
     * - login
     * - api
     * - static files
     */
    "/((?!login|api|_next|favicon.ico).*)",
  ],
};
