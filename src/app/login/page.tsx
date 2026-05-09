"use client";

import { signIn, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type AlertType = "error" | "warning" | "info";

interface AlertMessage {
  type: AlertType;
  title: string;
  body: string;
}

// ─────────────────────────────────────────────
// Auth error mapper
// ─────────────────────────────────────────────

function getAuthAlert(error: string | undefined | null, username: string): AlertMessage {
  if (!username.trim()) {
    return {
      type: "warning",
      title: "Campo requerido",
      body: "Por favor ingresa tu nombre de usuario antes de continuar.",
    };
  }

  switch (error) {
    case "CredentialsSignin":
      return {
        type: "error",
        title: "Credenciales incorrectas",
        body: "El usuario o la contraseña que ingresaste no son válidos. Verifica los datos e intenta de nuevo.",
      };
    case "SessionRequired":
      return {
        type: "warning",
        title: "Sesión requerida",
        body: "Debes iniciar sesión para acceder a esta sección.",
      };
    case "AccessDenied":
      return {
        type: "error",
        title: "Acceso denegado",
        body: "Tu cuenta no tiene permisos para acceder a MC Inventory. Contacta al administrador.",
      };
    case "OAuthAccountNotLinked":
      return {
        type: "warning",
        title: "Cuenta no vinculada",
        body: "Ya existe una cuenta con ese correo registrada con otro método. Inicia sesión con el método original.",
      };
    default:
      return {
        type: "error",
        title: "Error de autenticación",
        body: "No se pudo completar el inicio de sesión. Intenta de nuevo o contacta al administrador si el problema persiste.",
      };
  }
}

// ─────────────────────────────────────────────
// Alert component
// ─────────────────────────────────────────────

function Alert({ alert, onClose }: { alert: AlertMessage; onClose: () => void }) {
  const colors: Record<AlertType, { border: string; icon: string; bg: string }> = {
    error:   { border: "#e05555", icon: "#e05555", bg: "rgba(224,85,85,0.08)" },
    warning: { border: "#e0a155", icon: "#e0a155", bg: "rgba(224,161,85,0.08)" },
    info:    { border: "#5599e0", icon: "#5599e0", bg: "rgba(85,153,224,0.08)" },
  };

  const { border, icon, bg } = colors[alert.type];

  const icons: Record<AlertType, JSX.Element> = {
    error: (
      <svg width="20" height="20" fill="none" stroke={icon} strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    warning: (
      <svg width="20" height="20" fill="none" stroke={icon} strokeWidth="2" viewBox="0 0 24 24">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    info: (
      <svg width="20" height="20" fill="none" stroke={icon} strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
    ),
  };

  return (
    <div className="alert-box" style={{ borderColor: border, background: bg }}>
      <div className="alert-header">
        <span className="alert-icon">{icons[alert.type]}</span>
        <span className="alert-title" style={{ color: border }}>{alert.title}</span>
        <button className="alert-close" onClick={onClose} style={{ color: border }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <p className="alert-body">{alert.body}</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Login Page
// ─────────────────────────────────────────────

export default function LoginPage() {
  const [mounted,   setMounted]   = useState(false);
  const [username,  setUsername]  = useState("");
  const [password,  setPassword]  = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [alert,     setAlert]     = useState<AlertMessage | null>(null);

  const { status } = useSession();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (status === "authenticated" && mounted) router.push("/");
  }, [status, router, mounted]);

  // Auto-dismiss alert after 6 seconds
  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(null), 6000);
    return () => clearTimeout(t);
  }, [alert]);

  const handleSignIn = async () => {
    if (isLoading) return;

    if (!username.trim()) {
      setAlert(getAuthAlert(null, ""));
      return;
    }

    setIsLoading(true);
    setAlert(null);

    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (res?.ok) {
      router.push("/");
    } else {
      setAlert(getAuthAlert(res?.error, username));
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSignIn();
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="login-page">
      <div className="ring">
        <i style={{ ["--clr" as any]: "#6724e3" }}></i>
        <i style={{ ["--clr" as any]: "#e68b8a" }}></i>
        <i style={{ ["--clr" as any]: "#fff" }}></i>

        <div className="login">
          <h2>MC Inventory</h2>

          {/* Alert */}
          {alert && <Alert alert={alert} onClose={() => setAlert(null)} />}

          <div className="inputBx">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setAlert(null); }}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
          </div>

          <div className="inputBx">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setAlert(null); }}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
          </div>

          <div className="inputBx">
            <input
              type="submit"
              value={isLoading ? "Signing in..." : "Sign in"}
              disabled={isLoading}
              onClick={handleSignIn}
              className="signin-btn"
            />
          </div>

          <div className="inputBx">
            <button
              onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
              className="office-btn"
            >
              Sign in with Office365
            </button>
          </div>

          <div className="links">
            <span>UX TECHNOLOGY</span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Quicksand:wght@300;500;600&display=swap");

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: "Quicksand", sans-serif;
        }

        .login-page {
          position: fixed;
          inset: 0;
          background: #111;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
        }

        .ring {
          position: relative;
          width: 500px;
          height: 500px;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .ring i {
          position: absolute;
          inset: 0;
          border: 2px solid transparent;
          transition: 0.5s;
        }

        .ring:hover i {
          border: 6px solid var(--clr);
          filter: drop-shadow(0 0 20px var(--clr));
        }

        .ring i:nth-child(1) {
          border-radius: 38% 62% 63% 37% / 41% 44% 56% 59%;
          animation: animate 6s linear infinite;
        }

        .ring i:nth-child(2) {
          border-radius: 41% 44% 56% 59% / 38% 62% 63% 37%;
          animation: animate 4s linear infinite;
        }

        .ring i:nth-child(3) {
          border-radius: 41% 44% 56% 59% / 38% 62% 63% 37%;
          animation: animate2 10s linear infinite;
        }

        @keyframes animate {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes animate2 {
          0%   { transform: rotate(360deg); }
          100% { transform: rotate(0deg); }
        }

        .login {
          position: absolute;
          width: 320px;
          display: flex;
          justify-content: center;
          align-items: center;
          flex-direction: column;
          gap: 14px;
        }

        .login h2 {
          font-size: 2.2em;
          color: #fff;
          font-weight: bold;
          text-align: center;
          margin-bottom: 4px;
        }

        /* ── Alert ── */
        .alert-box {
          width: 100%;
          border: 1px solid;
          border-radius: 12px;
          padding: 12px 14px;
          animation: alertIn 0.25s ease;
        }

        @keyframes alertIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .alert-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 5px;
        }

        .alert-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }

        .alert-title {
          font-size: 0.88em;
          font-weight: 600;
          flex: 1;
          letter-spacing: 0.02em;
        }

        .alert-close {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          opacity: 0.7;
          transition: opacity 0.2s;
          flex-shrink: 0;
        }

        .alert-close:hover { opacity: 1; }

        .alert-body {
          font-size: 0.82em;
          color: rgba(255,255,255,0.75);
          line-height: 1.5;
          padding-left: 28px;
        }

        /* ── Inputs ── */
        .inputBx { width: 100%; }

        .inputBx input {
          width: 100%;
          padding: 12px 20px;
          background: transparent;
          border: 2px solid #fff;
          border-radius: 40px;
          font-size: 1em;
          color: #fff;
          outline: none;
          opacity: 0.5;
          transition: opacity 0.3s, box-shadow 0.3s;
        }

        .inputBx input:focus {
          opacity: 0.9;
          box-shadow: 0 0 12px rgba(103, 36, 227, 0.6);
        }

        .inputBx input::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }

        /* ── Sign in button ── */
        .inputBx input[type="submit"],
        .inputBx input.signin-btn {
          background: linear-gradient(45deg, #5e00a6, #e89f82);
          border: none;
          cursor: pointer;
          opacity: 0.85;
          transition: opacity 0.3s, transform 0.3s, box-shadow 0.3s;
        }

        .inputBx input[type="submit"]:hover:not(:disabled),
        .inputBx input.signin-btn:hover:not(:disabled) {
          opacity: 1;
          transform: scale(1.05);
          box-shadow: 0 0 15px rgba(94, 0, 166, 0.8);
        }

        .inputBx input[type="submit"]:disabled,
        .inputBx input.signin-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        /* ── Office 365 button ── */
        .office-btn {
          width: 100%;
          padding: 12px;
          border-radius: 40px;
          border: none;
          cursor: pointer;
          font-size: 1em;
          color: white;
          font-weight: bold;
          background: linear-gradient(45deg, #298393, #7300a8);
          transition: transform 0.3s, box-shadow 0.3s, opacity 0.3s;
          opacity: 0.85;
        }

        .office-btn:hover {
          transform: scale(1.05);
          opacity: 1;
          box-shadow: 0 0 15px rgba(0, 120, 212, 0.8);
        }

        .links {
          width: 100%;
          display: flex;
          justify-content: center;
          font-size: 0.9em;
          color: #aaa;
        }
      `}</style>
    </main>
  );
}
