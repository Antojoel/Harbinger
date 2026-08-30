import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { startWavRecording, blobToBase64 } from "@/lib/wavRecorder";

/**
 * Speech helpers for the Assistant chat.
 *
 * `useMicDictation` records real microphone audio and sends it to the engine
 * for transcription. It deliberately does NOT use the browser's
 * SpeechRecognition API: that needs a cloud speech service, and when the
 * service is unreachable (offline, Brave shields, strict tracker blocking)
 * it fires `onend` within a few hundred milliseconds of `start()` — which
 * reads to the user as the mic closing the instant they click it. Recording
 * locally and posting to `/api/transcribe` uses the same STT provider as the
 * rest of the voice pipeline (local faster-whisper when VOICE_PROVIDER=local)
 * and holds until the user actually stops.
 *
 * `useTextToSpeech` owns the "read answers aloud" toggle: default OFF,
 * persisted to localStorage under `cg_tts_on`, and only speaks when enabled.
 */

const TTS_KEY = "cg_tts_on";

// Recording needs getUserMedia, which browsers only expose in a secure
// context (https, or localhost). Checking up front lets the UI hide the mic
// rather than offer a button that can only fail.
export const micSupported =
  typeof navigator !== "undefined" &&
  Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
  typeof window !== "undefined" &&
  Boolean(window.AudioContext || window.webkitAudioContext);

// Stop on silence, so the user doesn't have to click twice for a short
// question — but only after they've actually said something.
const SILENCE_LEVEL = 0.045;
const SILENCE_MS = 1600;
const MAX_RECORDING_MS = 30000;

function cancelSynthesis() {
  try {
    window.speechSynthesis && window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ onResult?: (transcript: string) => void, onError?: (message: string) => void }} [options]
 */
export function useMicDictation({ onResult, onError } = {}) {
  const [state, setState] = useState("idle"); // idle | listening | transcribing
  const [level, setLevel] = useState(0); // 0..1, drives the waveform
  const recorderRef = useRef(null);
  const meterRef = useRef(null);
  const stoppingRef = useRef(false);
  const cbRef = useRef({ onResult, onError });

  useEffect(() => {
    cbRef.current = { onResult, onError };
  }, [onResult, onError]);

  const teardownMeter = useCallback(() => {
    const meter = meterRef.current;
    meterRef.current = null;
    if (!meter) return;
    cancelAnimationFrame(meter.raf);
    clearTimeout(meter.maxTimer);
    try {
      meter.source.disconnect();
      meter.analyser.disconnect();
      meter.stream.getTracks().forEach((t) => t.stop());
      meter.ctx.close();
    } catch {
      /* ignore */
    }
  }, []);

  const finish = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    const recorder = recorderRef.current;
    recorderRef.current = null;
    teardownMeter();
    setLevel(0);

    if (!recorder) {
      setState("idle");
      stoppingRef.current = false;
      return;
    }

    let blob;
    try {
      blob = recorder.stop();
    } catch {
      setState("idle");
      stoppingRef.current = false;
      return;
    }

    // Anything this short is a mis-click, not speech.
    if (!blob || blob.size < 4000) {
      setState("idle");
      stoppingRef.current = false;
      return;
    }

    setState("transcribing");
    try {
      const audio = await blobToBase64(blob);
      const { transcript } = await api.transcribe(audio);
      if (transcript) cbRef.current.onResult?.(transcript);
      else cbRef.current.onError?.("Didn't catch that — try again.");
    } catch (e) {
      cbRef.current.onError?.(
        e?.response?.data?.detail || "Couldn't transcribe that — try again."
      );
    } finally {
      setState("idle");
      stoppingRef.current = false;
    }
  }, [teardownMeter]);

  const start = useCallback(async () => {
    if (!micSupported || recorderRef.current) return;
    cancelSynthesis(); // don't let TTS talk over the user

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      cbRef.current.onError?.("Microphone blocked — allow access and try again.");
      return;
    }

    try {
      recorderRef.current = await startWavRecording();
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      cbRef.current.onError?.("Couldn't start recording.");
      return;
    }

    setState("listening");
    stoppingRef.current = false;

    // Second, analysis-only capture: drives the waveform and the
    // stop-on-silence timer. The recorder above owns the audio that is
    // actually sent.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const meter = { ctx, source, analyser, stream, raf: 0, maxTimer: 0 };
      let spokeAt = 0;
      let sawSpeech = false;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 4));

        const now = performance.now();
        if (rms > SILENCE_LEVEL) {
          sawSpeech = true;
          spokeAt = now;
        } else if (sawSpeech && spokeAt && now - spokeAt > SILENCE_MS) {
          finish();
          return;
        }
        meter.raf = requestAnimationFrame(tick);
      };

      meter.raf = requestAnimationFrame(tick);
      meter.maxTimer = setTimeout(finish, MAX_RECORDING_MS);
      meterRef.current = meter;
    } catch {
      // Meter is a nicety — recording still works without it.
      stream.getTracks().forEach((t) => t.stop());
    }
  }, [finish]);

  const stop = useCallback(() => finish(), [finish]);

  const toggle = useCallback(() => {
    if (state === "listening") stop();
    else if (state === "idle") start();
  }, [state, start, stop]);

  useEffect(
    () => () => {
      teardownMeter();
      try {
        recorderRef.current && recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    },
    [teardownMeter]
  );

  return {
    supported: micSupported,
    state,
    listening: state === "listening",
    transcribing: state === "transcribing",
    level,
    start,
    stop,
    toggle,
  };
}

