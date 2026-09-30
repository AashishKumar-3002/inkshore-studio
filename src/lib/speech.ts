/**
 * Browser speech, kept deliberately thin.
 *
 * Dictation and command interpretation are separate concerns: this module
 * only turns sound into text and text into sound. Swapping in a hosted
 * transcription provider (or a mobile native API) means replacing
 * `startDictation` and nothing else.
 */

type RecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function speechRecognitionAvailable(): boolean {
  return recognitionConstructor() !== null;
}

export function speechSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Permission denial and "no speech" arrive as error codes; they're turned into sentences the drawer can show. */
const RECOGNITION_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access was denied. Allow it in your browser settings, or type your command instead.",
  "service-not-allowed": "Speech recognition isn't available here. Type your command instead.",
  "no-speech": "I didn't catch anything. Try again, or type your command instead.",
  "audio-capture": "No microphone was found. Type your command instead.",
  "network": "Speech recognition lost its network connection. Type your command instead.",
};

export type Dictation = { stop: () => void };

/**
 * Starts dictation, reporting the transcript so far on every update.
 * `onResult` receives the full text, not a delta, so the caller can simply
 * mirror it into the command field.
 */
export function startDictation({
  onResult,
  onError,
  onEnd,
}: {
  onResult: (transcript: string, final: boolean) => void;
  onError: (message: string) => void;
  onEnd?: () => void;
}): Dictation | null {
  const Constructor = recognitionConstructor();
  if (!Constructor) return null;
  const recognition = new Constructor();
  recognition.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;
  let text = "";
  recognition.onresult = event => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const phrase = result[0]?.transcript ?? "";
      if (result.isFinal) text += phrase;
      else interim += phrase;
    }
    onResult((text + interim).trim(), !interim);
  };
  recognition.onerror = event => onError(RECOGNITION_ERRORS[event.error] ?? "Dictation stopped unexpectedly. Type your command instead.");
  recognition.onend = () => onEnd?.();
  try {
    recognition.start();
  } catch {
    onError("Dictation couldn't start. Type your command instead.");
    return null;
  }
  return { stop: () => recognition.stop() };
}

export function speak(text: string, onEnd?: () => void): void {
  if (!speechSynthesisAvailable()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (speechSynthesisAvailable()) window.speechSynthesis.cancel();
}
