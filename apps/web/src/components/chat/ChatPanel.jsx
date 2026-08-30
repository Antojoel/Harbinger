import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Sparkles, Volume2, VolumeX, Layers } from "lucide-react";
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
import { useMicDictation, useTextToSpeech } from "./useSpeech";

// Prompts follow the screen: on the graph the useful question is what the
// graph means, on the manifest it's which containers need attention. Falls
// back to shipment-level questions on a dossier.
const QUICK_PROMPTS_BY_PAGE = {
  "/graph": [
    "What does this graph tell me?",
    "Where do failures concentrate?",
    "What should I check before filing?",
  ],
  "/patterns": [
    "Which pattern costs us most?",
    "What's the trend here?",
    "How do I act on these?",
  ],
  "/shipments": [
    "Which containers need attention?",
    "Summarise risk by importer",
    "What's blocking the high-risk ones?",
  ],
  "/": [
    "What needs attention today?",
    "Summarise risk by destination",
    "Where are certificates missing?",
  ],
};

const SHIPMENT_PROMPTS = [
  "Why is this flagged?",
  "What's the hold risk?",
  "What fixes it?",
];

function promptsFor(pathname) {
  if (pathname.startsWith("/shipment/")) return SHIPMENT_PROMPTS;
  return QUICK_PROMPTS_BY_PAGE[pathname] || SHIPMENT_PROMPTS;
}

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

// Sentinel for "no single shipment in focus" — the assistant is handed the
// whole book either way, this only decides whether one container is called
// out as the subject of the question.
const ALL = "__all__";

function routeShipmentIdFrom(pathname) {
  const m = /^\/shipment\/([^/]+)/.exec(pathname || "");
  return m ? decodeURIComponent(m[1]) : "";
}

// Focus a shipment only when the user is actually looking at one. Previously
// this fell back to "first at-risk, else first in the list", which silently
// scoped every question to one container.
function pickDefaultShipment(list, routeId) {
  const onRoute = list.find((s) => s.id === routeId);
  return onRoute ? onRoute.id : ALL;
}

export default function ChatPanel() {
  const location = useLocation();
  // ChatPanel renders inside Layout, which sits OUTSIDE <Routes> — useParams()
  // is empty here, so the focused shipment is read from the path directly.
  const routeShipmentId = routeShipmentIdFrom(location.pathname);
  const [shipments, setShipments] = useState([]);
  const [selected, setSelected] = useState(ALL);
  const [messages, setMessages] = useState([]); // { role, text }
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const scrollRootRef = useRef(null);
  const viewportRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const prevSelectedRef = useRef("");

  const tts = useTextToSpeech({
    onNotice: useCallback((message) => {
      setMessages((m) => [...m, { role: "system", text: message }]);
    }, []),
  });
  const speech = useMicDictation({
    // Dictation fills the composer rather than sending, so the user can fix a
    // misheard word before it goes anywhere.
    onResult: useCallback((transcript) => {
      setDraft((current) =>
        current.trim() ? `${current.trim()} ${transcript}` : transcript
      );
    }, []),
    onError: useCallback((message) => {
      setMessages((m) => [...m, { role: "system", text: message }]);
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
        setSelected((prev) => (prev && prev !== ALL ? prev : pickDefaultShipment(safe, routeShipmentId)));
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
    if (routeShipmentId && shipments.some((s) => s.id === routeShipmentId)) {
      setSelected(routeShipmentId);
    } else if (!routeShipmentId) {
      setSelected(ALL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeShipmentId, shipments.length]);

  // Insert a context-change divider whenever the selected shipment changes
  // (after the very first assignment).
  useEffect(() => {
    if (!selected) return;
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selected;
    if (!prev || prev === selected) return;
    const ship = shipments.find((s) => s.id === selected);
    const label = selected === ALL ? "all shipments" : ship?.ref || selected;
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

      if (speech.listening) speech.stop();
      stickToBottomRef.current = true;
      setMessages((m) => [...m, { role: "user", text: question }]);
      setDraft("");
      setThinking(true);
      try {
        const res = await api.voice(selected === ALL ? undefined : selected, question, location.pathname);
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
    [draft, thinking, selected, speech, tts, location.pathname]
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
            <SelectItem value={ALL} className="text-xs">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">All shipments</span>
                {shipments.length > 0 && (
                  <span className="text-muted-foreground">{shipments.length} in the book</span>
                )}
              </span>
            </SelectItem>
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
          className={cn(
            "h-8 w-8 shrink-0",
            tts.enabled ? "bg-accent text-accent-foreground" : "text-muted-foreground"
          )}
          onClick={tts.toggle}
          aria-pressed={tts.enabled}
          title={
            tts.enabled
              ? `Answers are spoken aloud${tts.serverTts ? "" : " (browser voice)"}`
              : "Answers are not spoken"
          }
          aria-label={tts.enabled ? "Turn off spoken answers" : "Read answers aloud"}
        >
          {tts.enabled ? (
            <Volume2 className="h-4 w-4" />
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
                Ask about any shipment, the whole book, what the graph is telling you, or where to find something.
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
        {promptsFor(location.pathname).map((prompt) => (
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
          transcribing={speech.transcribing}
          level={speech.level}
          onMicToggle={speech.toggle}
        />
      </div>
    </div>
  );
}
