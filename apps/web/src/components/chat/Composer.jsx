import React, { useLayoutEffect, useRef } from "react";
import { Mic, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_HEIGHT_PX = 96; // ~4 rows at text-sm

/**
 * The chat input row: an autogrowing textarea (Enter sends, Shift+Enter newline),
 * an optional mic button (rendered only when speech recognition is supported),
 * and a send icon-button disabled until there is non-empty text.
 */
export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  micSupported = false,
  listening = false,
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

  const canSend = !disabled && value.trim().length > 0;

  return (
    <div className="flex items-end gap-1.5 rounded-lg border border-border bg-card p-1.5 transition-colors duration-fast focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
      <label htmlFor="assistant-composer" className="sr-only">
        Message the assistant
      </label>
      <textarea
        id="assistant-composer"
        ref={textareaRef}
        data-testid="assistant-composer"
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={listening ? "Listening…" : "Ask about this shipment…"}
        className="min-h-[32px] flex-1 resize-none self-center bg-transparent px-2 py-1.5 text-sm leading-5 placeholder:text-muted-foreground/70 focus-visible:outline-none"
        style={{ maxHeight: MAX_HEIGHT_PX }}
      />

      {micSupported && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          data-testid="assistant-mic"
          onClick={onMicToggle}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Dictate a question"}
          className={cn(
            "h-8 w-8 shrink-0",
            listening
              ? "bg-danger-soft text-danger-foreground hover:bg-danger-soft"
              : "text-muted-foreground"
          )}
        >
          <Mic className={cn("h-4 w-4", listening && "animate-pulse")} />
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
