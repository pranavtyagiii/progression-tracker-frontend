import { useState, useRef, useEffect } from "react";
import { ChevronRight, Mic, MicOff, Sparkles } from "lucide-react";
import { api } from "../api";
import { inputCls } from "../ui";

function useSpeechRecognition() {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [supported] = useState(() => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  // Running inside an iframe (e.g. a Claude.ai artifact preview) is the single most likely
  // reason mic access silently fails -- the host page's iframe sandbox controls this, not
  // this code, and there's nothing in here that can override it. Surface it proactively.
  const [inIframe] = useState(() => { try { return window.self !== window.top; } catch (e) { return true; } });
  const recRef = useRef(null);
  const onResultRef = useRef(null);

  async function start(onResult) {
    setError("");
    if (!supported) { setError("This browser doesn't support live speech recognition (works best in Chrome)."); return; }
    onResultRef.current = onResult;

    // Ask for the microphone directly first -- this gives a specific, catchable reason
    // (blocked, no device, embedded/sandboxed context) instead of SpeechRecognition's
    // vaguer failure, and it's exactly what silently fails inside a sandboxed iframe.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // just checking access, not recording via this stream
    } catch (e) {
      if (inIframe) {
        setError("Microphone access was blocked. This is running inside an embedded preview (e.g. a Claude artifact), and the browser blocks microphone access there by default -- there's nothing in this file that can override that. Try opening this as a standalone app outside the artifact preview.");
      } else if (e.name === "NotAllowedError") {
        setError("Microphone permission was denied. Check your browser's site settings and allow microphone access, then try again.");
      } else if (e.name === "NotFoundError") {
        setError("No microphone was found on this device.");
      } else {
        setError("Couldn't access the microphone (" + (e.name || e.message || "unknown error") + ").");
      }
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-IN";
    rec.onresult = (e) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) chunk += e.results[i][0].transcript + " ";
      }
      if (chunk && onResultRef.current) onResultRef.current(chunk);
    };
    rec.onerror = (e) => {
      const map = {
        "not-allowed": "Microphone permission was denied or blocked in this context.",
        "service-not-allowed": "Speech recognition isn't allowed in this context (common inside an embedded preview).",
        "no-speech": "No speech detected -- still listening, go ahead and talk.",
        "audio-capture": "No microphone could be captured.",
        network: "A network error interrupted speech recognition.",
      };
      const msg = map[e.error] || ("Speech recognition stopped (" + e.error + ").");
      if (e.error !== "no-speech") { setError(msg); setListening(false); }
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (e) {
      setError("Couldn't start speech recognition (" + (e.message || "unknown error") + ").");
      setListening(false);
    }
  }
  function stop() {
    if (recRef.current) recRef.current.stop();
    setListening(false);
  }
  useEffect(() => () => { if (recRef.current) recRef.current.stop(); }, []);

  return { listening, supported, start, stop, error, inIframe };
}

async function draftWithClaude(transcript, mode, studentName) {
  // The actual prompt construction now lives server-side, next to the real
  // API key -- this just calls the backend's proxy endpoint.
  return api.draftWithAI(transcript, mode, studentName);
}

function SessionAssistPanel({ mode, studentName, onApply }) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftError, setDraftError] = useState("");
  const { listening, supported, start, stop, error: micError, inIframe } = useSpeechRecognition();

  function toggleListen() {
    if (listening) stop();
    else start((chunk) => setTranscript((t) => (t ? t + " " : "") + chunk));
  }

  async function handleDraft() {
    if (!transcript.trim()) { setDraftError("Nothing to draft from yet -- record or type something first."); return; }
    setDraftError(""); setDrafting(true); setDraft(null);
    try {
      const result = await draftWithClaude(transcript, mode, studentName);
      setDraft(result);
    } catch (e) {
      setDraftError("Couldn't get a draft (" + (e.message || "unknown error") + "). You can still write this by hand below.");
    }
    setDrafting(false);
  }

  function apply() {
    if (draft) onApply(draft);
    setDraft(null);
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-1.5 text-sm font-medium text-indigo-900">
          <Sparkles size={14} /> Session Assist -- transcribe &amp; draft with AI
        </span>
        <ChevronRight size={14} className={`text-indigo-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-indigo-700">
            This uses your browser's own microphone + speech recognition -- not a meeting bot, it only hears what the mic picks up.
            {!supported && " Live transcription isn't supported in this browser (works best in Chrome) -- just type or paste notes below instead."}
          </p>
          {supported && inIframe && !listening && !micError && (
            <p className="text-xs text-amber-600">
              ⚠ This appears to be running inside an embedded preview (like a Claude artifact). Browsers block microphone
              access in that context by default -- if "Start listening" doesn't work, that's almost certainly why, and it
              isn't something this file can override. Typing or pasting notes below still works fine with "Draft with AI".
            </p>
          )}

          {supported && (
            <button
              type="button" onClick={toggleListen}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                listening ? "bg-red-600 text-white" : "border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
              }`}
            >
              {listening ? <><MicOff size={13} /> Stop listening</> : <><Mic size={13} /> Start listening</>}
            </button>
          )}
          {micError && <p className="text-xs text-red-600">{micError}</p>}

          <textarea
            className={inputCls + " font-mono text-xs"} rows={5}
            value={transcript} onChange={(e) => setTranscript(e.target.value)}
            placeholder="Transcript appears here as you talk -- or just type/paste rough notes."
          />

          <button
            type="button" onClick={handleDraft} disabled={drafting}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Sparkles size={13} /> {drafting ? "Drafting…" : "Draft with AI"}
          </button>

          {draftError && <p className="text-xs text-red-600">{draftError}</p>}

          {draft && (
            <div className="space-y-2 rounded-lg border border-indigo-200 bg-white p-3">
              <div className="text-xs font-semibold text-indigo-900">Draft -- review before applying:</div>
              {Object.entries(draft).map(([k, v]) => (
                <div key={k} className="text-xs">
                  <span className="font-medium text-slate-500">{k}:</span> <span className="text-slate-700">{v || "(empty)"}</span>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={apply} className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700">
                  Insert into form
                </button>
                <button type="button" onClick={() => setDraft(null)} className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600">
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



export default SessionAssistPanel;
