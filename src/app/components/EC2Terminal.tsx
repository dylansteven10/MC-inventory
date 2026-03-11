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

    term.current.write("\r\nRunning...\r\n");

    const res = await fetch("/api/ec2/run-command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        instances: [
          {
            instanceId,
            accountId
          }
        ],
        command: cmd
      })
    });

    const result = await res.json();

    const output = result[0]?.output || result[0]?.error || "No output";

    term.current.write(output + "\r\n");

    term.current.write("$ ");

  };

  return (

    <div className="bg-black p-4 rounded-xl">

      <div ref={terminalRef} style={{ height: "400px" }} />

    </div>

  );

}