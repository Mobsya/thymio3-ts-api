import { useState } from "react";
import StdoutConsole from "./stdout-console";
import "./stdout-panel.css";

function getStdOutText(entries) {
  return entries.map((entry) => String(entry.value ?? "")).join("");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "-1000px";
  document.body.appendChild(textArea);
  textArea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

export default function StdoutPanel({ entries, onClear }) {
  const [copyStatus, setCopyStatus] = useState("idle");
  const hasEntries = entries.length > 0;

  async function copyStdOutToClipboard() {
    if (!hasEntries) return;

    try {
      await copyTextToClipboard(getStdOutText(entries));
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1200);
    } catch (err) {
      console.warn("Failed to copy STD OUT", err);
      alert("Unable to copy STD OUT to the clipboard");
    }
  }

  function clearStdOut() {
    onClear();
    setCopyStatus("idle");
  }

  return (
    <section className="dashboard-panel telemetry-panel stdout-panel">
      <div className="panel-header">
        <h3>STD OUT</h3>
        <div className="actions">
          <div className="stdout-actions" aria-label="STD OUT actions">
            <button
              type="button"
              title="Copy all STD OUT"
              aria-label="Copy all STD OUT to clipboard"
              onClick={copyStdOutToClipboard}
              disabled={!hasEntries}
            >
              {copyStatus === "copied" ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="secondary"
              title="Clear STD OUT"
              aria-label="Clear STD OUT console"
              onClick={clearStdOut}
              disabled={!hasEntries}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
      <div className="panel-body">
        <div className="panel-scroll stdout-panel-scroll">
          <StdoutConsole entries={entries} />
        </div>
      </div>
    </section>
  );
}
