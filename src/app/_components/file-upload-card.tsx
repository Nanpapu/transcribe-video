import { type ChangeEvent, type RefObject, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Field,
  Flex,
  HStack,
  Input,
  NativeSelect,
  Spinner,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CheckCircle2, FileVideo, Trash2, UploadCloud, Wand2 } from "lucide-react";
import {
  ASR_MODELS,
  DEFAULT_ASR_MODEL,
  LOCAL_ASR_MODEL_ID,
  getAsrModel,
  type AsrModelId,
} from "@/lib/asr-models";

type FileUploadCardProps = {
  file: File | null;
  isTranscribing: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  model: AsrModelId;
  onModelChange: (value: AsrModelId) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onTranscribe: () => void;
};

export function FileUploadCard({
  file,
  isTranscribing,
  inputRef,
  model,
  onModelChange,
  onFileChange,
  onClearFile,
  onTranscribe,
}: FileUploadCardProps) {
  const [serverStatus, setServerStatus] = useState<"idle" | "starting" | "running" | "error">(
    "idle",
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverExpiresAt, setServerExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const activeProvider: "deepinfra" | "local" = useMemo(() => {
    const currentModel = getAsrModel(model);
    return currentModel?.provider === "local" ? "local" : "deepinfra";
  }, [model]);

  useEffect(() => {
    const eventSource = new EventSource("/api/local-asr/server/events");

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          status?: "idle" | "starting" | "running" | "error";
          error?: string | null;
          expiresAt?: number | null;
        };
        if (payload.status) {
          setServerStatus(payload.status);
        }
        if (typeof payload.expiresAt === "number" || payload.expiresAt === null) {
          setServerExpiresAt(payload.expiresAt);
        }
        setServerError(
          payload.error && payload.error.trim().length ? payload.error.trim() : null,
        );
      } catch {
        // ignore parse errors from unknown events
      }
    };

    eventSource.onerror = () => {
      setServerStatus((prev) => (prev === "running" ? prev : "error"));
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const handleStartLocalServer = async () => {
    setServerError(null);
    try {
      setServerStatus("starting");
      const response = await fetch("/api/local-asr/server/start", {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = payload?.error ?? "Không thể khởi động server tự host.";
        setServerError(message);
        setServerStatus("error");
      }
    } catch (error) {
      console.error("[ui] local-server:start-error", error);
      setServerError("Lỗi khi gọi API khởi động server tự host.");
      setServerStatus("error");
    }
  };

  const remainingSeconds = useMemo(() => {
    if (!serverExpiresAt) return null;
    const diffMs = serverExpiresAt - now;
    if (diffMs <= 0) return 0;
    return Math.round(diffMs / 1000);
  }, [serverExpiresAt, now]);

  const isLocalActive = activeProvider === "local";

  return (
    <Card.Root variant="elevated" shadow="md" borderRadius="xl" overflow="hidden">
      <Card.Header bg="white" borderBottomWidth="1px" borderColor="gray.100" py={4} px={6}>
        <HStack justify="space-between">
          <Card.Title fontSize="lg" fontWeight="semibold">
            File nguồn
          </Card.Title>
          {file && (
            <Badge colorPalette="green" variant="surface" px={2} py={1} borderRadius="md">
              <CheckCircle2 size={14} style={{ marginRight: 6 }} /> Sẵn sàng
            </Badge>
          )}
        </HStack>
      </Card.Header>
      <Card.Body p={6}>
        {!file ? (
          <Box
            borderWidth="2px"
            borderStyle="dashed"
            borderColor="gray.300"
            borderRadius="xl"
            bg="gray.50"
            p={12}
            textAlign="center"
            cursor="pointer"
            transition="all 0.2s"
            _hover={{ borderColor: "blue.500", bg: "blue.50/30" }}
            onClick={() => inputRef.current?.click()}
          >
            <VStack gap={5}>
              <Flex
                p={5}
                bg="white"
                borderRadius="full"
                shadow="sm"
                color="blue.600"
                justify="center"
                align="center"
              >
                <UploadCloud size={36} />
              </Flex>
              <Box>
                <Text fontWeight="semibold" fontSize="lg" color="gray.800">
                  Tải lên video hoặc âm thanh
                </Text>
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Hỗ trợ MP4, MOV, MP3, WAV
                </Text>
              </Box>
            </VStack>
          </Box>
        ) : (
          <HStack
            p={4}
            bg="gray.50"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="gray.200"
            justify="space-between"
          >
            <HStack gap={4}>
              <Flex
                p={3}
                bg="white"
                borderRadius="md"
                color="blue.600"
                shadow="xs"
                border="1px solid"
                borderColor="gray.100"
              >
                <FileVideo size={24} />
              </Flex>
              <Box>
                <Text fontWeight="medium" fontSize="sm" lineClamp={1} color="gray.900">
                  {file.name}
                </Text>
                <Text fontSize="xs" color="gray.500">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </Text>
              </Box>
            </HStack>
            <Button
              size="sm"
              variant="ghost"
              colorPalette="red"
              onClick={onClearFile}
              aria-label="Xóa file"
            >
              <Trash2 size={18} />
            </Button>
          </HStack>
        )}
        <Input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          display="none"
          onChange={onFileChange}
        />
        <Box mt={6}>
          <Tabs.Root
            value={isLocalActive ? "local" : "deepinfra"}
            onValueChange={(details) => {
              const next =
                typeof details === "string"
                  ? details
                  : typeof (details as { value?: string | null })?.value === "string"
                    ? (details as { value: string }).value
                    : null;
              if (next === "local") {
                onModelChange(LOCAL_ASR_MODEL_ID);
              } else if (next === "deepinfra") {
                onModelChange(DEFAULT_ASR_MODEL);
              }
            }}
          >
            <Tabs.List mb={4}>
              <Tabs.Trigger value="local">Tự host (miễn phí)</Tabs.Trigger>
              <Tabs.Trigger value="deepinfra">Thuê ngoài (DeepInfra)</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="deepinfra">
              <Field.Root orientation="horizontal" w="full" gap={4}>
                <Field.Label
                  htmlFor="asr-model-remote"
                  fontSize="sm"
                  color="gray.700"
                  fontWeight="medium"
                >
                  Model nhận dạng
                </Field.Label>
                <NativeSelect.Root size="sm" variant="outline" width="260px">
                  <NativeSelect.Field
                    id="asr-model-remote"
                    value={model}
                    onChange={(event) =>
                      onModelChange(event.target.value as AsrModelId)
                    }
                  >
                    {ASR_MODELS.filter((item) => item.provider === "deepinfra").map(
                      (item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ),
                    )}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
            </Tabs.Content>
            <Tabs.Content value="local">
              <VStack align="stretch" gap={3}>
                <Text fontSize="sm" color="gray.700" fontWeight="medium">
                  Whisper Large V3 Turbo (tự host trên máy của bạn)
                </Text>
                <Text fontSize="xs" color="gray.500">
                  Server Python sẽ tự tắt sau 10 phút không sử dụng. Khi transcribe sẽ tự
                  reset lại thời gian.
                </Text>
                <HStack justify="space-between" align="center">
                  <HStack gap={3}>
                    <Badge
                      colorPalette={
                        serverStatus === "running"
                          ? "green"
                          : serverStatus === "starting"
                            ? "yellow"
                            : serverStatus === "error"
                              ? "red"
                              : "gray"
                      }
                      variant="subtle"
                      px={2}
                      py={1}
                      borderRadius="md"
                    >
                      {serverStatus === "running" && "Đang chạy"}
                      {serverStatus === "starting" && "Đang khởi động..."}
                      {serverStatus === "idle" && "Đang tắt"}
                      {serverStatus === "error" && "Lỗi server"}
                    </Badge>
                    {typeof remainingSeconds === "number" && (
                      <Text fontSize="xs" color="gray.600">
                        Tự tắt sau {Math.max(remainingSeconds, 0)}s
                      </Text>
                    )}
                  </HStack>
                  <Button
                    size="sm"
                    colorPalette="blue"
                    onClick={handleStartLocalServer}
                    disabled={serverStatus === "starting"}
                  >
                    {serverStatus === "running" ? "Khởi động lại server" : "Khởi động server"}
                  </Button>
                </HStack>
                {serverError && (
                  <Text fontSize="xs" color="red.500">
                    {serverError}
                  </Text>
                )}
              </VStack>
            </Tabs.Content>
          </Tabs.Root>
        </Box>
      </Card.Body>
      {file && (
        <Card.Footer pt={0} pb={6} px={6}>
          <Button
            w="full"
            colorPalette="blue"
            size="lg"
            onClick={onTranscribe}
            loading={isTranscribing}
            disabled={isTranscribing || (isLocalActive && serverStatus !== "running")}
            shadow="sm"
          >
            {isTranscribing ? (
              <>
                <Spinner size="sm" mr={2} /> Đang xử lý...
              </>
            ) : (
              <>
                <Wand2 size={18} style={{ marginRight: 8 }} /> Bắt đầu Transcribe
              </>
            )}
          </Button>
        </Card.Footer>
      )}
    </Card.Root>
  );
}
