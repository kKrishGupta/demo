/**
 * Speech Recognition Service wrapping the Web Speech API
 * Supports WebkitSpeechRecognition and standard SpeechRecognition
 */

export function isSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Creates and manages a SpeechRecognition instance with safe error handling and transcript accumulation
 * 
 * @param {Object} options
 * @param {Function} options.onInterim Called with temporary live speech text
 * @param {Function} options.onFinal Called with confirmed final transcript chunk
 * @param {Function} options.onError Called with user-friendly error message and error code
 * @param {Function} options.onStart Called when microphone capture begins
 * @param {Function} options.onEnd Called when microphone capture stops
 * @param {string} [options.language='en-US'] Recognition language
 * @returns {Object} Controller with start(), stop(), and abort() methods
 */
export function createSpeechRecognizer({
  onInterim,
  onFinal,
  onError,
  onStart,
  onEnd,
  language = 'en-US'
}) {
  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    return {
      isSupported: false,
      start: () => {
        onError?.(
          'Web Speech Recognition is not supported in this browser. Please use Google Chrome, Edge, or type/paste your command directly.',
          'NOT_SUPPORTED'
        );
      },
      stop: () => {},
      abort: () => {}
    };
  }

  let recognition = null;
  let isListening = false;

  const initRecognizer = () => {
    try {
      const instance = new SpeechRecognitionClass();
      instance.continuous = true;
      instance.interimResults = true;
      instance.lang = language;
      instance.maxAlternatives = 1;

      instance.onstart = () => {
        isListening = true;
        onStart?.();
      };

      instance.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcriptChunk;
          } else {
            interimText += transcriptChunk;
          }
        }

        if (finalText.trim()) {
          onFinal?.(finalText.trim());
        }
        if (interimText.trim()) {
          onInterim?.(interimText.trim());
        }
      };

      instance.onerror = (event) => {
        let message = 'Speech recognition error occurred.';
        switch (event.error) {
          case 'not-allowed':
          case 'service-not-allowed':
            message = 'Microphone access denied. Please grant microphone permissions in your browser settings.';
            break;
          case 'no-speech':
            message = 'No speech was detected. Please try speaking closer to your microphone.';
            break;
          case 'audio-capture':
            message = 'No microphone was found or microphone is busy.';
            break;
          case 'network':
            message = 'Network error during speech recognition. Check your connection or paste your command.';
            break;
          case 'aborted':
            message = 'Speech capture stopped.';
            break;
          default:
            message = `Speech recognition error: ${event.error}`;
        }
        onError?.(message, event.error);
      };

      instance.onend = () => {
        isListening = false;
        onEnd?.();
      };

      return instance;
    } catch (err) {
      onError?.(`Failed to initialize speech recognition: ${err.message}`, 'INIT_FAILED');
      return null;
    }
  };

  return {
    isSupported: true,
    isListening: () => isListening,
    start: () => {
      if (isListening) return;
      try {
        recognition = initRecognizer();
        if (recognition) {
          recognition.start();
        }
      } catch (err) {
        onError?.(`Unable to start microphone: ${err.message}`, 'START_ERROR');
      }
    },
    stop: () => {
      if (!isListening || !recognition) return;
      try {
        recognition.stop();
      } catch (err) {
        console.warn('Error stopping recognition:', err);
      }
    },
    abort: () => {
      if (!recognition) return;
      try {
        recognition.abort();
      } catch (err) {
        console.warn('Error aborting recognition:', err);
      }
    }
  };
}
