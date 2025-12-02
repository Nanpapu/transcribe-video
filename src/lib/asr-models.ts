export type AsrProviderId = "deepinfra" | "local";

export type AsrModelId =
  | "openai/whisper-large-v3-turbo"
  | "openai/whisper-large-v3"
  | "local/whisper-large-v3-turbo";

export const DEFAULT_ASR_MODEL: AsrModelId = "openai/whisper-large-v3-turbo";

export const LOCAL_ASR_MODEL_ID = "local/whisper-large-v3-turbo";

export type AsrModel = {
  id: AsrModelId;
  label: string;
  provider: AsrProviderId;
  task: string;
  pricePerMinuteUsd: number;
};

export const ASR_MODELS: ReadonlyArray<AsrModel> = [
  {
    id: "openai/whisper-large-v3-turbo",
    label: "Whisper Large V3 Turbo",
    provider: "deepinfra",
    task: "automatic-speech-recognition",
    pricePerMinuteUsd: 0.0002,
  },
  {
    id: "openai/whisper-large-v3",
    label: "Whisper Large V3",
    provider: "deepinfra",
    task: "automatic-speech-recognition",
    pricePerMinuteUsd: 0.00045,
  },
];

export function getAsrModel(id: AsrModelId | string | null): AsrModel | null {
  if (!id) return null;
  return ASR_MODELS.find((model) => model.id === id) ?? null;
}

export function isLocalAsrModel(id: AsrModelId | string | null): boolean {
  return getAsrModel(id)?.provider === "local";
}

export function isDeepInfraAsrModel(id: AsrModelId | string | null): boolean {
  return getAsrModel(id)?.provider === "deepinfra";
}
