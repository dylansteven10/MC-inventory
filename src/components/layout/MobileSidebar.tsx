"use client";

import {
  Menu
} from "lucide-react";

export default function MobileSidebar({
  onOpen
}: {
  onOpen: () => void;
}) {

  return (

    <button
      onClick={onOpen}
      className="
        lg:hidden
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

  );

}