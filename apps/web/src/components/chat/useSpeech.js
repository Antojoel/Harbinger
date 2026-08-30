import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speech helpers for the Assistant chat.
 *
 * `useSpeechRecognition` wraps the browser SpeechRecognition API (with the
 * webkit prefix fallback). `speechRecognitionSupported` is a module-level
 * boolean so callers can decide whether to render a mic button at all.
 *
 * `useTextToSpeech` owns the "read answers aloud" toggle: default OFF,
 * persisted to localStorage under `cg_tts_on`, and only speaks when enabled.
 */

const SpeechRecognitionImpl =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const speechRecognitionSupported = Boolean(SpeechRecognitionImpl);

const TTS_KEY = "cg_tts_on";

function cancelSynthesis() {
  try {
    window.speechSynthesis && window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ onResult?: (transcript: string) => void }} [options]
 */
export function useSpeechRecognition({ onResult } = {}) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current && recognitionRef.current.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognitionImpl) return;
    // Don't let TTS talk over the user while they dictate.
    cancelSynthesis();

    try {
      const recognition = new SpeechRecognitionImpl();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setListening(true);
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript || "")
          .join(" ")
          .trim();
        if (transcript) onResultRef.current && onResultRef.current(transcript);
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(
    () => () => {
      try {
        recognitionRef.current && recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
    },
    []
  );

  return { supported: speechRecognitionSupported, listening, start, stop, toggle };
}

export function useTextToSpeech() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(TTS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const persist = useCallback((next) => {
    try {
      localStorage.setItem(TTS_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      persist(next);
      if (!next) cancelSynthesis();
      return next;
    });
  }, [persist]);

  const speak = useCallback(
    (text) => {
      if (!enabled || !text) return;
      let synth;
      try {
        synth = window.speechSynthesis;
      } catch {
        return;
      }
      if (!synth || typeof window.SpeechSynthesisUtterance !== "function") return;
      synth.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      synth.speak(utterance);
    },
    [enabled]
  );

  const cancel = useCallback(() => cancelSynthesis(), []);

  return { enabled, toggle, speak, cancel };
}
