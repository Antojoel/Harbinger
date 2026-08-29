import React, { useState, useRef, useEffect } from "react";
import { Mic, X, Loader2, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const VoiceWidget = () => {
  const [open, setOpen] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState("idle"); // idle|listening|thinking|speaking
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const recRef = useRef(null);

  useEffect(() => {
    if (open && shipments.length === 0) {
      api.shipments().then((s) => {
        setShipments(s);
        if (s.length) setSelected(s[0].id);
      });
    }
  }, [open, shipments.length]);

  const supported =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const ask = async (question) => {
    if (!selected) {
      toast.error("Pick a shipment first");
      return;
    }
    setState("thinking");
    setAnswer("");
    try {
      const res = await api.voice(selected, question);
      setAnswer(res.answer);
      speak(res.answer);
    } catch (e) {
      toast.error("Voice query failed");
      setState("idle");
    }
  };

  const speak = (text) => {
    if (!window.speechSynthesis) {
      setState("idle");
      return;
    }
    setState("speaking");
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.onend = () => setState("idle");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const startListening = () => {
    if (!supported) {
      // fallback: ask default question
      setTranscript("What's this shipment's hold risk?");
      ask("What's this shipment's hold risk?");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setState("listening");
    rec.onresult = (ev) => {
      const text = ev.results[0][0].transcript;
      setTranscript(text);
      ask(text);
    };
    rec.onerror = () => {
      toast.error("Mic error — asking default question");
      setTranscript("What's this shipment's hold risk?");
      ask("What's this shipment's hold risk?");
    };
    rec.onend = () => {
      setState((s) => (s === "listening" ? "idle" : s));
    };
    recRef.current = rec;
    rec.start();
  };

  const stop = () => {
    if (recRef.current) recRef.current.stop();
    window.speechSynthesis && window.speechSynthesis.cancel();
    setState("idle");
  };

  if (!open) {
    return (
      <button
        data-testid="voice-widget-button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
      >
        <Mic className="h-4 w-4" /> Ask ClearanceGuard
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[320px] rounded-xl border bg-card p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium font-heading">
          <Volume2 className="h-4 w-4 text-primary" /> Voice assistant
        </div>
        <button onClick={() => { stop(); setOpen(false); }} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="mb-3 h-9 text-xs" data-testid="voice-shipment-select">
          <SelectValue placeholder="Select shipment" />
        </SelectTrigger>
        <SelectContent>
          {shipments.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              {s.ref} · risk {s.hold_probability}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mb-3 min-h-[72px] rounded-lg bg-muted/60 p-3 text-xs">
        {transcript ? <div className="mb-1 text-muted-foreground">“{transcript}”</div> : null}
        {answer ? (
          <div className="text-foreground">{answer}</div>
        ) : (
          <div className="text-muted-foreground">
            {supported ? "Hold the mic and ask about a shipment's hold risk." : "Tap to ask the default risk question."}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {state === "idle" && (
          <Button size="sm" className="w-full gap-2" onClick={startListening} data-testid="voice-ask-button">
            <Mic className="h-4 w-4" /> Ask
          </Button>
        )}
        {state === "listening" && (
          <Button size="sm" variant="secondary" className="w-full gap-2" onClick={stop}>
            <span className="flex gap-0.5">
              <span className="h-3 w-1 animate-pulse rounded bg-primary" />
              <span className="h-3 w-1 animate-pulse rounded bg-primary [animation-delay:120ms]" />
              <span className="h-3 w-1 animate-pulse rounded bg-primary [animation-delay:240ms]" />
            </span>
            Listening… stop
          </Button>
        )}
        {state === "thinking" && (
          <Button size="sm" variant="secondary" className="w-full gap-2" disabled>
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
          </Button>
        )}
        {state === "speaking" && (
          <Button size="sm" variant="secondary" className="w-full gap-2" onClick={stop}>
            <Volume2 className="h-4 w-4" /> Speaking… stop
          </Button>
        )}
      </div>
    </div>
  );
};
