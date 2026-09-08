export type RecorderState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface AudioLevelData {
  level: number;
  lowFreq: number;
  highFreq: number;
  speakerHint: 'near' | 'far' | 'silent';
}

export interface EndpointConfig {
  elevenlabsToken: string;
  deepgramToken: string;
  transcribeElevenlabs: string;
  transcribeDeepgram: string;
  transcribeWispr: string;
  transcribeDefault: string;
  transcribeAsync: string;
  medicalize: string;
  uploadAudio: string;
}

export interface NativeBridge {
  isNative?: () => boolean;
  notifyRecordingStart?: () => void;
  notifyRecordingStop?: () => void;
  startLiveActivity?: (data: any) => void;
  updateLiveActivity?: (data: any) => void;
  stopLiveActivity?: (data: any) => void;
  registerEncounterControl?: (handler: any) => (() => void) | void;
  haptic?: (type: any) => void;
}

export interface VoiceRecorderProps {
  // Core callbacks
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  onProcessingChange?: (processing: boolean) => void;
  onAudioLevel?: (data: AudioLevelData) => void;
  onMedicalizeStart?: () => void;
  onBackupSaved?: (url: string) => void;
  onBlobBackup?: (blobUrl: string, iv: string, contentType: string) => void;

  // Config
  encryptionKey?: string;
  disabled?: boolean;
  mode?: 'encounter' | 'dictation';
  compact?: boolean;
  showUpload?: boolean;
  sheetName?: string;
  /** Patient row index for context (ElevenLabs batch keyterms) */
  rowIndex?: number;
  /** Mic sensitivity: 1=low, 2=medium, 3=high, 4=max */
  sensitivity?: number;
  /** @deprecated Use sensitivity instead */
  micGain?: number;
  pocketMode?: boolean;
  medicalizeGesture?: 'hold' | 'swipe';
  patientName?: string;

  // App-specific injection (required)
  endpoints: EndpointConfig;
  getSpeechEngine: () => string;
  getTranscribeEngine: () => string;
  getEncounterEngine: () => string;

  // Optional injection
  nativeBridge?: NativeBridge;
  uploadBlob?: (filename: string, blob: Blob) => Promise<{ url: string }>;
}
