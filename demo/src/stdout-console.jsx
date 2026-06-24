import "./stdout-console.css";

function getOutputLines(entries) {
  return entries.flatMap((entry) =>
    String(entry.value)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line, lineIndex) => ({
        id: `${entry.id}-${lineIndex}`,
        value: line,
      }))
  );
}

export default function StdoutConsole({ entries }) {
  if (entries.length === 0) {
    return <div className="stdout-console stdout-console-empty">Waiting for the std out data...</div>;
  }

  const lines = getOutputLines(entries);

  return (
    <div className="stdout-console" aria-live="polite">
      {lines.map((line, index) => (
        <div className="stdout-console-line" key={line.id}>
          <span className="stdout-console-line-number">{index + 1}</span>
          <pre className="stdout-console-entry">{line.value || " "}</pre>
        </div>
      ))}
    </div>
  );
}
