import React from "react";
import { api } from "@/lib/api";
import { startWavRecording, blobToBase64 } from "@/lib/wavRecorder";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plug, Terminal, Copy, Check, Mic, Square, Volume2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const SECTION_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground";

const PROVIDER_LABELS = {
  text_only: "Text only (no speech, always works)",
  openai: "OpenAI (Whisper + TTS)",
  gemini: "Gemini (AI Studio API key)",
  vertex: "Vertex AI (Google Cloud, service account)",
  local: "Local (self-hosted STT/TTS containers)",
};

const LLM_PROVIDER_LABELS = {
  heuristic: "Heuristic template (no LLM, always works)",
  openai: "OpenAI (LLM-worded answer)",
  gemini: "Gemini (via Vertex service account, LLM-worded answer)",
};

function CopyButton({ text, label = "Copy", tone = "default" }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.error("Copy failed");
    }
  };
  const toneCls =
    tone === "terminal"
      ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
      : "text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${toneCls}`}
    >
      {copied ? <Check className={`h-3.5 w-3.5 ${tone === "terminal" ? "text-slate-100" : "text-ok"}`} /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

const CURL_EXAMPLE = `curl -X POST $BASE/api/simulate \\
  -H "Content-Type: application/json" \\
  -d '{"shipment_id": "shp-0042"}'`;

function VoiceQueryPanel({ providers, llmProviders }) {
  const [provider, setProvider] = React.useState("");
  const [llmProvider, setLlmProvider] = React.useState("");
  const [shipmentId, setShipmentId] = React.useState("MSKU1234567");
  const [recording, setRecording] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [audioSrc, setAudioSrc] = React.useState(null);
  const [textQuestion, setTextQuestion] = React.useState("Why is this flagged?");
  const isTextOnly = provider === "text_only";
  const recorderRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const audioKeyRef = React.useRef(0);

  React.useEffect(() => {
    if (!provider && providers?.length) setProvider(providers[0]);
  }, [providers, provider]);

  React.useEffect(() => {
    if (!llmProvider && llmProviders?.length) setLlmProvider(llmProviders[0]);
  }, [llmProviders, llmProvider]);

  // Runs after the <audio> element is actually mounted with the new src
  // (unlike setting .src imperatively right after setResult, which races
  // the re-render and silently no-ops on the very first response, since
  // the element doesn't exist in the DOM yet).
  React.useEffect(() => {
    if (audioSrc && audioRef.current) {
      audioRef.current.play().catch(() => {
        toast.message("Answer ready - press play to hear it (autoplay blocked).");
      });
    }
  }, [audioSrc]);

  const startRecording = async () => {
    try {
      recorderRef.current = await startWavRecording();
      setRecording(true);
      setResult(null);
    } catch (err) {
      toast.error(
        "Microphone access failed: " + (err?.message || "permission denied")
      );
    }
  };

  const stopRecording = async () => {
    if (!recorderRef.current) return;
    setRecording(false);
    setBusy(true);
    try {
      const wavBlob = recorderRef.current.stop();
      recorderRef.current = null;
      const audioBase64 = await blobToBase64(wavBlob);
      const res = await api.voiceQuery(
        shipmentId,
        audioBase64,
        provider || undefined,
        llmProvider || undefined
      );
      setResult(res);
      if (res.response_audio_base64) {
        audioKeyRef.current += 1;
        setAudioSrc(`data:audio/wav;base64,${res.response_audio_base64}`);
      } else {
        setAudioSrc(null);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message || "Voice query failed");
    } finally {
      setBusy(false);
    }
  };

  const sendTextQuery = async () => {
    setBusy(true);
    setResult(null);
    setAudioSrc(null);
    try {
      // text_only's contract: audio_base64 carries the question as raw UTF-8
      // text, base64-encoded — there's no speech infra in this mode, so a
      // real recording would just be garbage-decoded as text (see the
      // permission notes below).
      const audioBase64 = btoa(unescape(encodeURIComponent(textQuestion)));
      const res = await api.voiceQuery(
        shipmentId,
        audioBase64,
        provider || undefined,
        llmProvider || undefined
      );
      setResult(res);
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message || "Voice query failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5 font-mono text-xs text-muted-foreground">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-ok/70" />
        </span>
        <span className="ml-1">POST /api/voice-query — dev console</span>
      </div>

      <div className="p-5">
        <div className="mb-2 flex items-center gap-2 font-display font-medium">
          <Mic className="h-4 w-4 text-primary" /> Try the Voice API
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Records real microphone audio in your browser, sends it to{" "}
          <code className="rounded bg-muted px-1 font-mono">POST /api/voice-query</code>, and plays
          back the spoken answer. Two independent choices below: which speech engine
          transcribes/speaks, and which engine words the answer itself. The backend loads
          each provider's credentials from its own environment, so this never sends any
          keys from your browser.
        </p>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Voice provider (speech-to-text / text-to-speech)
            </label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {(providers || []).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABELS[p] || p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Answer engine (how the answer is worded)
            </label>
            <Select value={llmProvider} onValueChange={setLlmProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select an answer engine" />
              </SelectTrigger>
              <SelectContent>
                {(llmProviders || []).map((p) => (
                  <SelectItem key={p} value={p}>
                    {LLM_PROVIDER_LABELS[p] || p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Shipment ID
            </label>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
              placeholder="e.g. MSKU1234567"
            />
          </div>
        </div>

        {isTextOnly ? (
          <div className="mb-4 flex items-center gap-3">
            <input
              className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={textQuestion}
              onChange={(e) => setTextQuestion(e.target.value)}
              placeholder="Type a question…"
            />
            <Button onClick={sendTextQuery} disabled={busy} type="button">
              Ask
            </Button>
            {busy && <span className="text-xs text-muted-foreground">Answering…</span>}
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-3">
            {!recording ? (
              <Button onClick={startRecording} disabled={busy} type="button">
                <Mic className="mr-2 h-4 w-4" /> Record question
              </Button>
            ) : (
              <Button onClick={stopRecording} variant="destructive" type="button">
                <Square className="mr-2 h-4 w-4" /> Stop &amp; send
              </Button>
            )}
            {busy && <span className="text-xs text-muted-foreground">Transcribing &amp; answering…</span>}
          </div>
        )}

        <details className="group mb-4 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground [&_summary]:list-none">
          <summary className="flex cursor-pointer items-center justify-between gap-2 p-3 font-medium text-foreground">
            Mic &amp; speaker permissions
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-normal group-open:rotate-180" />
          </summary>
          <ul className="list-disc space-y-1 px-3 pb-3 pl-7">
            <li>
              Clicking "Record question" triggers your browser's microphone permission
              prompt (only once per site). It requires a secure context — this works on
              <code className="mx-1 rounded bg-muted px-1 font-mono">localhost</code>
              automatically, but a real deployment needs HTTPS or the mic will be blocked.
            </li>
            <li>
              The spoken answer plays through your device's default speaker/output via an
              <code className="mx-1 rounded bg-muted px-1 font-mono">&lt;audio&gt;</code> element. Playback
              with sound is allowed here because it's triggered by your own click (Stop &amp;
              send) — browsers block unprompted autoplay with sound otherwise.
            </li>
            <li>
              "Text only" needs no permissions at all — it swaps the mic for a plain text
              box above, since that mode has no speech infra and always returns a text
              answer with no audio. Useful to sanity-check the graph/shipment lookup alone.
            </li>
            <li>
              The answer engine needs no extra permissions — it only changes how
              <code className="mx-1 rounded bg-muted px-1 font-mono">response_text</code> is worded.
              "Heuristic" is a fixed template read straight from the graph. "OpenAI" and
              "Gemini" ask that LLM to phrase an answer from the same graph facts (never
              invented) — Gemini reuses the same Vertex service account as the speech
              provider, not a separate API key. If the credential isn't configured, it
              automatically falls back to the heuristic template rather than failing.
            </li>
          </ul>
        </details>

        {result && (
          <div className="space-y-2 rounded-lg border border-border bg-muted p-3 text-sm">
            <div>
              <span className="font-medium text-foreground">Transcript: </span>
              <span className="font-mono text-xs text-muted-foreground">{result.transcript || "(empty — text_only or STT failed)"}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">Answer: </span>
              <span className="text-muted-foreground">{result.response_text}</span>
            </div>
            {audioSrc ? (
              <div className="flex items-center gap-2 pt-1">
                <Volume2 className="h-4 w-4 text-primary" />
                <audio
                  key={audioKeyRef.current}
                  ref={audioRef}
                  controls
                  autoPlay
                  src={audioSrc}
                  className="h-8"
                />
              </div>
            ) : (
              <div className="pt-1 text-xs text-muted-foreground">
                No audio in this response (text_only provider, or synthesis failed).
              </div>
            )}
          </div>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground">
          Note: the graph only has a real risk answer for shipments that have had an outcome
          recorded at least once (via Record Outcome on the dashboard) — try{" "}
          <code className="rounded bg-muted px-1 font-mono">MSKU1234567</code>, or record an outcome for
          another shipment first.
        </p>
      </div>
    </Card>
  );
}

export default function Integrations() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => { api.integrations().then(setData); }, []);

  return (
    <div className="space-y-6">
      <header className="cg-rise">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ClearanceGuard is a pluggable engine — connect any software over REST or MCP. The logistics
          vertical you see here is the proof, not the whole product.
        </p>
      </header>

      <Card className="p-5">
        <div className={SECTION_LABEL}>Architecture</div>
        <p className="mt-1 max-w-2xl text-sm text-foreground">
          Every capability is exposed two ways over one locked contract — a{" "}
          <span className="font-medium">REST API</span> for HTTP clients and an{" "}
          <span className="font-medium">MCP server</span> for agents. Same engine, same guarantees,
          two front doors.
        </p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-md bg-accent px-2 py-1 font-mono text-xs text-accent-foreground">REST</span>
          <span className="rounded-md bg-accent px-2 py-1 font-mono text-xs text-accent-foreground">MCP</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 font-display font-medium">
            <Terminal className="h-4 w-4 text-primary" /> REST API
          </div>
          <div className="space-y-2">
            {data?.rest_endpoints?.map((e) => (
              <div key={e.path} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-mono text-xs">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{e.method}</span>{" "}
                    <span className="text-foreground">{e.path}</span>
                  </div>
                  <CopyButton text={`${e.method} ${e.path}`} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{e.desc}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 font-display font-medium">
            <Plug className="h-4 w-4 text-primary" /> MCP Server tools
          </div>
          <div className="space-y-2">
            {data?.mcp_tools?.map((t) => (
              <div key={t.name} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-mono text-xs text-foreground">{t.name}()</div>
                  <CopyButton text={`${t.name}()`} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">{data?.note}</p>
        </Card>
      </div>

      <VoiceQueryPanel
        providers={data?.voice_providers || ["text_only"]}
        llmProviders={data?.llm_answer_providers || ["heuristic"]}
      />

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <span className="flex items-center gap-2 font-mono text-xs text-slate-400">
            <span className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            </span>
            example: check a shipment's risk
          </span>
          <CopyButton text={CURL_EXAMPLE} tone="terminal" />
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-100">
{CURL_EXAMPLE}
        </pre>
      </div>
    </div>
  );
}
