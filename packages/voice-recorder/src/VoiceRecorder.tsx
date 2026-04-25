import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Upload, Stethoscope } from 'lucide-react';
import { convertSpokenPunctuation } from './spoken-punctuation';
import { encryptAudioBlob } from './encryption';
import { sensitivitySettings, buildAudioConstraints, getMimeType, getFileExtension } from './utils';
import type { VoiceRecorderProps, RecorderState, EndpointConfig } from './types';

function getTranscribeEndpoint(endpoints: EndpointConfig, api: string): string {
  if (api === 'deepgram') return endpoints.transcribeDeepgram;
  if (api === 'elevenlabs') return endpoints.transcribeElevenlabs;
  if (api === 'wispr') return endpoints.transcribeWispr;
  return endpoints.transcribeDefault;
}

export function VoiceRecorder({
  onTranscript, onInterimTranscript, onRecordingStart, onRecordingStop, onProcessingChange, onAudioLevel,
  onMedicalizeStart, onBackupSaved, onBlobBackup, encryptionKey,
  disabled, mode = 'dictation', compact, showUpload, sheetName, sensitivity: sensitivityProp, micGain, pocketMode, medicalizeGesture = 'hold',
  patientName,
  endpoints, getSpeechEngine, getTranscribeEngine, getEncounterEngine,
  nativeBridge, uploadBlob,
}: VoiceRecorderProps) {
  // Resolve sensitivity: prefer explicit prop, fall back to micGain (clamped to 1-4), default 2
  const sensitivity = sensitivityProp ?? (micGain ? Math.max(1, Math.min(4, Math.round(micGain))) : 2);
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

  // Periodic segment refinement refs (Deepgram/Wispr cleanup during dictation)
  const refineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refinedTextRef = useRef('');
  const segmentStartRef = useRef(0);
  const refineCountRef = useRef(0);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechRef = useRef(0);

  const [isHolding, setIsHolding] = useState(false);
  const isHoldingRef = useRef(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Swipe-to-medicalize state
  const pointerStartXRef = useRef(0);
  const [swipeProgress, setSwipeProgress] = useState(0); // 0-1, how far right the user has dragged
  const swipeMedicalizeRef = useRef(false); // true once swipe threshold met
  const [snapBack, setSnapBack] = useState(false); // true during snap-back animation

  // Audio level visualization + WS connection state
  const [audioLevel, setAudioLevel] = useState(0);
  const [wsReady, setWsReady] = useState(false);
  const animFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // iOS keepalive
  const keepaliveAudioRef = useRef<HTMLAudioElement | null>(null);

  // Token prefetch refs (ElevenLabs)
  const prefetchedTokenRef = useRef<string | null>(null);
  const prefetchTokenTimestamp = useRef(0);

  // Stable callback refs
  const onInterimRef = useRef(onInterimTranscript);
  onInterimRef.current = onInterimTranscript;
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onRecordingStopRef = useRef(onRecordingStop);
  onRecordingStopRef.current = onRecordingStop;
  const onProcessingRef = useRef(onProcessingChange);
  onProcessingRef.current = onProcessingChange;
  const onAudioLevelRef = useRef(onAudioLevel);
  onAudioLevelRef.current = onAudioLevel;
  const onMedicalizeStartRef = useRef(onMedicalizeStart);
  onMedicalizeStartRef.current = onMedicalizeStart;

  const useStreaming = mode === 'dictation' && !!onInterimTranscript;

  const audioConstraints = buildAudioConstraints(mode, sensitivity, pocketMode);

  // Create a gain-boosted MediaStream for recording.
  // Uses sensitivitySettings() for tuned compressor presets; pocket mode overrides.
  const createBoostedStream = (stream: MediaStream, sens: number = sensitivity): {
    boostedStream: MediaStream; ctx: AudioContext; gainNode: GainNode; compressor: DynamicsCompressorNode;
  } => {
    const settings = pocketMode
      ? { gain: Math.min(sens * 2, 6.0), threshold: -60, ratio: 20, knee: 30, release: 0.15 }
      : sensitivitySettings(sens);
    const ctx = new AudioContext({ sampleRate: 48000 });
    const source = ctx.createMediaStreamSource(stream);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = settings.threshold;
    compressor.knee.value = settings.knee;
    compressor.ratio.value = settings.ratio;
    compressor.attack.value = 0;
    compressor.release.value = settings.release;

    const gainNode = ctx.createGain();
    gainNode.gain.value = settings.gain;

    source.connect(compressor);
    compressor.connect(gainNode);

    const dest = ctx.createMediaStreamDestination();
    gainNode.connect(dest);

    return { boostedStream: dest.stream, ctx, gainNode, compressor };
  };

  useEffect(() => {
    if (state === 'error') {
      const t = setTimeout(() => setRecState('idle'), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Pre-fetch ElevenLabs token on mount for faster dictation start
  useEffect(() => {
    if (getSpeechEngine() === 'elevenlabs' || getEncounterEngine() === 'elevenlabs') {
      fetch(endpoints.elevenlabsToken).then(r => r.ok ? r.json() : null).then(data => {
        if (data?.token) { prefetchedTokenRef.current = data.token; prefetchTokenTimestamp.current = Date.now(); }
      }).catch(() => {});
    }
  }, []);

  // Register encounter control handler for Live Activity deep links (iOS)
  useEffect(() => {
    if (mode !== 'encounter') return;
    const cleanup = nativeBridge?.registerEncounterControl?.((control: string) => {
      if (control === 'stop') {
        // Stop encounter recording from Live Activity
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } else if (control === 'pause') {
        // Pause: stop Web Speech, keep MediaRecorder going
        if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
        if (encounterTimerRef.current) { clearInterval(encounterTimerRef.current); encounterTimerRef.current = null; }
        nativeBridge?.updateLiveActivity?.({ type: 'encounter', elapsedSeconds: encounterSecondsRef.current, isPaused: true, isPocketMode: pocketModeRef.current, audioLevel: 0 });
      } else if (control === 'resume') {
        // Resume: restart Web Speech and timer
        // Re-start timer
        encounterTimerRef.current = setInterval(() => {
          encounterSecondsRef.current += 1;
          nativeBridge?.updateLiveActivity?.({ type: 'encounter', elapsedSeconds: encounterSecondsRef.current, isPaused: false, isPocketMode: pocketModeRef.current, audioLevel: 0 });
        }, 1000);
        nativeBridge?.updateLiveActivity?.({ type: 'encounter', elapsedSeconds: encounterSecondsRef.current, isPaused: false, isPocketMode: pocketModeRef.current, audioLevel: 0 });
      } else if (control === 'pocket' || control === 'pocket-on' || control === 'pocket-off') {
        // Toggle pocket mode — dispatched as custom event for parent to handle
        const enable = control === 'pocket-on' ? true : control === 'pocket-off' ? false : !pocketModeRef.current;
        window.dispatchEvent(new CustomEvent('nativePocketMode', { detail: { enabled: enable } }));
      }
    });
    return cleanup || undefined;
  }, [mode]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (dgSocketRef.current) { try { dgSocketRef.current.close(); } catch {} }
      if (dgProcessorRef.current) { try { dgProcessorRef.current.disconnect(); } catch {} }
      if (dgContextRef.current) { try { dgContextRef.current.close(); } catch {} }
      if (keepaliveAudioRef.current) { keepaliveAudioRef.current.pause(); keepaliveAudioRef.current = null; }
      if (encounterTimerRef.current) clearInterval(encounterTimerRef.current);
    };
  }, []);

  // --- iOS native bridge ---
  const isNative = typeof window !== 'undefined' && (nativeBridge?.isNative?.() ?? false);
  const encounterTimerRef = useRef<NodeJS.Timeout | null>(null);
  const encounterSecondsRef = useRef(0);
  const pocketModeRef = useRef(pocketMode);
  pocketModeRef.current = pocketMode;

  // --- iOS keepalive (skip in native iOS app — native side handles audio session) ---

  const startKeepalive = useCallback(() => {
    try {
      if (isNative) return; // Native app manages audio session — no keepalive needed (avoids Now Playing widget)
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

  // --- Audio level viz ---
  const startAudioLevelViz = useCallback((analyser: AnalyserNode) => {
    const timeData = new Float32Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      // RMS level from time-domain data
      analyser.getFloatTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
      const rms = Math.sqrt(sum / timeData.length);
      // Logarithmic dB scaling — very sensitive to catch quiet iPad mic input.
      // Raw stream RMS on iPad is often 0.001-0.01 for normal speech (-60 to -40 dB).
      // Floor at -70dB so even whisper-level input shows some movement.
      const db = rms > 0.00001 ? 20 * Math.log10(rms) : -100;
      const level = Math.min(1, Math.max(0, (db + 70) / 55)); // -70dB→0, -15dB→1
      setAudioLevel(level);

      // Frequency band analysis for external callback
      analyser.getByteFrequencyData(freqData);
      const binCount = freqData.length;
      const lowEnd = Math.floor(binCount * 0.15);
      const highStart = Math.floor(binCount * 0.4);
      const highEnd = Math.floor(binCount * 0.7);
      let lowSum = 0, highSum = 0;
      for (let i = 0; i < lowEnd; i++) lowSum += freqData[i];
      for (let i = highStart; i < highEnd; i++) highSum += freqData[i];
      const lowFreq = Math.min(1, (lowSum / lowEnd) / 100);
      const highFreq = Math.min(1, (highSum / (highEnd - highStart)) / 100);
      const speakerHint: 'near' | 'far' | 'silent' = level > 0.03 ? 'near' : 'silent';

      onAudioLevelRef.current?.({ level, lowFreq, highFreq, speakerHint });
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAudioLevelViz = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    setAudioLevel(0);
    onAudioLevelRef.current?.({ level: 0, lowFreq: 0, highFreq: 0, speakerHint: 'silent' });
  }, []);

  // --- Stop Web Speech / ElevenLabs real-time ---
  const elWsRef = useRef<WebSocket | null>(null);
  const elProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Deepgram WebSocket streaming refs
  const dgSocketRef = useRef<WebSocket | null>(null);
  const dgProcessorRef = useRef<AudioNode | null>(null);
  const dgContextRef = useRef<AudioContext | null>(null);

  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
    // Stop ElevenLabs WebSocket — close without commit flush to avoid duplicate text
    if (elWsRef.current) {
      try { elWsRef.current.close(); } catch {}
      elWsRef.current = null;
    }
    if (elProcessorRef.current) { try { elProcessorRef.current.disconnect(); } catch {} elProcessorRef.current = null; }
  }, []);

  // --- Stop Deepgram WebSocket streaming ---
  const stopDeepgramStream = useCallback(() => {
    if (dgProcessorRef.current) { try { dgProcessorRef.current.disconnect(); } catch {} dgProcessorRef.current = null; }
    if (dgContextRef.current) { try { dgContextRef.current.close(); } catch {} dgContextRef.current = null; }
    if (dgSocketRef.current) {
      try {
        if (dgSocketRef.current.readyState === WebSocket.OPEN) {
          dgSocketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        }
        dgSocketRef.current.close();
      } catch {}
      dgSocketRef.current = null;
    }
  }, []);

  // --- Start Deepgram WebSocket streaming for real-time live text ---
  const startDeepgramStream = useCallback(async (audioStream: MediaStream, isEncounterMode: boolean): Promise<boolean> => {
    try {
      console.log('[VoiceRecorder] Starting Deepgram WS...');
      const tokenRes = await fetch(endpoints.deepgramToken);
      if (!tokenRes.ok) return false;
      const { key } = await tokenRes.json();
      if (!key) return false;

      const params = new URLSearchParams({
        model: 'nova-3-medical',
        language: 'en',
        smart_format: 'true',
        punctuate: 'true',
        interim_results: 'true',
        filler_words: 'false',
        vad_events: 'true',
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
      });
      if (isEncounterMode) params.set('diarize', 'true');

      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['token', key]);
      dgSocketRef.current = ws;
      let finalTranscript = '';

      ws.onmessage = (event) => {
        if (isHoldingRef.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];
            const text = alt.transcript || '';
            const isFinal = data.is_final;
            if (isFinal && text) {
              finalTranscript += (finalTranscript ? ' ' : '') + text;
              const converted = convertSpokenPunctuation(finalTranscript);
              accumulatedTextRef.current = converted;
              onInterimRef.current?.(converted);
              onProcessingRef.current?.(false);
            } else if (text) {
              const convertedFinal = finalTranscript ? convertSpokenPunctuation(finalTranscript) : '';
              const display = convertedFinal ? `${convertedFinal} ${text}` : text;
              accumulatedTextRef.current = display;
              onInterimRef.current?.(display);
              onProcessingRef.current?.(true);
            }
          }
        } catch {}
      };

      ws.onerror = () => {};
      ws.onclose = () => { dgSocketRef.current = null; };

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        const timeout = setTimeout(() => reject(new Error('WS timeout')), 5000);
        const origClose = ws.onclose;
        ws.onclose = (e) => { clearTimeout(timeout); reject(new Error('WS closed')); if (origClose) (origClose as any)(e); };
      });

      console.log('[VoiceRecorder] Deepgram WS connected');
      setWsReady(true);

      // AudioContext at 16kHz for PCM conversion
      const ctx = new AudioContext({ sampleRate: 16000 });
      dgContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(audioStream);

      // AudioWorklet (modern) with ScriptProcessor fallback
      try {
        await ctx.audioWorklet.addModule('/pcm-processor.js');
        const workletNode = new AudioWorkletNode(ctx, 'pcm-processor');
        workletNode.port.onmessage = (e) => { if (ws.readyState === WebSocket.OPEN) ws.send(e.data); };
        source.connect(workletNode);
        workletNode.connect(ctx.destination);
        dgProcessorRef.current = workletNode;
      } catch {
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          ws.send(int16.buffer);
        };
        source.connect(processor);
        processor.connect(ctx.destination);
        dgProcessorRef.current = processor;
      }

      return true;
    } catch (e) {
      console.warn('[VoiceRecorder] Deepgram WS failed:', e);
      stopDeepgramStream();
      return false;
    }
  }, [stopDeepgramStream]);

  // --- Start live transcription (Web Speech or ElevenLabs real-time) ---
  const startWebSpeech = useCallback(() => {
    const speechEngine = getSpeechEngine();

    // --- ElevenLabs real-time WebSocket (Scribe v2 realtime) ---
    if (speechEngine === 'elevenlabs') {
      let retryCount = 0;
      const MAX_RETRIES = 1;

      const connectElevenLabs = async () => {
        try {
          console.log('[VoiceRecorder] Starting ElevenLabs WS...');
          // Use prefetched token if fresh (<55s), otherwise fetch new
          let token = (prefetchedTokenRef.current && Date.now() - prefetchTokenTimestamp.current < 55000)
            ? prefetchedTokenRef.current : null;
          prefetchedTokenRef.current = null; // consume

          if (!token) {
            const tokenRes = await fetch(endpoints.elevenlabsToken);
            if (!tokenRes.ok) { console.warn('[VoiceRecorder] ElevenLabs token failed, falling back to Web Speech'); startNativeWebSpeech(); return; }
            const tokenData = await tokenRes.json();
            token = tokenData.token;
          }
          if (!token) { startNativeWebSpeech(); return; }

          // Pre-fetch next token in background (ready for next recording)
          fetch(endpoints.elevenlabsToken).then(r => r.ok ? r.json() : null).then(data => {
            if (data?.token) { prefetchedTokenRef.current = data.token; prefetchTokenTimestamp.current = Date.now(); }
          }).catch(() => {});

          // Build WebSocket URL with signed token
          const wsParams = new URLSearchParams({
            model_id: 'scribe_v2_realtime',
            language_code: 'en',
            token,
          });
          const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${wsParams}`;

          const ws = new WebSocket(wsUrl);
          elWsRef.current = ws;
          let fullTranscript = '';
          let elAudioCtx: AudioContext | null = null;

          ws.onmessage = (event) => {
            if (isHoldingRef.current) return;
            try {
              const msg = JSON.parse(event.data);
              const msgType = msg.message_type || msg.type;
              // ElevenLabs realtime response types
              if (msgType === 'partial_transcript') {
                const text = msg.text || '';
                const full = convertSpokenPunctuation((fullTranscript + text).trim());
                // Always save latest text so it's available when recording stops
                accumulatedTextRef.current = full;
                onInterimRef.current?.(full);
              } else if (msgType === 'committed_transcript' || msgType === 'committed_transcript_with_timestamps') {
                const text = msg.text || '';
                fullTranscript += text + ' ';
                const full = convertSpokenPunctuation(fullTranscript.trim());
                accumulatedTextRef.current = full;
                onInterimRef.current?.(full);
              } else if (msgType === 'session_started') {
                console.log('[VoiceRecorder] ElevenLabs WS session started');
                setWsReady(true);
              } else if (msgType === 'error') {
                console.error('ElevenLabs realtime error:', msg);
              }
            } catch {}
          };

          ws.onopen = async () => {
            retryCount = 0;
            if (!streamRef.current) return;
            console.log('[VoiceRecorder] ElevenLabs WS connected');
            // Capture audio at 16kHz with gain boost
            elAudioCtx = new AudioContext({ sampleRate: 16000 });
            const source = elAudioCtx.createMediaStreamSource(streamRef.current);
            const elGain = elAudioCtx.createGain();
            elGain.gain.value = sensitivitySettings(sensitivity).gain;
            source.connect(elGain);

            // Helper: send PCM16 as base64 JSON
            const sendPCM = (int16buf: ArrayBuffer) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              const bytes = new Uint8Array(int16buf);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              ws.send(JSON.stringify({
                message_type: 'input_audio_chunk',
                audio_base_64: btoa(binary),
                sample_rate: 16000,
                commit: false,
              }));
            };

            // AudioWorklet (modern) with ScriptProcessor fallback
            try {
              await elAudioCtx.audioWorklet.addModule('/pcm-processor.js');
              const workletNode = new AudioWorkletNode(elAudioCtx, 'pcm-processor');
              workletNode.port.onmessage = (e) => sendPCM(e.data);
              elGain.connect(workletNode);
              workletNode.connect(elAudioCtx.destination);
              elProcessorRef.current = workletNode as any;
            } catch {
              const processor = elAudioCtx.createScriptProcessor(4096, 1, 1);
              processor.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0);
                const pcm = new Int16Array(input.length);
                for (let i = 0; i < input.length; i++) {
                  pcm[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
                }
                sendPCM(pcm.buffer);
              };
              elGain.connect(processor);
              processor.connect(elAudioCtx.destination);
              elProcessorRef.current = processor;
            }
          };

          ws.onerror = (e) => { console.warn('ElevenLabs WebSocket error:', e); };

          ws.onclose = (e) => {
            console.warn('ElevenLabs WebSocket closed:', e.code, e.reason);
            elWsRef.current = null;
            if (elAudioCtx) { try { elAudioCtx.close(); } catch {} }
            // Reconnect if still recording and haven't exceeded retries
            if (stateRef.current === 'recording' && streamRef.current && retryCount < MAX_RETRIES) {
              retryCount++;
              console.log(`ElevenLabs WebSocket reconnecting (attempt ${retryCount})...`);
              setTimeout(connectElevenLabs, 1000);
            } else if (stateRef.current === 'recording' && streamRef.current) {
              console.warn('ElevenLabs reconnect failed, falling back to Web Speech');
              startNativeWebSpeech();
            }
          };
        } catch (e) {
          console.warn('ElevenLabs real-time failed, falling back to Web Speech:', e);
          startNativeWebSpeech();
        }
      };

      connectElevenLabs();
      return;
    }

    // --- Native Web Speech API fallback ---
    startNativeWebSpeech();
  }, []);

  const startNativeWebSpeech = useCallback(() => {
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

        // Show refined text if available, otherwise raw Web Speech
        if (refinedTextRef.current && full.length > refinedTextRef.current.length) {
          onInterimRef.current?.(refinedTextRef.current + ' ' + full.slice(refinedTextRef.current.length).trim());
          onProcessingRef.current?.(true);
        } else if (refinedTextRef.current) {
          onInterimRef.current?.(refinedTextRef.current);
        } else {
          onInterimRef.current?.(full);
          if (!hasNewFinal || interim) onProcessingRef.current?.(true);
        }

        // Pause detection: 1.5s silence marks text as settled
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        if (hasNewFinal && !interim) {
          onProcessingRef.current?.(false);
        } else {
          pauseTimerRef.current = setTimeout(() => {
            if (stateRef.current === 'recording' && !stoppingRef.current) onProcessingRef.current?.(false);
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
    setWsReady(false);
    stopAudioLevelViz();
    stopKeepalive();
    stopWebSpeech();
    stopDeepgramStream();
    if (refineTimerRef.current) { clearInterval(refineTimerRef.current); refineTimerRef.current = null; }
    if (pauseTimerRef.current) { clearTimeout(pauseTimerRef.current); pauseTimerRef.current = null; }
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
    if (boostCtxRef.current) { try { boostCtxRef.current.close(); } catch {} boostCtxRef.current = null; }
    boostGainRef.current = null;
    boostCompressorRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, [stopAudioLevelViz, stopKeepalive, stopWebSpeech, stopDeepgramStream]);

  // --- Collect audio blob from MediaRecorder ---
  const collectAudioBlob = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;
    return new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
      recorder.stop();
    });
  }, []);

  // --- Flush current audio segment for Deepgram/Wispr refinement ---
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

    // Send blob for STT refinement (verbatim only, no medicalize)
    if (blob.size > 2000) {
      try {
        const transcribeEngine = getTranscribeEngine();
        const useExternal = transcribeEngine === 'deepgram' || transcribeEngine === 'wispr';
        if (!useExternal) return;

        const formData = new FormData();
        formData.append('audio', blob, `segment.${getFileExtension(mimeTypeRef.current)}`);
        formData.append('mode', 'dictation');
        formData.append('skipMedicalize', 'true');
        if (refinedTextRef.current) {
          formData.append('context', refinedTextRef.current.split(/\s+/).slice(-50).join(' '));
        }
        const endpoint = transcribeEngine === 'deepgram' ? endpoints.transcribeDeepgram : endpoints.transcribeWispr;
        const res = await fetch(endpoint, { method: 'POST', body: formData });
        if (res.ok && !stoppingRef.current) {
          const { text } = await res.json();
          if (text?.trim()) {
            refinedTextRef.current = refinedTextRef.current ? `${refinedTextRef.current} ${text.trim()}` : text.trim();
            refineCountRef.current++;
            if (!stoppingRef.current) {
              const wsLen = accumulatedTextRef.current?.length || 0;
              if (refinedTextRef.current.length >= wsLen * 0.6) {
                onInterimRef.current?.(refinedTextRef.current);
                onProcessingRef.current?.(false);
              }
            }
          }
        }
      } catch {}
    }
  }, []);

  // --- Backup recording to Vercel Blob (fire-and-forget) ---
  const backupToBlob = useCallback(async (audioBlob: Blob, recMode: string) => {
    if (!audioBlob || audioBlob.size < 2000) return; // skip tiny/empty
    try {
      const contentType = mimeTypeRef.current || 'audio/webm';
      const folder = sheetName ? encodeURIComponent(sheetName) : 'unknown';
      if (!uploadBlob) return;

      if (encryptionKey && recMode === 'encounter') {
        // Encrypted backup for encounter recordings
        const { encrypted, ivBase64 } = await encryptAudioBlob(audioBlob, encryptionKey);
        const filename = `audio-backup/${folder}/encounter-${Date.now()}.enc`;
        const result = await uploadBlob(filename, encrypted);
        onBlobBackup?.(result.url, ivBase64, contentType);
        onBackupSaved?.(result.url);
      } else {
        // Unencrypted backup (dictation, or no key available)
        const ext = contentType.includes('mp4') ? 'mp4' : 'webm';
        const filename = `audio-backup/${folder}/${recMode}-${Date.now()}.${ext}`;
        const result = await uploadBlob(filename, audioBlob);
        onBackupSaved?.(result.url);
      }
    } catch (e) {
      console.warn('Audio backup failed (non-critical):', e);
    }
  }, [sheetName, onBackupSaved, onBlobBackup, encryptionKey]);

  // =================================================================
  // DICTATION MODE: Start recording (mic + MediaRecorder + Web Speech)
  // Web Speech starts immediately for instant text, but its output is
  // suppressed if the user holds past 500ms (medicalize mode).
  // =================================================================
  const boostCtxRef = useRef<AudioContext | null>(null);
  const boostGainRef = useRef<GainNode | null>(null);
  const boostCompressorRef = useRef<DynamicsCompressorNode | null>(null);

  // Live-update boost gain/compressor when sensitivity changes mid-recording
  useEffect(() => {
    if (boostGainRef.current && boostCompressorRef.current && state === 'recording') {
      const settings = pocketMode
        ? { gain: Math.min(sensitivity * 2, 6.0), threshold: -60, ratio: 20, knee: 30, release: 0.15 }
        : sensitivitySettings(sensitivity);
      boostGainRef.current.gain.setTargetAtTime(settings.gain, boostGainRef.current.context.currentTime, 0.05);
      boostCompressorRef.current.threshold.setTargetAtTime(settings.threshold, boostCompressorRef.current.context.currentTime, 0.05);
      boostCompressorRef.current.ratio.setTargetAtTime(settings.ratio, boostCompressorRef.current.context.currentTime, 0.05);
      boostCompressorRef.current.knee.setTargetAtTime(settings.knee, boostCompressorRef.current.context.currentTime, 0.05);
    }
  }, [sensitivity, state, pocketMode]);

  const startDictationRecording = useCallback(async () => {
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      streamRef.current = rawStream;
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;

      onRecordingStart?.();
      startKeepalive();

      // Create gain-boosted stream for recording
      const { boostedStream, ctx: boostCtx, gainNode, compressor } = createBoostedStream(rawStream);
      boostCtxRef.current = boostCtx;
      boostGainRef.current = gainNode;
      boostCompressorRef.current = compressor;

      // Start MediaRecorder on boosted stream
      const recorder = new MediaRecorder(boostedStream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(10000);

      accumulatedTextRef.current = '';
      refinedTextRef.current = '';
      refineCountRef.current = 0;
      stoppingRef.current = false;
      segmentStartRef.current = Date.now();
      setRecState('recording');

      // Engine cascade: try selected engine WS, fall back to Web Speech + periodic refinement
      const speechEngine = getSpeechEngine();
      let streamSuccess = false;

      if (speechEngine === 'elevenlabs') {
        // ElevenLabs WS handled by startWebSpeech which calls connectElevenLabs
        startWebSpeech();
        streamSuccess = true; // ElevenLabs handles its own fallback to Web Speech
      } else if (speechEngine === 'deepgram') {
        streamSuccess = await startDeepgramStream(rawStream, false);
        if (!streamSuccess) {
          console.log('[VoiceRecorder] Deepgram WS failed, falling back to Web Speech + refinement');
        }
      }

      if (!streamSuccess && speechEngine !== 'elevenlabs') {
        // Fallback: Web Speech + periodic segment refinement
        startNativeWebSpeech();
        if (refineTimerRef.current) clearInterval(refineTimerRef.current);
        refineTimerRef.current = setInterval(() => {
          if (!stoppingRef.current && !isHoldingRef.current) flushSegmentForRefinement();
        }, 8000);
      }

      // Visualize boosted stream so quiet voices register on iPad
      try {
        const vizCtx = new AudioContext();
        const vizSource = vizCtx.createMediaStreamSource(boostedStream);
        const vizAnalyser = vizCtx.createAnalyser();
        vizAnalyser.fftSize = 2048;
        vizAnalyser.smoothingTimeConstant = 0.3;
        vizSource.connect(vizAnalyser);
        audioContextRef.current = vizCtx;
        analyserRef.current = vizAnalyser;
        startAudioLevelViz(vizAnalyser);
      } catch {}
    } catch {
      setRecState('error');
    }
  }, [onRecordingStart, startKeepalive, startWebSpeech, startNativeWebSpeech, startDeepgramStream, startAudioLevelViz, flushSegmentForRefinement]);

  // --- Stop non-medicalize (toggle mode) ---
  const stopNonMedicalize = useCallback(async () => {
    // Stop refinement timer first
    if (refineTimerRef.current) { clearInterval(refineTimerRef.current); refineTimerRef.current = null; }

    const speechEngine = getSpeechEngine();
    const transcribeEngine = getTranscribeEngine();
    const useExternalCleanup = transcribeEngine === 'deepgram' || transcribeEngine === 'wispr';

    // Collect final audio blob BEFORE cleanup (cleanup kills the stream)
    const recorder = mediaRecorderRef.current;
    let finalBlob: Blob | null = null;
    if (recorder && recorder.state === 'recording') {
      finalBlob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
        recorder.stop();
      });
    }

    const webSpeechText = accumulatedTextRef.current || '';

    cleanupResources();

    // ElevenLabs realtime: show live text immediately, then re-transcribe
    // with medical keyterms in background for improved accuracy
    if (speechEngine === 'elevenlabs' && webSpeechText.length > 0) {
      onTranscript(webSpeechText);

      // Background: re-transcribe with keyterms (replace via onInterimRef, not append)
      if (finalBlob && finalBlob.size > 2000) {
        backupToBlob(finalBlob, 'dictation');
        (async () => {
          try {
            const fd = new FormData();
            fd.append('audio', finalBlob!, `recording.${getFileExtension(mimeTypeRef.current)}`);
            fd.append('mode', 'dictation');
            if (sheetName) fd.append('sheetName', sheetName);
            const res = await fetch(endpoints.transcribeElevenlabs, { method: 'POST', body: fd });
            if (res.ok) {
              const { text } = await res.json();
              if (text?.trim() && text.trim() !== webSpeechText.trim()) {
                onInterimRef.current?.(text.trim());
              }
            }
          } catch {}
        })();
      }

      onProcessingRef.current?.(false);
      accumulatedTextRef.current = '';
      refinedTextRef.current = '';
      refineCountRef.current = 0;
      setRecState('idle');
      return;
    }

    // STT-refine the final audio segment (verbatim only, no AI medicalize)
    if (useExternalCleanup && finalBlob && finalBlob.size > 2000) {
      setRecState('transcribing');
      onProcessingRef.current?.(true);
      try {
        const formData = new FormData();
        formData.append('audio', finalBlob, `segment.${getFileExtension(mimeTypeRef.current)}`);
        formData.append('mode', 'dictation');
        formData.append('skipMedicalize', 'true');
        const endpoint = transcribeEngine === 'deepgram' ? endpoints.transcribeDeepgram : endpoints.transcribeWispr;
        const res = await fetch(endpoint, { method: 'POST', body: formData });
        if (res.ok) {
          const { text } = await res.json();
          if (text?.trim()) {
            refinedTextRef.current = refinedTextRef.current ? `${refinedTextRef.current} ${text.trim()}` : text.trim();
          }
        }
      } catch {}
    }

    // Backup to blob storage
    if (finalBlob && finalBlob.size > 2000) backupToBlob(finalBlob, 'dictation');

    // Best text: refined (if long enough) or live WS/Web Speech text
    const dgWsText = accumulatedTextRef.current?.trim() || '';
    const refined = refinedTextRef.current?.trim() || '';

    if (refined && refined.length > dgWsText.length * 0.9) {
      onInterimRef.current?.(refined);
    }
    // Otherwise the WS / Web Speech text already in the field is the final output

    onProcessingRef.current?.(false);
    accumulatedTextRef.current = '';
    refinedTextRef.current = '';
    refineCountRef.current = 0;
    setRecState('idle');
  }, [cleanupResources, backupToBlob]);

  // --- Stop medicalize (hold release) → single-shot transcribe + medicalize ---
  const stopMedicalizeHold = useCallback(async () => {
    cleanupResources();
    setRecState('transcribing');

    const blob = await collectAudioBlob();

    // Backup to blob storage (fire-and-forget)
    if (blob && blob.size > 2000) backupToBlob(blob, 'medicalize');

    let finalMedText = '';

    if (blob && blob.size > 2000) {
      try {
        const formData = new FormData();
        formData.append('audio', blob, `recording.${getFileExtension(mimeTypeRef.current)}`);
        formData.append('mode', 'dictation');
        if (sheetName) formData.append('sheetName', sheetName);

        const transcribeEngine = getTranscribeEngine();
        const useExternalSTT = transcribeEngine === 'deepgram' || transcribeEngine === 'wispr' || transcribeEngine === 'elevenlabs';

        if (useExternalSTT) {
          const sttRes = await fetch(getTranscribeEndpoint(endpoints, transcribeEngine), { method: 'POST', body: formData });
          if (sttRes.ok) {
            const { text: sttText } = await sttRes.json();
            if (sttText?.trim()) {
              const medRes = await fetch(endpoints.medicalize, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: sttText.trim(), mode }),
              });
              if (medRes.ok) {
                const { text: medText } = await medRes.json();
                finalMedText = (medText?.trim()) || sttText.trim();
              } else {
                finalMedText = sttText.trim();
              }
            }
          }
        } else {
          // Whisper transcribe + medicalize
          const res = await fetch(endpoints.transcribeDefault, { method: 'POST', body: formData });
          if (res.ok) {
            const { text } = await res.json();
            if (text?.trim()) finalMedText = text.trim();
          }
        }
      } catch {}
    }

    // Always call onTranscript — even empty string clears processing state in parent
    if (finalMedText) {
      onTranscriptRef.current(finalMedText);
    } else {
      onTranscriptRef.current(''); // signal completion even if empty
    }
    onInterimRef.current?.('');

    setRecState('idle');
    onRecordingStopRef.current?.();
  }, [cleanupResources, collectAudioBlob, backupToBlob]);

  // =================================================================
  // ENCOUNTER MODE: Simple click toggle
  // =================================================================
  const startEncounterRecording = useCallback(async () => {
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      streamRef.current = rawStream;
      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType;

      onRecordingStart?.();
      startKeepalive();

      // Create gain-boosted stream for recording
      const { boostedStream, ctx: boostCtx, gainNode, compressor } = createBoostedStream(rawStream);
      boostCtxRef.current = boostCtx;
      boostGainRef.current = gainNode;
      boostCompressorRef.current = compressor;

      const recorderOptions: MediaRecorderOptions = { mimeType };
      if (mimeType.includes('webm')) recorderOptions.audioBitsPerSecond = 128000;
      const recorder = new MediaRecorder(boostedStream, recorderOptions);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        onRecordingStopRef.current?.();
        stopAudioLevelViz(); stopKeepalive(); stopWebSpeech(); stopDeepgramStream();
        if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
        if (boostCtxRef.current) { try { boostCtxRef.current.close(); } catch {} boostCtxRef.current = null; }
        analyserRef.current = null;
        rawStream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        // Notify native iOS app
        nativeBridge?.notifyRecordingStop?.();
        nativeBridge?.haptic?.('heavy');
        if (encounterTimerRef.current) { clearInterval(encounterTimerRef.current); encounterTimerRef.current = null; }
        nativeBridge?.stopLiveActivity?.({ type: 'encounter', elapsedSeconds: encounterSecondsRef.current });

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) { setRecState('idle'); onProcessingRef.current?.(false); return; }

        // Backup to blob storage (separate from transcription blob, persists on failure)
        backupToBlob(blob, 'encounter');

        setRecState('transcribing');
        onProcessingRef.current?.(true);
        try {
          // Upload encounter recordings to Vercel Blob, then route to user's selected engine.
          const webEngine = getEncounterEngine();
          const transcribeViaBlob = async (audioBlob: Blob): Promise<string> => {
            const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
            if (!uploadBlob) return '';
            const blobResult = await uploadBlob(`audio/enc-${Date.now()}.${ext}`, audioBlob);

            if (webEngine === 'elevenlabs') {
              // ElevenLabs: send blob URL via FormData (supports audio isolation + keyterms)
              const fd = new FormData();
              fd.append('blobUrl', blobResult.url);
              fd.append('mode', mode);
              if (sheetName) fd.append('sheetName', sheetName);
              const res = await fetch(endpoints.transcribeElevenlabs, { method: 'POST', body: fd });
              if (!res.ok) { console.error('ElevenLabs error:', res.status); return ''; }
              const { text } = await res.json();
              return text?.trim() || '';
            }

            // Route via transcribe-async with API selection
            const res = await fetch(endpoints.transcribeAsync, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blobUrl: blobResult.url, mode, contentType: mimeType, api: webEngine || 'deepgram' }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: 'Transcription failed' }));
              console.error('Transcribe-async error:', res.status, err);
              return '';
            }
            const { text } = await res.json();
            return text?.trim() || '';
          };

          let finalText = '';
          if (chunksRef.current.length > 30) {
            // Chunk long recordings into ~5 min segments for parallel transcription
            const CHUNK_GROUP = 30;
            const groups: Blob[][] = [];
            for (let i = 0; i < chunksRef.current.length; i += CHUNK_GROUP) {
              groups.push(chunksRef.current.slice(i, i + CHUNK_GROUP));
            }
            const results: string[] = new Array(groups.length).fill('');
            await Promise.all(groups.map(async (group, idx) => {
              const segBlob = new Blob(group, { type: mimeType });
              results[idx] = await transcribeViaBlob(segBlob);
            }));
            finalText = results.filter(Boolean).join(' ');
          } else {
            finalText = await transcribeViaBlob(blob);
          }

          if (finalText) {
            // Optional medicalize pass — pass mode so encounter gets speaker labels
            const webEngine = getEncounterEngine();
            const useExternalSTT = webEngine === 'deepgram' || webEngine === 'wispr' || webEngine === 'elevenlabs';
            if (useExternalSTT) {
              try {
                const medRes = await fetch(endpoints.medicalize, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: finalText, mode }),
                });
                if (medRes.ok) {
                  const { text } = await medRes.json();
                  if (text?.trim()) { onTranscript(text.trim()); } else { onTranscript(finalText); }
                } else { onTranscript(finalText); }
              } catch { onTranscript(finalText); }
            } else {
              onTranscript(finalText);
            }
          }
        } catch (err: any) {
          console.error('Transcription error:', err);
          // WiFi fallback: if transcription fails, use accumulated Web Speech text
          const fallbackText = accumulatedTextRef.current?.trim();
          if (fallbackText) {
            console.log('Using Web Speech fallback text due to transcription failure');
            onTranscript(fallbackText);
          }
        }
        onProcessingRef.current?.(false);
        setRecState('idle');
      };

      recorder.start(10000); // 10s timeslice for chunked transcription of long recordings
      setRecState('recording');

      // Notify native iOS app
      nativeBridge?.notifyRecordingStart?.();
      nativeBridge?.haptic?.('medium');
      encounterSecondsRef.current = 0;
      nativeBridge?.startLiveActivity?.({ type: 'encounter', patientName: patientName || 'Patient' });
      encounterTimerRef.current = setInterval(() => {
        encounterSecondsRef.current += 1;
        nativeBridge?.updateLiveActivity?.({
          type: 'encounter',
          elapsedSeconds: encounterSecondsRef.current,
          isPaused: false,
          isPocketMode: pocketModeRef.current,
          audioLevel: Math.min(3, Math.floor((audioLevel || 0) * 4)),
        });
      }, 1000);

      // Visualize the BOOSTED stream (not raw) so quiet voices are visible on iPad
      try {
        const vizCtx = new AudioContext();
        const vizSource = vizCtx.createMediaStreamSource(boostedStream);
        const vizAnalyser = vizCtx.createAnalyser();
        vizAnalyser.fftSize = 2048;
        vizAnalyser.smoothingTimeConstant = 0.3;
        vizSource.connect(vizAnalyser);
        audioContextRef.current = vizCtx;
        analyserRef.current = vizAnalyser;
        startAudioLevelViz(vizAnalyser);
      } catch {}

      // Live WS streaming during encounter (Deepgram with diarization or ElevenLabs)
      if (onInterimTranscript) {
        const webEngine = getEncounterEngine();
        let streamOk = false;
        if (webEngine === 'elevenlabs') {
          // ElevenLabs via startWebSpeech which calls connectElevenLabs
          startWebSpeech();
          streamOk = true;
        } else if (webEngine === 'deepgram') {
          streamOk = await startDeepgramStream(rawStream, true);
        }
        if (!streamOk && webEngine !== 'elevenlabs') {
          // Fallback: Web Speech
          const SpeechRecognitionAPI = typeof window !== 'undefined'
            ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            : null;
          if (SpeechRecognitionAPI) {
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
            const full = (finalTranscript + interim).trim();
            accumulatedTextRef.current = finalTranscript.trim(); // Store for WiFi fallback
            onInterimTranscript(full);
          };
              recognition.onerror = () => {};
              recognition.onend = () => { if (mediaRecorderRef.current?.state === 'recording') { try { recognition.start(); } catch {} } };
              recognition.start();
              recognitionRef.current = recognition;
            } catch {}
          }
        }
      }
    } catch {
      setRecState('error');
    }
  }, [onTranscript, onInterimTranscript, onRecordingStart, mode, startKeepalive, stopKeepalive, startAudioLevelViz, stopAudioLevelViz, stopWebSpeech, stopDeepgramStream, startDeepgramStream, startWebSpeech, backupToBlob]);

  // =================================================================
  // POINTER HANDLERS
  // =================================================================

  const HOLD_THRESHOLD = 500; // ms — hold longer than this enters medicalize mode

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

    // If already recording → stop (either toggle or medicalize)
    if (stateRef.current === 'recording') {
      if (isHoldingRef.current) {
        // In medicalize mode — stop and process
        setIsHolding(false);
        isHoldingRef.current = false;
        setSwipeProgress(0);
        stopMedicalizeHold();
      } else {
        // In normal dictation → stop
        toggleModeRef.current = false;
        stopNonMedicalize();
      }
      return;
    }

    // Only start if idle/error
    if (stateRef.current !== 'idle' && stateRef.current !== 'error') return;

    pressActiveRef.current = true;
    toggleModeRef.current = false;
    isHoldingRef.current = false;
    swipeMedicalizeRef.current = false;
    setIsHolding(false);
    setSwipeProgress(0);

    // Start recording + Web Speech immediately
    startDictationRecording();
    pointerStartXRef.current = e.clientX;

    if (medicalizeGesture === 'hold') {
      // Hold mode: if user holds past threshold, enter medicalize
      holdTimerRef.current = setTimeout(() => {
        if (pressActiveRef.current && stateRef.current === 'recording') {
          isHoldingRef.current = true;
          swipeMedicalizeRef.current = true;
          setIsHolding(true);
          toggleModeRef.current = false;
          stopWebSpeech();
          accumulatedTextRef.current = '';
          onInterimRef.current?.('');
          onMedicalizeStartRef.current?.();
        }
      }, HOLD_THRESHOLD);
    }

    // Toggle mode — if user releases before threshold (or no swipe), it's toggle dictation
    toggleModeRef.current = true;
  }, [mode, medicalizeGesture, startEncounterRecording, startDictationRecording, stopNonMedicalize, stopMedicalizeHold, stopWebSpeech]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Swipe mechanic only for swipe gesture mode (iPhone)
    if (medicalizeGesture !== 'swipe' || mode !== 'dictation' || !pressActiveRef.current || stateRef.current !== 'recording') return;

    const dx = e.clientX - pointerStartXRef.current;
    const SWIPE_THRESHOLD = 60;
    const progress = Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD));
    setSwipeProgress(progress);

    if (dx >= SWIPE_THRESHOLD && !swipeMedicalizeRef.current) {
      swipeMedicalizeRef.current = true;
      isHoldingRef.current = true;
      setIsHolding(true);
      toggleModeRef.current = false;
      stopWebSpeech();
      accumulatedTextRef.current = '';
      onInterimRef.current?.('');
      onMedicalizeStartRef.current?.();
    }
  }, [mode, medicalizeGesture, stopWebSpeech]);

  const handlePointerUp = useCallback(() => {
    if (mode === 'encounter') return;

    const wasMedicalizing = isHoldingRef.current;
    pressActiveRef.current = false;

    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }

    if (stateRef.current !== 'recording') {
      setSwipeProgress(0);
      return;
    }

    if (wasMedicalizing) {
      // Snap-back animation for swipe mode
      if (medicalizeGesture === 'swipe') {
        setSnapBack(true);
        setTimeout(() => setSnapBack(false), 400);
      }
      setIsHolding(false);
      isHoldingRef.current = false;
      swipeMedicalizeRef.current = false;
      setSwipeProgress(0);
      stopMedicalizeHold();
    } else {
      setSwipeProgress(0);
      // Normal dictation: recording continues (toggle mode) — user taps again to stop
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
      const res = await fetch(getTranscribeEndpoint(endpoints, getEncounterEngine()), { method: 'POST', body: formData });
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
    const isMed = isHolding;
    // Color: medicalize=teal, wsReady=green-blue, connecting=amber
    const r = isMed ? Math.round(13 + v * 10) : wsReady ? Math.round(40 + v * 10) : Math.round(200 + v * 30);
    const g = isMed ? Math.round(148 + v * 40) : wsReady ? Math.round(140 + v * 80) : Math.round(150 + v * 40);
    const b = isMed ? Math.round(136 + v * 20) : wsReady ? Math.round(220 - v * 40) : 50;
    const c = `${r}, ${g}, ${b}`;
    const swipeOffset = pressActiveRef.current ? swipeProgress * 20 : 0;
    return {
      backgroundColor: `rgba(${c}, ${0.10 + v * 0.08})`,
      boxShadow: [
        `0 0 0 ${1 + v * 2.5}px rgba(${c}, ${0.22 + v * 0.23})`,
        `0 0 ${3 + v * 8}px rgba(${c}, ${0.06 + v * 0.14})`,
        `0 0 ${6 + v * 14}px rgba(${c}, ${0.02 + v * 0.06})`,
      ].join(', '),
      transform: `scale(${1 + v * 0.05}) translateX(${swipeOffset}px)`,
      transition: pressActiveRef.current ? 'background-color 0.12s, box-shadow 0.12s' : 'all 0.12s cubic-bezier(0.4, 0, 0.2, 1)',
    };
  })() : snapBack ? {
    // Snap-back animation: elastic return to center
    transform: 'scale(1.08) translateX(0)',
    transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
    boxShadow: '0 0 0 3px rgba(13,148,136,0.3), 0 0 12px rgba(13,148,136,0.15)',
    backgroundColor: 'rgba(13,148,136,0.08)',
  } : undefined;

  const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5';
  const btnPadding = compact ? 'p-1.5' : 'p-2.5 min-w-[44px] min-h-[44px]';
  const uploadIconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const uploadBtnPadding = compact ? 'p-1.5' : 'p-2 min-w-[36px] min-h-[36px]';

  return (
    <span className="inline-flex items-center gap-1 relative">
      {/* Swipe-right medicalize indicator (iPhone only) */}
      {medicalizeGesture === 'swipe' && state === 'recording' && mode === 'dictation' && !isHolding && swipeProgress > 0 && (
        <div className="absolute left-full ml-1 flex items-center gap-1 pointer-events-none"
          style={{ opacity: 0.4 + swipeProgress * 0.6, transform: `translateX(${swipeProgress * 8}px)` }}>
          <Stethoscope className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
        </div>
      )}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          // Don't stop if in medicalize mode — finger may leave button during hold or swipe
          if (pressActiveRef.current && (isHoldingRef.current || swipeMedicalizeRef.current || swipeProgress > 0.2)) return;
          handlePointerUp();
        }}
        disabled={disabled || state === 'transcribing'}
        className={`${btnPadding} rounded-full select-none touch-none flex items-center justify-center ${
          state === 'recording'
            ? isHolding ? 'text-teal-500' : wsReady ? 'text-red-500' : 'text-amber-500 animate-pulse'
            : state === 'transcribing'
            ? 'text-blue-500 animate-pulse'
            : state === 'error'
            ? 'text-red-400'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
        } disabled:opacity-50`}
        style={recordingStyle}
        title={
          state === 'recording'
            ? (isHolding ? 'Release to medicalize' : 'Tap to stop')
          : state === 'transcribing' ? 'Processing...'
          : mode === 'encounter'
            ? 'Tap to start/stop recording'
            : medicalizeGesture === 'swipe'
              ? 'Tap to dictate · Swipe right for AI medicalize'
              : 'Tap: dictate · Hold: medicalize'
        }
      >
        {isHolding
          ? <Stethoscope className={iconSize} />
          : <Mic className={iconSize} />
        }
      </button>
      {showUpload && state === 'idle' && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className={`${uploadBtnPadding} flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-50`}
            title="Upload audio file"
          >
            <Upload className={uploadIconSize} />
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
        </>
      )}
    </span>
  );
}
