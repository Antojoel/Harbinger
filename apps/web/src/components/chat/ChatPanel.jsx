import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Sparkles, Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { TypingDots } from "./TypingDots";
import { useSpeechRecognition, useTextToSpeech } from "./useSpeech";

const QUICK_PROMPTS = [
  "Why is this flagged?",
  "What's the hold risk?",
  "What fixes it?",
];

const BAND_DOT = {
  low: "bg-ok",
  medium: "bg-warn",
  high: "bg-danger",
};

const SCROLL_STICK_THRESHOLD_PX = 48;

function RiskDot({ band }) {
  return (
    <span
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", BAND_DOT[band] || "bg-muted-foreground")}
    />
  );
}

function pickDefaultShipment(list, routeId) {
  if (!list.length) return "";
  const onRoute = list.find((s) => s.id === routeId);
  if (onRoute) return onRoute.id;
  const atRisk = list.find((s) => s.risk_band === "high" || s.risk_band === "medium");
  return (atRisk || list[0]).id;
}

export default function ChatPanel() {
  const routeParams = useParams();
  const [shipments, setShipments] = useState([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState([]); // { role, text }
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const scrollRootRef = useRef(null);
  const viewportRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const prevSelectedRef = useRef("");

  const tts = useTextToSpeech();
  const speech = useSpeechRecognition({
    onResult: useCallback((transcript) => {
      setDraft((current) =>
        current.trim() ? `${current.trim()} ${transcript}` : transcript
      );
    }, []),
  });

  // Load the shipment list once, choose a sensible default context.
  useEffect(() => {
    let cancelled = false;
    api
      .shipments()
      .then((list) => {
        if (cancelled) return;
        const safe = Array.isArray(list) ? list : [];
        setShipments(safe);
        setSelected((prev) => prev || pickDefaultShipment(safe, routeParams.id));
      })
      .catch(() => {
        if (!cancelled) {
          setMessages((m) => [
            ...m,
            { role: "system", text: "Couldn't load shipments — reopen the Assistant to retry." },
          ]);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the shipment in the route when it changes.
  useEffect(() => {
    if (routeParams.id && shipments.some((s) => s.id === routeParams.id)) {
      setSelected(routeParams.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams.id, shipments.length]);

  // Insert a context-change divider whenever the selected shipment changes
  // (after the very first assignment).
  useEffect(() => {
    if (!selected) return;
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selected;
    if (!prev || prev === selected) return;
    const ship = shipments.find((s) => s.id === selected);
    const label = ship?.ref || selected;
    setMessages((m) => (m.length ? [...m, { role: "divider", text: label }] : m));
  }, [selected, shipments]);

  // Track whether the user has scrolled away from the bottom.
  useEffect(() => {
    const viewport = scrollRootRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    viewportRef.current = viewport || null;
    if (!viewport) return undefined;
    const handleScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      stickToBottomRef.current = distanceFromBottom < SCROLL_STICK_THRESHOLD_PX;
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [shipments.length]);

  // Auto-scroll to the newest message unless the user scrolled up.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && stickToBottomRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, thinking]);

  const send = useCallback(
    async (rawQuestion) => {
      const question = (rawQuestion ?? draft).trim();
      if (!question || thinking) return;
      if (!selected) {
        setMessages((m) => [...m, { role: "system", text: "Pick a shipment above first." }]);
        return;
      }

      if (speech.listening) speech.stop();
      stickToBottomRef.current = true;
      setMessages((m) => [...m, { role: "user", text: question }]);
      setDraft("");
      setThinking(true);
      try {
        const res = await api.voice(selected, question);
        const answer = res?.answer || "No answer came back for that one.";
        setMessages((m) => [...m, { role: "assistant", text: answer }]);
        tts.speak(answer);
      } catch {
        setMessages((m) => [
          ...m,
          { role: "system", text: "Couldn't reach the assistant — try again." },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [draft, thinking, selected, speech, tts]
  );

  const isEmpty = messages.length === 0 && !thinking;

  return (
    <div className="flex h-full flex-col" data-testid="assistant-panel">
      {/* Header: context shipment + read-aloud toggle */}
      <div className="mb-2 flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger
            className="h-8 flex-1 text-xs"
            data-testid="assistant-shipment-select"
          >
            <SelectValue placeholder="Select a shipment" />
          </SelectTrigger>
          <SelectContent>
            {shipments.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                <span className="flex items-center gap-1.5">
                  <RiskDot band={s.risk_band} />
                  <span className="font-mono">{s.ref}</span>
                  <span className="text-muted-foreground">
                    {s.hold_probability}% {s.risk_band}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={tts.toggle}
          aria-pressed={tts.enabled}
          aria-label={tts.enabled ? "Turn off spoken answers" : "Read answers aloud"}
        >
          {tts.enabled ? (
            <Volume2 className="h-4 w-4 text-primary" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Transcript */}
      <ScrollArea
        ref={scrollRootRef}
        className="min-h-0 flex-1 rounded-lg border border-border bg-card/40"
      >
        <div
          className="flex flex-col gap-2.5 p-3"
          role="log"
          aria-live="polite"
          aria-label="Assistant conversation"
        >
          {isEmpty && (
            <div className="my-6 px-2 text-center">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <p className="text-xs text-muted-foreground">
                Ask about any shipment's hold risk. Pick one above.
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <MessageBubble key={index} role={message.role} text={message.text} />
          ))}

          {thinking && <TypingDots />}
        </div>
      </ScrollArea>

      {/* Quick prompts */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => send(prompt)}
            disabled={thinking}
            className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground transition-colors duration-fast hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Composer */}
      <div className="mt-2">
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => send()}
          disabled={thinking}
          micSupported={speech.supported}
          listening={speech.listening}
          onMicToggle={speech.toggle}
        />
      </div>
    </div>
  );
}
