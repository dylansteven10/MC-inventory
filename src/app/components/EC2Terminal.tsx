"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

type Props = {
  instanceId: string;
  accountId: string;
};

export default function EC2Terminal({ instanceId, accountId }: Props) {

  const terminalRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const [currentCommand, setCurrentCommand] = useState("");

  useEffect(() => {

    if (!terminalRef.current) return;

    term.current = new Terminal({
      cursorBlink: true,
      theme: {
        background: "#000000"
      }
    });

    term.current.open(terminalRef.current);

    term.current.write("MC Inventory Terminal\r\n");
    term.current.write(`Instance: ${instanceId}\r\n\r\n`);
    term.current.write("$ ");

    term.current.onData(handleInput);

  }, []);

  const handleInput = (data: string) => {

    if (!term.current) return;

    if (data === "\r") {
      executeCommand(currentCommand);
      setCurrentCommand("");
      term.current.write("\r\n");
      return;
    }

    if (data === "\u007F") {
      setCurrentCommand((prev) => prev.slice(0, -1));
      term.current.write("\b \b");
      return;
    }

    setCurrentCommand((prev) => prev + data);
    term.current.write(data);

  };

  const executeCommand = async (cmd: string) => {

    if (!term.current) return;

    const trimmed = cmd.trim();

    if (!trimmed) {
      term.current.write("$ ");
      return;
    }

    term.current.write("\r\nRunning...\r\n");

    try {

      const res = await fetch("/api/ec2/run-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ instanceId, accountId }],
          command: trimmed
        })
      });

      // ── Comando bloqueado por seguridad ──
      if (res.status === 403) {
        term.current.write("\x1b[33m⚠ El comando que está intentando ejecutar no está permitido.\x1b[0m\r\n");
        term.current.write("$ ");
        return;
      }

      // ── Error del servidor ──
      if (!res.ok) {
        term.current.write(`\x1b[31m✗ Error del servidor (${res.status})\x1b[0m\r\n`);
        term.current.write("$ ");
        return;
      }

      const result = await res.json();
      const first = result[0];

      if (!first) {
        term.current.write("\x1b[31m✗ Sin respuesta del servidor\x1b[0m\r\n");
        term.current.write("$ ");
        return;
      }

      if (first.output) {
        term.current.write(first.output.replace(/\n/g, "\r\n") + "\r\n");
      } else if (first.error) {
        term.current.write(`\x1b[31m✗ ${first.error}\x1b[0m\r\n`);
      } else {
        term.current.write("(sin salida)\r\n");
      }

    } catch {
      term.current.write("\x1b[31m✗ No se pudo conectar con el servidor\x1b[0m\r\n");
    }

    term.current.write("$ ");

  };

  return (
    <div className="bg-black p-4 rounded-xl">
      <div ref={terminalRef} style={{ height: "400px" }} />
    </div>
  );

}