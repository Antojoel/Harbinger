import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Sparkles, Send, Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

const QUICK_PROMPTS = [
  "Why is this flagged?",
  "What's the hold risk?",
  "What fixes it?",
];

const TTS_KEY = "cg_tts_on";

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="cg-typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

function Bubble({ role, text }) {
  if (role === "system") {
    return (
      <div className="my-1 text-center text-[11px] text-muted-foreground">· {text} ·</div>
    );
  }
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "cg-rise max-w-[85%] whitespace-pre-wrap px-3 py-2 text-sm shadow-sm",
          isUser
            ? "rounded-lg rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-lg rounded-tl-sm bg-muted text-foreground"
        )}
      >
        {text}
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const routeParams = useParams();
  const [shipments, setShipments] = useState([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState([]); // {role, text}
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [ttsOn, setTtsOn] = useState(() => {
    try { return localStorage.getItem(TTS_KEY) === "1"; } catch { return false; }
  });
  const scrollRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    api.shipments().then((s) => {
      setShipments(s || []);
      const routeMatch = s?.find((x) => x.id === routeParams.id);
      const atRisk = s?.find((x) => x.risk_band === "high" || x.risk_band === "medium");
      setSelected((prev) => prev || routeMatch?.id || atRisk?.id || s?.[0]?.id || "");
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // follow the route's shipment when it changes
  useEffect(() => {
    if (routeParams.id && shipments.some((s) => s.id === routeParams.id)) {
      setSelected((prev) => {
        if (prev === routeParams.id) return prev;
        setMessages((m) =>
          m.length ? [...m, { role: "system", text: `now asking about ${routeParams.id}` }] : m
        );
        return routeParams.id;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams.id, shipments.length]);

  useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const speak = useCallback((text) => {
    if (!ttsOn || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [ttsOn]);

  const send = useCallback(async (question) => {
    const q = (question ?? draft).trim();
    if (!q || thinking) return;
    if (!selected) {
      setMessages((m) => [...m, { role: "system", text: "pick a shipment above first" }]);
      return;
    }
    setMessages((m) => [...m, { role: "user", text: q }]);
    setDraft("");
    setThinking(true);
    try {
      const res = await api.voice(selected, q);
      setMessages((m) => [...m, { role: "assistant", text: res.answer }]);
      speak(res.answer);
    } catch {
      setMessages((m) => [...m, { role: "system", text: "couldn't reach the assistant — try again" }]);
    } finally {
      setThinking(false);
    }
  }, [draft, thinking, selected, speak]);

  const toggleTts = () => {
    setTtsOn((v) => {
      const next = !v;
      try { localStorage.setItem(TTS_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      if (!next && window.speechSynthesis) window.speechSynthesis.cancel();
      return next;
    });
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full flex-col" data-testid="assistant-panel">
      {/* header: context + tts toggle */}
      <div className="mb-2 flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-8 flex-1 text-xs" data-testid="assistant-shipment-select">
            <SelectValue placeholder="Select a shipment" />
          </SelectTrigger>
          <SelectContent>
            {shipments.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                <span className="font-mono">{s.ref}</span> · {s.hold_probability}% {s.risk_band}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground"
          aria-label={ttsOn ? "Turn off spoken answers" : "Read answers aloud"}
          aria-pressed={ttsOn}
          onClick={toggleTts}
        >
          {ttsOn ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4" />}
        </Button>
      </div>

      {/* transcript */}
      <ScrollArea ref={scrollRef} className="min-h-0 flex-1 rounded-lg border border-border bg-card/50">
        <div
          className="flex flex-col gap-2.5 p-3"
          role="log"
          aria-live="polite"
          aria-label="Assistant conversation"
        >
          {messages.length === 0 && !thinking && (
            <div className="my-6 px-2 text-center">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <p className="text-xs text-muted-foreground">
                Ask about any shipment's hold risk. Pick one above, then ask.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.text} />
          ))}
          {thinking && <TypingDots />}
        </div>
      </ScrollArea>

      {/* quick prompts */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => send(p)}
            disabled={thinking}
            className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground transition-colors duration-fast hover:bg-primary/10 disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      {/* composer */}
      <div className="mt-2 flex items-end gap-2 rounded-lg border border-border bg-card p-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        <label htmlFor="assistant-composer" className="sr-only">Message the assistant</label>
        <textarea
          id="assistant-composer"
          ref={taRef}
          data-testid="assistant-composer"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about this shipment…"
          className="max-h-24 min-h-[32px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none"
        />
        <Button
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => send()}
          disabled={thinking || !draft.trim()}
          aria-label="Send message"
          data-testid="assistant-send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
