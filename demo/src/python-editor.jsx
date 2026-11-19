import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { registerThymioPythonLanguage } from "./thymio-python-intellisense";
import "./python-editor.css";

loader.config({ paths: { vs: new URL('./assets/monaco/vs', window.location.href).href } });

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

export default function PythonEditor({ value, onChange, onReady, saveStatus }) {
  const editorRef = useRef(null);
  const [pyodide, setPyodide] = useState(null);
  const [checkerFailed, setCheckerFailed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPyodideOnce().then(runtime => {
      if (!cancelled) setPyodide(runtime);
    }).catch(() => {
      if (!cancelled) setCheckerFailed(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mounted || !pyodide) return;
    const { editor, monaco } = editorRef.current;
    const model = editor.getModel();
    const timer = setTimeout(() => {
        const code = model.getValue();
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
    return () => clearTimeout(timer);
  }, [pyodide, mounted, value]);

  return (
    <div className="python-editor">
      <div className="python-editor-region"><Editor
        height="100%"
        defaultLanguage="python"
        value={value}
        onChange={onChange}
        onMount={(editor, monaco) => {
          editorRef.current = { editor, monaco };
          registerThymioPythonLanguage(monaco);
          onReady(editor);
          setMounted(true);

          editor.updateOptions({
            minimap: { enabled: false },
            fontSize: 14,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: "on",
            automaticLayout: true,
            hover: { enabled: true },
            parameterHints: { enabled: true },
            quickSuggestions: { other: true, comments: false, strings: false },
            suggestOnTriggerCharacters: true,
            snippetSuggestions: "top",
          });
        }}
        options={{
          scrollBeyondLastLine: false,
          renderLineHighlight: "all",
        }}
      /></div>
      <footer className="python-editor-status"><span>{saveStatus}</span><span>Syntax check {checkerFailed ? 'unavailable' : pyodide ? 'ready' : 'loading…'}</span></footer>
    </div>
  );
}
