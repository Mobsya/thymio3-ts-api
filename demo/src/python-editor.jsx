import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import "./python-editor.css";

let pyodidePromise = null;

// Lazy-load pyodide once
async function loadPyodideOnce() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const { loadPyodide } = await import(
        /* @vite-ignore */ new URL("./assets/pyodide.mjs", window.location.href).toString()
      );
      return await loadPyodide({
        indexURL: new URL("./assets/", window.location.href).toString()
      });
    })().catch((error) => {
      pyodidePromise = null;
      throw error;
    });
  }

  return pyodidePromise;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function defineNervEditorTheme(monaco) {
  monaco.editor.defineTheme("nerv-ops", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "f4f1dd", background: "020707" },
      { token: "comment", foreground: "9ca58f", fontStyle: "italic" },
      { token: "keyword", foreground: "ffb227", fontStyle: "bold" },
      { token: "number", foreground: "a7ff39" },
      { token: "string", foreground: "35e6ff" },
      { token: "type", foreground: "9a5cff" },
    ],
    colors: {
      "editor.background": "#020707",
      "editor.foreground": "#f4f1dd",
      "editorLineNumber.foreground": "#6d765f",
      "editorLineNumber.activeForeground": "#ffb227",
      "editorCursor.foreground": "#a7ff39",
      "editor.selectionBackground": "#a7ff3933",
      "editor.lineHighlightBackground": "#ffb22712",
      "editorLineNumber.dimmedForeground": "#3e4738",
      "editorGutter.background": "#050808",
      "editorWhitespace.foreground": "#a7ff3926",
      "editorIndentGuide.background1": "#a7ff3924",
      "editorIndentGuide.activeBackground1": "#ffb22766",
    },
  });
}

export default function PythonEditor({ value, onChange, height }) {
  const monacoRef = useRef(null);
  const editorRef = useRef(null);
  const validateRef = useRef(() => {});

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

  useEffect(() => {
    validateRef.current = debounce(async (code) => {
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
        } catch {
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
          } catch {
            // Pyodide globals cleanup is best-effort.
          }
        }
      }, 250);
  }, [pyodide]);

  return (
    <div className="python-editor">
      <div className="python-editor-status">
        Python syntax check: {pyodideReady ? "ready" : "loading…"}
      </div>

      <Editor
        height={height ?? "100%"}
        defaultLanguage="python"
        theme="nerv-ops"
        value={value}
        beforeMount={defineNervEditorTheme}
        onChange={(v) => {
          const next = v ?? "";
          onChange(next);
          validateRef.current(next);
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
          validateRef.current(value ?? "");
        }}
        options={{
          scrollBeyondLastLine: false,
          renderLineHighlight: "all",
        }}
      />
    </div>
  );
}
