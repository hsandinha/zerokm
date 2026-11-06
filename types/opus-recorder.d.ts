// Tipos do opus-recorder (o pacote não traz os dele). Só o que a gravação de
// áudio da Central usa (wa/components/central-gravador.tsx).
declare module "opus-recorder" {
  interface RecorderOptions {
    encoderPath?: string;
    numberOfChannels?: number;
    encoderApplication?: number;
    encoderSampleRate?: number;
    encoderBitRate?: number;
    streamPages?: boolean;
    recordingGain?: number;
    mediaTrackConstraints?: boolean | MediaTrackConstraints;
    [key: string]: unknown;
  }

  export default class Recorder {
    constructor(options?: RecorderOptions);
    ondataavailable: (data: Uint8Array) => void;
    onstop: () => void;
    onstart: () => void;
    start(): Promise<void>;
    stop(): Promise<void>;
    static isRecordingSupported(): boolean;
  }
}
