import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

// Lazy-load pyodide once
async function loadPyodideOnce() {
  // pyodide package exports loadPyodide
  const { loadPyodide } = await import("pyodide");
  return await loadPyodide({
    // optional: choose a local path if you self-host pyodide assets
    indexURL: new URL("./assets/", window.location.href).toString()
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export default function PythonEditor({ value, onChange, height = 260 }) {
  const monacoRef = useRef(null);
  const editorRef = useRef(null);

  const [pyodide, setPyodide] = useState(null);
  const [pyodideReady, setPyodideReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await loadPyodideOnce();
        if (!cancelled) {
          setPyodide(p);
          setPyodideReady(true);
        }
      } catch {
        if (!cancelled) setPyodideReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const validate = useMemo(
    () =>
      debounce(async (code) => {
        const monaco = monacoRef.current;
        const editor = editorRef.current;
        const model = editor?.getModel?.();
        if (!monaco || !model) return;

        if (!pyodide) {
          monaco.editor.setModelMarkers(model, "python-syntax", []);
          return;
        }

        try {
          pyodide.globals.set("___code___", code);

          // ✅ Ask Python to parse and, on SyntaxError, return structured info
          const infoProxy = pyodide.runPython(`
import ast

def _syntax_check(src):
    try:
        ast.parse(src)
        return None
    except SyntaxError as e:
        # e.msg is usually the short message ("invalid syntax", etc.)
        # e.lineno / e.offset are 1-based
        return {
            "lineno": int(e.lineno or 1),
            "offset": int(e.offset or 1),
            "type": e.__class__.__name__,
            "msg": str(e.msg or "Syntax error"),
        }

_syntax_check(___code___)
        `);

          if (infoProxy === null || infoProxy === undefined) {
            // No syntax error
            monaco.editor.setModelMarkers(model, "python-syntax", []);
            return;
          }

          // Convert PyProxy dict -> JS object
          const info = infoProxy.toJs({ dict_converter: Object.fromEntries });
          infoProxy.destroy?.();

          const line = Math.max(1, Number(info.lineno || 1));
          const col = Math.max(1, Number(info.offset || 1));
          const message = `${info.type || "SyntaxError"}: ${info.msg || "Syntax error"}`;

          monaco.editor.setModelMarkers(model, "python-syntax", [
            {
              severity: monaco.MarkerSeverity.Error,
              message,                 // ✅ already “last line” style
              startLineNumber: line,
              startColumn: col,
              endLineNumber: line,
              endColumn: col + 1,
            },
          ]);
        } catch (err) {
          // If Pyodide itself failed (rare), clear markers or show generic error
          monaco.editor.setModelMarkers(model, "python-syntax", [
            {
              severity: monaco.MarkerSeverity.Error,
              message: "Python checker failed (Pyodide error).",
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 2,
            },
          ]);
        } finally {
          try {
            pyodide?.globals?.delete("___code___");
          } catch {}
        }
      }, 250),
    [pyodide]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Python syntax check: {pyodideReady ? "ready" : "loading…"}
      </div>

      <Editor
        height={height}
        defaultLanguage="python"
        value={value}
        onChange={(v) => {
          const next = v ?? "";
          onChange(next);
          validate(next);
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;

          // editor polish
          editor.updateOptions({
            minimap: { enabled: false },
            fontSize: 14,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: "on",
            automaticLayout: true,
          });

          // run initial validation
          validate(value ?? "");
        }}
        options={{
          scrollBeyondLastLine: false,
          renderLineHighlight: "all",
        }}
      />
    </div>
  );
}
