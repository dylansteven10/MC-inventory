"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="login-page">
      
      {/* RING ANIMATION */}
      <div className="ring">
        <i style={{ ["--clr" as any]: "#6724e3" }}></i>
        <i style={{ ["--clr" as any]: "#e68b8a" }}></i>
        <i style={{ ["--clr" as any]: "#fff" }}></i>

        {/* LOGIN BOX */}
        <div className="login">
          <h2>MC Inventory</h2>

          {/* USERNAME */}
          <div className="inputBx">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {/* PASSWORD */}
          <div className="inputBx">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* SIGN IN */}
          <div className="inputBx">
            <input
              type="submit"
              value="Sign in"
              disabled={!username || !password}
              onClick={() =>
                signIn("credentials", {
                    username,
                    password,
                    callbackUrl: "/",
                })
                }
            />
          </div>

          {/* REAL LOGIN */}
          <div className="inputBx">
            <button
              onClick={() => signIn("azure-ad")}
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

      {/* STYLES */}
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Quicksand:wght@300&display=swap");

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

        .ring:hover i {
          border: 6px solid var(--clr);
          filter: drop-shadow(0 0 20px var(--clr));
        }

        @keyframes animate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes animate2 {
          0% {
            transform: rotate(360deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }

        .login {
          position: absolute;
          width: 320px;
          display: flex;
          justify-content: center;
          align-items: center;
          flex-direction: column;
          gap: 18px;
        }

        .login h2 {
          font-size: 2.2em;
          color: #fff;
          font-weight: bold;
          text-align: center;
        }

        .inputBx {
          width: 100%;
        }

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
        }

        .inputBx input::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }

        .inputBx input[type="submit"] {
          background: linear-gradient(45deg, #5e00a6, #e89f82);
          border: none;
          cursor: pointer;
          opacity: 0.9;
        }

        .inputBx input[type="submit"]:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        /* 🔥 OFFICE BUTTON */
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
          transition: 0.3s;
        }

        .office-btn:hover {
          transform: scale(1.05);
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