import React, { useLayoutEffect, useRef } from "react";
import { Mic, Send, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_HEIGHT_PX = 96; // ~4 rows at text-sm
const BARS = 5;

/** Live mic waveform. Bar heights track the measured input level, so the user
 *  can see the mic is actually hearing them — the point of the animation is
 *  feedback, not decoration. Falls back to a static row under
 *  prefers-reduced-motion via the global transition suppression in index.css. */
function Waveform({ level }) {
  return (
    <span className="flex h-4 items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: BARS }).map((_, i) => {
        // Middle bars react most, so the shape reads as a voice, not a meter.
        const weight = 1 - Math.abs(i - (BARS - 1) / 2) / BARS;
        const height = 3 + Math.min(1, level * (0.55 + weight)) * 13;
        return (
          <span
            key={i}
            className="w-[3px] rounded-full bg-danger transition-[height] duration-100 ease-out"
            style={{ height: `${height}px` }}
          />
        );
      })}
    </span>
  );
}

/**
 * The chat input row: an autogrowing textarea (Enter sends, Shift+Enter
 * newline), a mic button that records real audio for server-side
 * transcription, and a send icon-button disabled until there is non-empty
 * text. While recording, the textarea is replaced by a live waveform so the
 * state is unmistakable.
 */
export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  micSupported = false,
  listening = false,
  transcribing = false,
  level = 0,
  onMicToggle,
}) {
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const canSend = !disabled && value.trim().length > 0 && !listening;

  return (
    <div
      className={cn(
        "flex items-end gap-1.5 rounded-lg border bg-card p-1.5 transition-colors duration-normal",
        listening
          ? "border-danger/50 ring-2 ring-danger/15"
          : "border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25"
      )}
    >
      <label htmlFor="assistant-composer" className="sr-only">
        Message the assistant
      </label>

      {listening ? (
        <div className="flex min-h-[32px] flex-1 items-center gap-2.5 self-center px-2 py-1.5">
          <Waveform level={level} />
          <span className="text-sm text-danger-foreground">Listening…</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            pause to finish
          </span>
        </div>
      ) : (
        <textarea
          id="assistant-composer"
          ref={textareaRef}
          data-testid="assistant-composer"
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={transcribing}
          placeholder={transcribing ? "Transcribing…" : "Ask about this shipment…"}
          className="min-h-[32px] flex-1 resize-none self-center bg-transparent px-2 py-1.5 text-sm leading-5 placeholder:text-muted-foreground/70 focus-visible:outline-none disabled:opacity-70"
          style={{ maxHeight: MAX_HEIGHT_PX }}
        />
      )}

      {micSupported && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          data-testid="assistant-mic"
          onClick={onMicToggle}
          disabled={transcribing}
          aria-pressed={listening}
          aria-label={listening ? "Stop recording" : "Dictate a question"}
          className={cn(
            "relative h-8 w-8 shrink-0 transition-colors duration-fast",
            listening
              ? "bg-danger text-white hover:bg-danger/90"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {listening && (
            <span
              aria-hidden="true"
              className="cg-mic-ring absolute inset-0 rounded-md border border-danger"
            />
          )}
          {transcribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : listening ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      )}

      <Button
        type="button"
        size="icon"
        data-testid="assistant-send"
        className="h-8 w-8 shrink-0"
        onClick={onSend}
        disabled={!canSend}
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default Composer;
