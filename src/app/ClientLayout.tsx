"use client";

import {
  useEffect,
  useState
} from "react";

import {
  Menu
} from "lucide-react";

import Sidebar from "@/components/layout/Sidebar";
import UserMenu from "@/components/layout/UserMenu";

export default function ClientLayout({
  children
}: {
  children: React.ReactNode;
}) {

  /* ───────────────────────────── */
  /* SIDEBAR */
  /* ───────────────────────────── */

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  /* ───────────────────────────── */
  /* CLOCK */
  /* ───────────────────────────── */

  const [time, setTime] =
    useState("");

  useEffect(() => {

    const updateClock = () => {

      setTime(

        new Date().toLocaleTimeString(
          "es-CO",
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }
        )

      );

    };

    updateClock();

    const interval =
      setInterval(updateClock, 1000);

    return () =>
      clearInterval(interval);

  }, []);

  return (

    <div className="min-h-screen bg-[#020817] text-white overflow-hidden">

      {/* SIDEBAR */}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* OVERLAY */}

      {sidebarOpen && (

        <div
          onClick={() => setSidebarOpen(false)}
          className="
            fixed
            inset-0
            bg-black/50
            backdrop-blur-sm
            z-40
          "
        />

      )}

      {/* CONTENT */}

      <div
        className={`
          transition-all
          duration-300
          min-h-screen

          ${sidebarOpen
            ? "lg:ml-[280px]"
            : "ml-0"
          }
        `}
      >

        {/* TOPBAR */}

        <header
          className="
            h-16
            border-b
            border-white/10
            px-5
            flex
            items-center
            justify-between
            sticky
            top-0
            z-30
            bg-[#020817]/90
            backdrop-blur-xl
          "
        >

          {/* LEFT */}

          <div className="flex items-center gap-4">

            {/* MENU BUTTON */}

            <button
              onClick={() =>

                setSidebarOpen(
                  !sidebarOpen
                )

              }
              className="
                w-11
                h-11
                rounded-xl
                border
                border-white/10
                bg-white/5
                flex
                items-center
                justify-center
                hover:bg-white/10
                transition-all
              "
            >

              <Menu size={20} />

            </button>

            {/* TITLE */}

            <div>

              <h1 className="font-semibold text-lg">
                MC Inventory
              </h1>

              <p className="text-xs text-gray-400">
                Multi Cloud Inventory
              </p>

            </div>

          </div>

          {/* RIGHT */}

          <div className="flex items-center gap-5">

            {/* CLOCK */}

            <div className="text-right">

              <p className="text-xs text-gray-400">
                Última actualización
              </p>

              <p className="text-sm font-semibold">
                {time}
              </p>

            </div>

            {/* USER MENU */}

            <UserMenu />

          </div>

        </header>

        {/* PAGE */}

        <main className="p-6">

          {children}

        </main>

      </div>

    </div>

  );

}