export type AsrModelId = "openai/whisper-large-v3-turbo" | "mistralai/Voxtral-Small-24B-2507";

export const DEFAULT_ASR_MODEL: AsrModelId = "openai/whisper-large-v3-turbo";

export const ASR_MODELS: ReadonlyArray<{ id: AsrModelId; label: string }> = [
  {
    id: "openai/whisper-large-v3-turbo",
    label: "Whisper Large V3 Turbo (OpenAI)",
  },
  {
    id: "mistralai/Voxtral-Small-24B-2507",
    label: "Voxtral Small 24B 2507 (Mistral)",
  },
];

