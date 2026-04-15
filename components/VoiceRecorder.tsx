'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Upload, Stethoscope } from 'lucide-react';
import { getSpeechAPI, getTranscribeAPI, getTranscribeWebAPI, type TranscribeAPI } from '@/lib/settings';

function getTranscribeEndpoint(api: TranscribeAPI | string): string {
  if (api === 'deepgram') return '/api/transcribe-deepgram';
  if (api === 'wispr') return '/api/transcribe-wispr';
  return '/api/transcribe';
}

function convertSpokenPunctuation(text: string): string {
  return text
    .replace(/(?<!\bmenstrual)\s*\b(?:period|full stop)\b(?!\s+of)\s*/gi, '. ')
    .replace(/\s*\bcomma\b\s*/gi, ', ')
    .replace(/\s*\b(?:question mark)\b\s*/gi, '? ')
    .replace(/\s*\b(?:exclamation (?:mark|point))\b\s*/gi, '! ')
    .replace(/\s*\bcolon\b\s*/gi, ': ')
    .replace(/\s*\bsemicolon\b\s*/gi, '; ')
    .replace(/\s*\b(?:dash|hyphen)\b\s*/gi, ' — ')
    .replace(/\s*\b(?:new line|newline|next line)\b\s*/gi, '\n')
    .replace(/\s*\b(?:new paragraph|next paragraph)\b\s*/gi, '\n\n')
    .replace(/([.!?]\s+)([a-z])/g, (_, punct, letter) => punct + letter.toUpperCase())
    .replace(/ {2,}/g, ' ')
    .trim();
}

type RecorderState = 'idle' | 'recording' | 'transcribing' | 'error';

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onRecordingStart?: () => void;
  /** Called with true when raw STT text is shown (being refined), false when final text arrives */
  onProcessingChange?: (processing: boolean) => void;
  disabled?: boolean;
  mode?: 'encounter' | 'dictation';
  showUpload?: boolean;
}

