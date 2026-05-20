"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Boxes,
  BarChart3,
  Terminal,
  DollarSign,
  Cloud,
  X
} from "lucide-react";

const menuItems = [
  {
    label: "Inventario",
    href: "/",
    icon: Boxes
  },
  {
    label: "Monitoreo",
    href: "/monitoreo",
    icon: BarChart3
  },
  {
    label: "Comandos",
    href: "/comandos",
    icon: Terminal
  },
  {
    label: "Billing",
    href: "/billing",
    icon: DollarSign
  }
];

export default function Sidebar({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {

  const pathname =
    usePathname();

  return (

    <aside
      className={`
        fixed
        top-0
        left-0
        h-screen
        w-[280px]
        bg-[#071120]
        border-r
        border-white/10
        z-50
        transition-all
        duration-300
        flex
        flex-col

        ${
          open

            ? "translate-x-0"

            : "-translate-x-full"
        }
      `}
    >

      {/* HEADER */}

      <div
        className="
          h-16
          border-b
          border-white/10
          flex
          items-center
          justify-between
          px-5
        "
      >

        <div className="flex items-center gap-3">

          <div
            className="
              w-10
              h-10
              rounded-2xl
              bg-cyan-500/20
              flex
              items-center
              justify-center
            "
          >

            <Cloud className="text-cyan-400" />

          </div>

          <div>

            <p className="font-bold text-white">
              MC Inventory
            </p>

            <p className="text-xs text-gray-400">
              Multi Cloud Inventory
            </p>

          </div>

        </div>

        <button
          onClick={onClose}
        >

          <X size={18} />

        </button>

      </div>

      {/* MENU */}

      <div className="flex-1 p-4 space-y-2">

        {menuItems.map((item) => {

          const Icon = item.icon;

          const active =
            pathname === item.href;

          return (

            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`
                flex
                items-center
                gap-3
                px-4
                py-3
                rounded-2xl
                transition-all

                ${
                  active

                    ? "bg-cyan-500 text-black font-semibold"

                    : "text-gray-300 hover:bg-white/10"
                }
              `}
            >

              <Icon size={18} />

              <span>
                {item.label}
              </span>

            </Link>

          );

        })}

      </div>

      {/* FOOTER */}

      <div
        className="
          border-t
          border-white/10
          p-4
          text-xs
          text-gray-500
        "
      >

        MC Inventory v6.0

      </div>

    </aside>

  );

}