export function useTextToSpeech({ onNotice } = {}) {
  // Only a value the user actually set counts. Absent means "not decided
  // yet", and the default is chosen once we know whether the engine has a
  // real voice: on when it does (Kokoro on a local stack), off when the only
  // option is the browser's robotic built-in.
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(TTS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [serverTts, setServerTts] = useState(false);
  const audioRef = useRef(null);
  const noticeRef = useRef(onNotice);
  // Set when the browser refuses to autoplay; the next click unlocks audio.
  const blockedRef = useRef(false);

  useEffect(() => {
    noticeRef.current = onNotice;
  }, [onNotice]);

  useEffect(() => {
    let alive = true;
    api
      .config()
      .then((c) => {
        if (!alive) return;
        const hasServerVoice = Boolean(c?.server_tts);
        setServerTts(hasServerVoice);
        let chosen = null;
        try {
          chosen = localStorage.getItem(TTS_KEY);
        } catch {
          /* ignore */
        }
        if (chosen === null && hasServerVoice) setEnabled(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Chrome and Brave block audio started outside a user gesture until the
  // page has been interacted with. An answer arrives asynchronously, so the
  // first one can be refused; re-arm on the next real click.
  useEffect(() => {
    const unlock = () => {
      blockedRef.current = false;
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const stopAudio = useCallback(() => {
    const el = audioRef.current;
    audioRef.current = null;
    if (!el) return;
    try {
      el.pause();
      el.src = "";
    } catch {
      /* ignore */
    }
  }, []);

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
      if (!next) {
        cancelSynthesis();
        stopAudio();
      }
      return next;
    });
  }, [persist, stopAudio]);

  const speakInBrowser = useCallback((text) => {
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
  }, []);

  const speak = useCallback(
    async (text) => {
      if (!enabled || !text) return;
      cancelSynthesis();
      stopAudio();

      // Prefer the engine's own voice (Kokoro when the local stack is up).
      // Fall back to the browser only if the server can't synthesize — a
      // silent failure here would look like the toggle is broken.
      if (serverTts) {
        try {
          const { audio_base64: audio, mime } = await api.speak(text);
          if (audio) {
            const el = new Audio(`data:${mime || "audio/wav"};base64,${audio}`);
            audioRef.current = el;
            try {
              await el.play();
              blockedRef.current = false;
              return;
            } catch (err) {
              // A refused autoplay is not a synthesis failure — falling back
              // to the browser voice would just be refused too. Say so once,
              // and let the next click unlock it.
              if (err?.name === "NotAllowedError") {
                if (!blockedRef.current) {
                  blockedRef.current = true;
                  noticeRef.current?.(
                    "Your browser blocked autoplay. Click anywhere, then ask again to hear answers."
                  );
                }
                return;
              }
              throw err;
            }
          }
        } catch {
          /* fall through to the browser voice */
        }
      }
      speakInBrowser(text);
    },
    [enabled, serverTts, speakInBrowser, stopAudio]
  );

  const cancel = useCallback(() => {
    cancelSynthesis();
    stopAudio();
  }, [stopAudio]);

  useEffect(() => stopAudio, [stopAudio]);

  return { enabled, toggle, speak, cancel, serverTts };
}