export function VoiceRecorder({
  onTranscript, onInterimTranscript, onRecordingStart, onProcessingChange,
  disabled, mode = 'dictation', showUpload,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const stateRef = useRef<RecorderState>('idle');
  const setRecState = (s: RecorderState) => { stateRef.current = s; setState(s); };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pressActiveRef = useRef(false);      // true from pointerDown to pointerUp
  const toggleModeRef = useRef(false);       // true when in click-to-stop non-medicalize mode
  const mimeTypeRef = useRef('');
  const accumulatedTextRef = useRef('');
  const stoppingRef = useRef(false);

  // Periodic refinement refs
  const refineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refinedTextRef = useRef('');          // Deepgram-refined text accumulated so far
  const segmentStartRef = useRef(0);          // When current segment started
  const refineCountRef = useRef(0);           // Number of segments refined
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null); // Detects speech pause
  const lastSpeechRef = useRef(0);            // Timestamp of last speech event

  const [isHolding, setIsHolding] = useState(false);
  const isHoldingRef = useRef(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Audio level visualization
  const [audioLevel, setAudioLevel] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // iOS keepalive
  const keepaliveAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stable callback refs
  const onInterimRef = useRef(onInterimTranscript);
  onInterimRef.current = onInterimTranscript;
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onProcessingRef = useRef(onProcessingChange);
  onProcessingRef.current = onProcessingChange;

  const useStreaming = mode === 'dictation' && !!onInterimTranscript;

  useEffect(() => {
    if (state === 'error') {
      const t = setTimeout(() => setRecState('idle'), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (refineTimerRef.current) clearInterval(refineTimerRef.current);
      if (keepaliveAudioRef.current) { keepaliveAudioRef.current.pause(); keepaliveAudioRef.current = null; }
    };
  }, []);

  // --- iOS keepalive ---
  const startKeepalive = useCallback(() => {
    try {
      if (keepaliveAudioRef.current) return;
      const sampleRate = 8000, numSamples = sampleRate;
      const buffer = new ArrayBuffer(44 + numSamples);
      const view = new DataView(buffer);
      const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); view.setUint32(4, 36 + numSamples, true); w(8, 'WAVE');
      w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate, true);
      view.setUint16(32, 1, true); view.setUint16(34, 8, true); w(36, 'data'); view.setUint32(40, numSamples, true);
      for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128);
      const audio = new Audio(URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })));
      audio.loop = true; audio.volume = 0.01; audio.play().catch(() => {});
      keepaliveAudioRef.current = audio;
    } catch {}
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveAudioRef.current) { keepaliveAudioRef.current.pause(); keepaliveAudioRef.current.src = ''; keepaliveAudioRef.current = null; }
  }, []);

  const getMimeType = (): string => {
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    }
    return 'audio/webm';
  };

  const getFileExtension = (mime: string): string => mime.includes('mp4') ? 'mp4' : 'webm';

  // --- Audio level viz ---
  const startAudioLevelViz = useCallback((analyser: AnalyserNode) => {
    const dataArray = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
      setAudioLevel(Math.min(1, Math.sqrt(sum / dataArray.length) / 0.12));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAudioLevelViz = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    setAudioLevel(0);
  }, []);

  // --- Stop Web Speech ---
  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
  }, []);

  // --- Start Web Speech (suppresses output when isHoldingRef is true) ---
  const startWebSpeech = useCallback(() => {
    const SpeechAPI = typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
    if (!SpeechAPI) return;
    try {
      const recognition = new SpeechAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      let finalTranscript = '';
      recognition.onresult = (event: any) => {
        // Suppress output during hold (medicalize mode)
        if (isHoldingRef.current) return;

        let interim = '';
        let hasNewFinal = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) { finalTranscript += event.results[i][0].transcript + ' '; hasNewFinal = true; }
          else { interim += event.results[i][0].transcript; }
        }
        const full = convertSpokenPunctuation((finalTranscript + interim).trim());
        accumulatedTextRef.current = full;
        lastSpeechRef.current = Date.now();

        // If we have refined text from Deepgram, show refined + any new unrefined tail
        if (refinedTextRef.current && full.length > refinedTextRef.current.length) {
          onInterimRef.current?.(refinedTextRef.current + ' ' + full.slice(refinedTextRef.current.length).trim());
          onProcessingRef.current?.(true); // new unrefined text → grey
        } else if (refinedTextRef.current) {
          onInterimRef.current?.(refinedTextRef.current);
        } else {
          onInterimRef.current?.(full);
          // Show as grey while interim results are coming in
          if (!hasNewFinal || interim) {
            onProcessingRef.current?.(true);
          }
        }

        // Pause detection: after 1.5s of no new speech, mark text as settled
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        if (hasNewFinal && !interim) {
          // Final result with no pending interim — text is settled now
          onProcessingRef.current?.(false);
        } else {
          pauseTimerRef.current = setTimeout(() => {
            // 1.5s silence — treat current text as final/settled
            if (stateRef.current === 'recording' && !stoppingRef.current) {
              onProcessingRef.current?.(false);
            }
          }, 1500);
        }
      };
      recognition.onerror = () => {};
      recognition.onend = () => {
        if (stateRef.current === 'recording' && streamRef.current && !isHoldingRef.current) {
          try { recognition.start(); } catch {}
        }
      };
      recognition.start();
      recognitionRef.current = recognition;
    } catch {}
  }, []);

  // --- Clean up mic/audio resources ---
  const cleanupResources = useCallback(() => {
    stoppingRef.current = true;
    stopAudioLevelViz();
    stopKeepalive();
    stopWebSpeech();
    if (refineTimerRef.current) { clearInterval(refineTimerRef.current); refineTimerRef.current = null; }
    if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, [stopAudioLevelViz, stopKeepalive, stopWebSpeech]);

  // --- Collect audio blob from MediaRecorder ---
  const collectAudioBlob = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;
    return new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
      recorder.stop();
    });
  }, []);

  // --- Flush current audio segment to Deepgram for refinement ---
  const flushSegmentForRefinement = useCallback(async () => {
    if (stoppingRef.current) return;
    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    if (!recorder || recorder.state !== 'recording' || !stream) return;
    if (Date.now() - segmentStartRef.current < 2000) return; // too short

    // Stop current recorder and collect blob
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
      recorder.stop();
    });

    // Start a new segment immediately (mic stream is still open)
    if (!stoppingRef.current && stream.active) {
      const newRecorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
      mediaRecorderRef.current = newRecorder;
      chunksRef.current = [];
      newRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      newRecorder.start();
      segmentStartRef.current = Date.now();
    }

    // Send blob for Deepgram transcription in background
    if (blob.size > 2000) {
      try {
        const speechEngine = getSpeechAPI();
        const useExternal = speechEngine === 'deepgram' || speechEngine === 'wispr';
        if (!useExternal) return; // only refine if Deepgram/Wispr available

        const formData = new FormData();
        formData.append('audio', blob, `segment.${getFileExtension(mimeTypeRef.current)}`);
        formData.append('mode', 'dictation');
        const res = await fetch(getTranscribeEndpoint(speechEngine), { method: 'POST', body: formData });
        if (res.ok && !stoppingRef.current) {
          const { text } = await res.json();
          if (text?.trim()) {
            refinedTextRef.current = refinedTextRef.current
              ? `${refinedTextRef.current} ${text.trim()}`
              : text.trim();
            refineCountRef.current++;
            // Replace Web Speech text with refined text
            onInterimRef.current?.(refinedTextRef.current);
            onProcessingRef.current?.(false); // text is now refined (not grey)
          }
        }
      } catch {}
    }
  }, []);

  // =================================================================
  // DICTATION MODE: Start recording (mic + MediaRecorder + Web Speech)
  // Web Speech starts immediately for instant text, but its output is
  // suppressed if the user holds past 500ms (medicalize mode).
  // Periodic refinement: every 8s, flush audio to Deepgram for cleanup.
  // =================================================================
  const startDictationRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;

      onRecordingStart?.();
      onProcessingRef.current?.(true); // Signal: live/interim text is being shown (grey)
      startKeepalive();
      stoppingRef.current = false;

      // Start MediaRecorder (captures audio for refinement segments)
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start();
      segmentStartRef.current = Date.now();

      accumulatedTextRef.current = '';
      refinedTextRef.current = '';
      refineCountRef.current = 0;
      setRecState('recording');

      // Start Web Speech for instant text (output suppressed during hold via isHoldingRef)
      startWebSpeech();

      // Periodic refinement: flush audio segment every 8 seconds
      if (refineTimerRef.current) clearInterval(refineTimerRef.current);
      refineTimerRef.current = setInterval(() => {
        if (!stoppingRef.current) flushSegmentForRefinement();
      }, 8000);

      // Audio level visualization
      try {
        const vizCtx = new AudioContext();
        const vizSource = vizCtx.createMediaStreamSource(stream);
        const vizAnalyser = vizCtx.createAnalyser();
        vizAnalyser.fftSize = 2048;
        vizSource.connect(vizAnalyser);
        audioContextRef.current = vizCtx;
        analyserRef.current = vizAnalyser;
        startAudioLevelViz(vizAnalyser);
      } catch {}
    } catch {
      setRecState('error');
    }
  }, [onRecordingStart, startKeepalive, startWebSpeech, startAudioLevelViz, flushSegmentForRefinement]);

  // --- Stop non-medicalize (toggle mode) ---
  const stopNonMedicalize = useCallback(async () => {
    // Stop refinement timer first
    if (refineTimerRef.current) { clearInterval(refineTimerRef.current); refineTimerRef.current = null; }

    const speechEngine = getSpeechAPI();
    const useDeepgramCleanup = speechEngine === 'deepgram' || speechEngine === 'wispr';

    // Collect final audio segment before cleanup
    const recorder = mediaRecorderRef.current;
    let finalBlob: Blob | null = null;
    if (recorder && recorder.state === 'recording') {
      finalBlob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
        recorder.stop();
      });
    }

    cleanupResources();

    // Refine the final segment
    if (useDeepgramCleanup && finalBlob && finalBlob.size > 2000) {
      setRecState('transcribing');
      onProcessingRef.current?.(true);
      try {
        const formData = new FormData();
        formData.append('audio', finalBlob, `segment.${getFileExtension(mimeTypeRef.current)}`);
        formData.append('mode', 'dictation');
        const res = await fetch(getTranscribeEndpoint(speechEngine), { method: 'POST', body: formData });
        if (res.ok) {
          const { text } = await res.json();
          if (text?.trim()) {
            refinedTextRef.current = refinedTextRef.current
              ? `${refinedTextRef.current} ${text.trim()}`
              : text.trim();
          }
        }
      } catch {}
    }

    // Show fully refined text if we have it, otherwise keep Web Speech text
    if (refinedTextRef.current) {
      onInterimRef.current?.(refinedTextRef.current);
    }

    onProcessingRef.current?.(false);
    accumulatedTextRef.current = '';
    refinedTextRef.current = '';
    refineCountRef.current = 0;
    setRecState('idle');
  }, [cleanupResources]);

  // --- Stop medicalize (hold release) → single-shot transcribe + medicalize ---
  const stopMedicalizeHold = useCallback(async () => {
    cleanupResources();
    setRecState('transcribing');

    const blob = await collectAudioBlob();

    if (blob && blob.size > 2000) {
      try {
        const formData = new FormData();
        formData.append('audio', blob, `recording.${getFileExtension(mimeTypeRef.current)}`);
        formData.append('mode', 'dictation');

        const transcribeEngine = getTranscribeAPI();
        const useExternalSTT = transcribeEngine === 'deepgram' || transcribeEngine === 'wispr';

        if (useExternalSTT) {
          const sttRes = await fetch(getTranscribeEndpoint(transcribeEngine), { method: 'POST', body: formData });
          if (sttRes.ok) {
            const { text: sttText } = await sttRes.json();
            if (sttText?.trim()) {
              const medRes = await fetch('/api/medicalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: sttText.trim() }),
              });
              if (medRes.ok) {
                const { text: medText } = await medRes.json();
                onInterimRef.current?.((medText?.trim()) || sttText.trim());
              } else {
                onInterimRef.current?.(sttText.trim());
              }
            }
          }
        } else {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          if (res.ok) {
            const { text } = await res.json();
            if (text?.trim()) onInterimRef.current?.(text.trim());
          }
        }
      } catch {}
    }

    setRecState('idle');
  }, [cleanupResources, collectAudioBlob]);

  // =================================================================
  // ENCOUNTER MODE: Simple click toggle
  // =================================================================
  const startEncounterRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;

      onRecordingStart?.();
      onProcessingRef.current?.(true); // Signal: live/interim text
      startKeepalive();

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stopAudioLevelViz(); stopKeepalive(); stopWebSpeech();
        if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
        analyserRef.current = null;
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) { setRecState('idle'); return; }

        setRecState('transcribing');
        onProcessingRef.current?.(true); // Signal: refining transcript
        try {
          const formData = new FormData();
          formData.append('audio', blob, `recording.${getFileExtension(mimeType)}`);
          formData.append('mode', mode);

          const webEngine = getTranscribeWebAPI();
          const useExternalSTT = webEngine === 'deepgram' || webEngine === 'wispr';
          const res = await fetch(getTranscribeEndpoint(webEngine), { method: 'POST', body: formData });

          if (useExternalSTT && res.ok) {
            const { text: dgText } = await res.json();
            if (dgText?.trim()) {
              const medRes = await fetch('/api/medicalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: dgText.trim() }),
              });
              if (medRes.ok) {
                const { text } = await medRes.json();
                if (text?.trim()) onTranscript(text.trim());
              } else {
                onTranscript(dgText.trim());
              }
            }
          } else if (res.ok) {
            const { text } = await res.json();
            if (text?.trim()) onTranscript(text.trim());
          }
          onProcessingRef.current?.(false); // Signal: refinement done
        } catch (err: any) {
          onProcessingRef.current?.(false);
          console.error('Transcription error:', err);
        }
        setRecState('idle');
      };

      recorder.start();
      setRecState('recording');

      try {
        const vizCtx = new AudioContext();
        const vizSource = vizCtx.createMediaStreamSource(stream);
        const vizAnalyser = vizCtx.createAnalyser();
        vizAnalyser.fftSize = 2048;
        vizSource.connect(vizAnalyser);
        audioContextRef.current = vizCtx;
        analyserRef.current = vizAnalyser;
        startAudioLevelViz(vizAnalyser);
      } catch {}

      // Web Speech for live text
      const SpeechRecognitionAPI = typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
      if (SpeechRecognitionAPI && onInterimTranscript) {
        try {
          const recognition = new SpeechRecognitionAPI();
          recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
          let finalTranscript = '';
          recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (event.results[i].isFinal) { finalTranscript += event.results[i][0].transcript + ' '; }
              else { interim += event.results[i][0].transcript; }
            }
            onInterimTranscript((finalTranscript + interim).trim());
          };
          recognition.onerror = () => {};
          recognition.onend = () => { if (mediaRecorderRef.current?.state === 'recording') { try { recognition.start(); } catch {} } };
          recognition.start();
          recognitionRef.current = recognition;
        } catch {}
      }
    } catch {
      setRecState('error');
    }
  }, [onTranscript, onInterimTranscript, onRecordingStart, mode, startKeepalive, stopKeepalive, startAudioLevelViz, stopAudioLevelViz, stopWebSpeech]);

  // =================================================================
  // POINTER HANDLERS
  // =================================================================

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (stateRef.current === 'transcribing') return;

    // --- Encounter mode: simple toggle ---
    if (mode === 'encounter') {
      if (stateRef.current === 'recording') {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } else {
        startEncounterRecording();
      }
      return;
    }

    // --- Dictation mode ---

    // If already recording in toggle mode → stop
    if (stateRef.current === 'recording' && toggleModeRef.current) {
      toggleModeRef.current = false;
      stopNonMedicalize();
      return;
    }

    // Only start if idle/error
    if (stateRef.current !== 'idle' && stateRef.current !== 'error') return;

    pressActiveRef.current = true;
    toggleModeRef.current = false;
    isHoldingRef.current = false;
    setIsHolding(false);

    // Start recording + Web Speech immediately
    // (Web Speech output is suppressed when isHoldingRef becomes true)
    startDictationRecording();

    // Hold timer: if still pressing after 500ms → medicalize mode
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      if (pressActiveRef.current) {
        isHoldingRef.current = true;
        setIsHolding(true);
        // Stop Web Speech — we don't want any text during hold
        stopWebSpeech();
        // Clear any text that Web Speech may have shown in the brief window
        accumulatedTextRef.current = '';
        onInterimRef.current?.('');
      }
    }, 500);
  }, [mode, startEncounterRecording, startDictationRecording, stopNonMedicalize, stopWebSpeech]);

  const handlePointerUp = useCallback(() => {
    if (mode === 'encounter') return;

    pressActiveRef.current = false;
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }

    if (stateRef.current !== 'recording') return;

    if (isHoldingRef.current) {
      // Was holding → medicalize: stop and process full audio
      setIsHolding(false);
      isHoldingRef.current = false;
      stopMedicalizeHold();
    } else {
      // Short tap → non-medicalize toggle mode
      // Web Speech is already running and showing text.
      // Recording continues — user clicks again to stop.
      toggleModeRef.current = true;
    }
  }, [mode, stopMedicalizeHold]);

  // --- File upload ---
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setRecState('transcribing');
    try {
      const formData = new FormData();
      formData.append('audio', file, file.name);
      formData.append('mode', mode);
      const res = await fetch(getTranscribeEndpoint(getTranscribeWebAPI()), { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Transcription failed');
      const { text } = await res.json();
      if (text?.trim()) onTranscript(text.trim());
      setRecState('idle');
    } catch {
      setRecState('error');
    }
  }, [onTranscript, mode]);

  // --- Render ---

  const recordingStyle = state === 'recording' ? (() => {
    const v = Math.pow(audioLevel, 0.6);
    const r = Math.round(40 + v * 10);
    const g = Math.round(140 + v * 80);
    const b = Math.round(220 - v * 40);
    const c = `${r}, ${g}, ${b}`;
    return {
      backgroundColor: `rgba(${c}, ${0.10 + v * 0.08})`,
      boxShadow: [
        `0 0 0 ${1 + v * 2.5}px rgba(${c}, ${0.22 + v * 0.23})`,
        `0 0 ${3 + v * 8}px rgba(${c}, ${0.06 + v * 0.14})`,
        `0 0 ${6 + v * 14}px rgba(${c}, ${0.02 + v * 0.06})`,
      ].join(', '),
      transform: `scale(${1 + v * 0.05})`,
      transition: 'all 0.12s cubic-bezier(0.4, 0, 0.2, 1)',
    };
  })() : undefined;

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={disabled || state === 'transcribing'}
        className={`p-2.5 min-w-[44px] min-h-[44px] rounded-full select-none touch-none flex items-center justify-center ${
          state === 'recording'
            ? 'text-red-500'
            : state === 'transcribing'
            ? 'text-blue-500 animate-pulse'
            : state === 'error'
            ? 'text-red-400'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
        } disabled:opacity-50`}
        style={recordingStyle}
        title={
          state === 'recording'
            ? (isHolding ? 'Release to medicalize' : 'Click to stop')
          : state === 'transcribing' ? 'Processing...'
          : mode === 'encounter'
            ? 'Click to record encounter'
            : 'Tap to dictate. Hold for AI medicalize.'
        }
      >
        {isHolding
          ? <Stethoscope className="w-5 h-5" />
          : <Mic className="w-5 h-5" />
        }
      </button>
      {showUpload && state === 'idle' && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-50"
            title="Upload audio file"
          >
            <Upload className="w-4 h-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
        </>
      )}
    </span>
  );
}
