export type AsrProviderId = "deepinfra" | "local";

export type AsrModelId =
  | "openai/whisper-large-v3-turbo"
  | "mistralai/Voxtral-Small-24B-2507"
  | "local/whisper-large-v3-turbo";

export type AsrModel = {
  id: AsrModelId;
  label: string;
  provider: AsrProviderId;
};

export const DEFAULT_ASR_MODEL: AsrModelId = "openai/whisper-large-v3-turbo";

export const LOCAL_ASR_MODEL_ID: AsrModelId = "local/whisper-large-v3-turbo";

export const ASR_MODELS: ReadonlyArray<AsrModel> = [
  {
    id: "openai/whisper-large-v3-turbo",
    label: "Whisper Large V3 Turbo (OpenAI, DeepInfra)",
    provider: "deepinfra",
  },
  {
    id: "mistralai/Voxtral-Small-24B-2507",
    label: "Voxtral Small 24B 2507 (Mistral, DeepInfra)",
    provider: "deepinfra",
  },
  {
    id: "local/whisper-large-v3-turbo",
    label: "Whisper Large V3 Turbo (Tự host - miễn phí)",
    provider: "local",
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
