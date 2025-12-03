import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
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
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Check, Clock, Download, FileVideo, UploadCloud, X } from "lucide-react";
import JSZip from "jszip";

import { ASR_MODELS, DEFAULT_ASR_MODEL, type AsrModelId } from "@/lib/asr-models";
import { segmentsToSrt, type TranscriptResponse } from "@/lib/transcript";
import { translateSegmentsToVietnamese } from "@/lib/translate-client";

type AsrLanguage = "auto" | "zh" | "ko" | "en" | "ja" | "vi";

type BatchJobStatus = "pending" | "processing" | "translating" | "done" | "error";

type BatchJob = {
  id: string;
  file: File | null;
  name: string;
  sizeBytes: number;
  status: BatchJobStatus;
  errorMessage: string | null;
  srtContent: string | null;
  durationSeconds: number | null;
  costUsd: number | null;
};

const USD_TO_VND_RATE = 27300;

type BatchTranscribeCardProps = {
  translateEnabled: boolean;
};

function formatSizeMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDurationLabel(secondsRaw: number | null): string {
  if (!Number.isFinite(secondsRaw ?? NaN) || (secondsRaw ?? 0) <= 0) return "-";
  const totalSeconds = Math.max(0, Math.round(secondsRaw ?? 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatUsdAmount(value: number | null): string {
  if (!Number.isFinite(value ?? NaN) || (value ?? 0) <= 0) return "-";
  const safe = value ?? 0;
  return `$${safe.toLocaleString("en-US", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 8,
  })}`;
}

function formatVndAmount(value: number | null): string {
  if (!Number.isFinite(value ?? NaN) || (value ?? 0) <= 0) return "-";
  const safe = value ?? 0;
  return `${safe.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} VND`;
}

function getBaseName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "subtitles";
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0) return trimmed;
  return trimmed.slice(0, dotIndex);
}

export function BatchTranscribeCard({ translateEnabled }: BatchTranscribeCardProps) {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [model, setModel] = useState<AsrModelId>(DEFAULT_ASR_MODEL);
  const [language, setLanguage] = useState<AsrLanguage>("auto");
  const isMountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const deepInfraModels = useMemo(
    () => ASR_MODELS.filter((item) => item.provider === "deepinfra"),
    [],
  );

  const totalCostUsd = useMemo(
    () =>
      jobs.reduce(
        (sum, job) =>
          sum + (typeof job.costUsd === "number" && Number.isFinite(job.costUsd) ? job.costUsd : 0),
        0,
      ),
    [jobs],
  );

  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === "done" && job.srtContent),
    [jobs],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setJobs((prev) => {
      const existingKeys = new Set(
        prev.map((job) =>
          job.file ? `${job.name}-${job.sizeBytes}-${job.file.lastModified}` : job.id,
        ),
      );
      const next = [...prev];

      for (const file of files) {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          file,
          name: file.name,
          sizeBytes: file.size,
          status: "pending",
          errorMessage: null,
          srtContent: null,
          durationSeconds: null,
          costUsd: null,
        });
      }

      return next;
    });

    event.target.value = "";
  };

  const handleStart = () => {
    if (isRunning) return;
    const pendingIndexes = jobs
      .map((job, index) => (job.status === "pending" ? index : -1))
      .filter((index) => index >= 0);
    if (!pendingIndexes.length) return;

    setIsRunning(true);

    const snapshotJobs = jobs;
    const modelSnapshot = model;
    const languageSnapshot = language;

    const runAll = async () => {
      const tasks = pendingIndexes.map((jobIndex, order) => {
        const job = snapshotJobs[jobIndex];
        if (!job || job.status !== "pending" || !job.file) {
          return Promise.resolve();
        }

        return (async () => {
          const initialDelayMs = order * 1000;
          if (initialDelayMs > 0) {
            await new Promise((resolve) => {
              setTimeout(resolve, initialDelayMs);
            });
          }

          if (!isMountedRef.current) return;

          setJobs((prev) =>
            prev.map((item, idx) =>
              idx === jobIndex
                ? { ...item, status: "processing", errorMessage: null }
                : item,
            ),
          );

          try {
            const formData = new FormData();
            const fileToSend = job.file;
            if (!fileToSend) {
              return;
            }
            formData.append("file", fileToSend);
            formData.append("model", modelSnapshot);
            if (languageSnapshot && languageSnapshot !== "auto") {
              formData.append("language", languageSnapshot);
            }

            const response = await fetch("/api/transcribe", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              const payload = (await response.json().catch(() => null)) as
                | { error?: string }
                | null;
              const message = payload?.error ?? "Lỗi khi xử lý transcribe.";
              if (!isMountedRef.current) return;
              setJobs((prev) =>
                prev.map((item, idx) =>
                  idx === jobIndex
                    ? { ...item, status: "error", errorMessage: message, file: null }
                    : item,
                ),
              );
            } else {
            const data = (await response.json()) as TranscriptResponse;
            const segments = data.segments ?? [];
              const durationSeconds =
                segments.length > 0
                  ? Math.max(
                      0,
                      (segments[segments.length - 1]?.end ?? 0) -
                        (segments[0]?.start ?? 0),
                    )
                  : null;
            const costUsd =
              typeof data.costUsd === "number" &&
              Number.isFinite(data.costUsd)
                  ? data.costUsd
                  : null;

              if (!isMountedRef.current) return;

              if (translateEnabled && segments.length) {
                setJobs((prev) =>
                  prev.map((item, idx) =>
                    idx === jobIndex
                      ? {
                          ...item,
                          status: "translating",
                          errorMessage: null,
                        }
                      : item,
                  ),
                );

                try {
                  const translatedMap =
                    await translateSegmentsToVietnamese(segments);
                  const translatedSegments = segments.map((segment) => ({
                    ...segment,
                    text:
                      translatedMap.get(segment.id) ?? segment.text ?? "",
                  }));
                  const srtContent = segmentsToSrt(translatedSegments);

                  if (!isMountedRef.current) return;

                  setJobs((prev) =>
                    prev.map((item, idx) =>
                      idx === jobIndex
                        ? {
                            ...item,
                            status: "done",
                            errorMessage: null,
                            srtContent,
                            durationSeconds,
                            costUsd,
                            file: null,
                          }
                        : item,
                    ),
                  );
                } catch (translateError) {
                  console.error(
                    "[batch] translate:exception",
                    translateError,
                  );
                  if (!isMountedRef.current) return;
                  setJobs((prev) =>
                    prev.map((item, idx) =>
                      idx === jobIndex
                        ? {
                            ...item,
                            status: "error",
                            errorMessage:
                              translateError instanceof Error &&
                              translateError.message
                                ? translateError.message
                                : "Lỗi khi dịch phụ đề.",
                            file: null,
                          }
                        : item,
                    ),
                  );
                }
              } else {
                const srtContent = segmentsToSrt(segments);

                setJobs((prev) =>
                  prev.map((item, idx) =>
                    idx === jobIndex
                      ? {
                          ...item,
                          status: "done",
                          errorMessage: null,
                          srtContent,
                          durationSeconds,
                          costUsd,
                          file: null,
                        }
                      : item,
                  ),
                );
              }
            }
          } catch (error: unknown) {
            if (!isMountedRef.current) return;
            const message =
              error instanceof Error && error.message
                ? error.message
                : "Không thể gọi API transcribe.";
            setJobs((prev) =>
              prev.map((item, idx) =>
                idx === jobIndex
                  ? { ...item, status: "error", errorMessage: message, file: null }
                  : item,
              ),
            );
          }
        })();
      });

      await Promise.allSettled(tasks);

      if (!isMountedRef.current) return;
      setIsRunning(false);
    };

    void runAll();
  };

  const handleDownloadSingle = (job: BatchJob) => {
    if (!job.srtContent) return;
    const blob = new Blob([job.srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${getBaseName(job.name)}.srt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = async () => {
    if (!completedJobs.length) return;
    const zip = new JSZip();

    completedJobs.forEach((job) => {
      if (!job.srtContent) return;
      zip.file(`${getBaseName(job.name)}.srt`, job.srtContent);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const fileName = `${completedJobs.length} file transcribe.rar`;

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleClearJobs = () => {
    setJobs([]);
    setIsRunning(false);
  };

  const hasJobs = jobs.length > 0;
  const pendingCount = jobs.filter((job) => job.status === "pending").length;
  const processingCount = jobs.filter(
    (job) => job.status === "processing" || job.status === "translating",
  ).length;

  return (
    <Card.Root variant="elevated" shadow="md" borderRadius="xl" overflow="hidden">
      <Card.Header
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.100"
        py={4}
        px={6}
      >
        <HStack justify="space-between" align="center">
          <HStack gap={3}>
            <Card.Title fontSize="lg" fontWeight="semibold">
              Batch Transcribe (nhiều file)
            </Card.Title>
            {hasJobs && (
              <Badge variant="surface" colorPalette="blue" px={2} borderRadius="full">
                {jobs.length} file
              </Badge>
            )}
          </HStack>
          <VStack align="end" gap={1}>
            <Text fontSize="xs" color="gray.500">
              Tổng chi phí (DeepInfra)
            </Text>
            <Text fontSize="sm" fontWeight="semibold" color="gray.800">
              {formatUsdAmount(totalCostUsd)}{" "}
              {formatVndAmount(
                Number.isFinite(totalCostUsd) ? totalCostUsd * USD_TO_VND_RATE : null,
              )}
            </Text>
          </VStack>
        </HStack>
      </Card.Header>
      <Card.Body p={6} bg="white">
        <VStack align="stretch" gap={6}>
          <Box
            borderWidth="2px"
            borderStyle="dashed"
            borderColor="gray.300"
            borderRadius="xl"
            bg="gray.50"
            p={8}
            textAlign="center"
            cursor={isRunning ? "default" : "pointer"}
            transition="all 0.2s"
            _hover={
              isRunning
                ? undefined
                : {
                    borderColor: "blue.500",
                    bg: "blue.50/30",
                  }
            }
            onClick={() => {
              if (isRunning) return;
              fileInputRef.current?.click();
            }}
          >
            <VStack gap={4}>
              <Flex
                p={4}
                bg="white"
                borderRadius="full"
                shadow="sm"
                color="blue.600"
                justify="center"
                align="center"
              >
                <UploadCloud size={32} />
              </Flex>
              <Box>
                <Text fontWeight="semibold" fontSize="md" color="gray.800">
                  Tải lên nhiều video hoặc âm thanh
                </Text>
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Hỗ trợ MP4, MOV, MP3, WAV. Không giới hạn số lượng file, gửi request
                  cách nhau 1 giây và xử lý song song.
                </Text>
              </Box>
            </VStack>
          </Box>
          <Input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*"
            display="none"
            multiple
            onChange={handleFileChange}
          />

          <Flex
            gap={4}
            align={{ base: "stretch", md: "center" }}
            direction={{ base: "column", md: "row" }}
          >
            <Field.Root
              orientation="horizontal"
              w={{ base: "full", md: "50%" }}
              gap={4}
            >
              <Field.Label
                htmlFor="batch-asr-model-select"
                fontSize="sm"
                color="gray.700"
                fontWeight="medium"
              >
                Model nhận dạng
              </Field.Label>
              <NativeSelect.Root size="sm" variant="outline" width="260px">
                <NativeSelect.Field
                  id="batch-asr-model-select"
                  value={model}
                  onChange={(event) => setModel(event.target.value as AsrModelId)}
                >
                  {deepInfraModels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>

            <Field.Root
              orientation="horizontal"
              w={{ base: "full", md: "50%" }}
              gap={4}
            >
              <Field.Label
                htmlFor="batch-asr-language-select"
                fontSize="sm"
                color="gray.700"
                fontWeight="medium"
              >
                Ngôn ngữ
              </Field.Label>
              <NativeSelect.Root size="sm" variant="outline" width="260px">
                <NativeSelect.Field
                  id="batch-asr-language-select"
                  value={language}
                  onChange={(event) =>
                    setLanguage(
                      event.target.value as
                        | "auto"
                        | "zh"
                        | "ko"
                        | "en"
                        | "ja"
                        | "vi",
                    )
                  }
                >
                  <option value="auto">Tự động (Auto)</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">Tiếng Anh</option>
                  <option value="zh">Tiếng Trung</option>
                  <option value="ko">Tiếng Hàn</option>
                  <option value="ja">Tiếng Nhật</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
          </Flex>

          <HStack justify="space-between" align="center">
            <HStack gap={3}>
              <Badge variant="surface" colorPalette="gray" px={2} borderRadius="md">
                Đang xử lý: {processingCount} | Chờ: {pendingCount} | Hoàn thành:{" "}
                {completedJobs.length}
              </Badge>
            </HStack>
            <HStack gap={3}>
              <Button
                size="sm"
                colorPalette="blue"
                variant="solid"
                disabled={isRunning || !pendingCount}
                onClick={handleStart}
              >
                {isRunning ? (
                  <>
                    <Spinner size="xs" mr={2} /> Đang chạy batch...
                  </>
                ) : (
                  "Bắt đầu xử lý"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorPalette="gray"
                disabled={!completedJobs.length}
                onClick={handleDownloadAll}
              >
                <Download size={16} style={{ marginRight: 6 }} /> Tải tất cả SRT (ZIP)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                colorPalette="red"
                disabled={!hasJobs}
                onClick={handleClearJobs}
              >
                <X size={16} style={{ marginRight: 6 }} /> Xóa danh sách
              </Button>
            </HStack>
          </HStack>

          {hasJobs ? (
            <Box
              borderWidth="1px"
              borderColor="gray.200"
              borderRadius="lg"
              overflow="hidden"
            >
              <Table.Root size="sm" variant="line" w="full">
                <Table.Header>
                  <Table.Row bg="gray.50">
                    <Table.ColumnHeader w="40px">#</Table.ColumnHeader>
                    <Table.ColumnHeader>Tên file</Table.ColumnHeader>
                    <Table.ColumnHeader w="100px">Dung lượng</Table.ColumnHeader>
                    <Table.ColumnHeader w="120px">Thời lượng</Table.ColumnHeader>
                    <Table.ColumnHeader w="140px">Chi phí</Table.ColumnHeader>
                    <Table.ColumnHeader w="140px">Trạng thái</Table.ColumnHeader>
                    <Table.ColumnHeader w="80px" textAlign="center">
                      Tải SRT
                    </Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {jobs.map((job, index) => {
                    const isProcessing = job.status === "processing";
                    const isTranslating = job.status === "translating";
                    const isDone = job.status === "done";
                    const isError = job.status === "error";
                    return (
                      <Table.Row key={job.id}>
                        <Table.Cell>{index + 1}</Table.Cell>
                        <Table.Cell>
                          <HStack gap={2}>
                            <FileVideo size={16} />
                            <Text fontSize="sm" lineClamp={1}>
                              {job.name}
                            </Text>
                          </HStack>
                        </Table.Cell>
                        <Table.Cell>
                          <Text fontSize="xs" color="gray.600">
                            {formatSizeMb(job.sizeBytes)}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <Text fontSize="xs" color="gray.700">
                            {formatDurationLabel(job.durationSeconds)}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          <VStack align="start" gap={0}>
                            <Text fontSize="xs" fontWeight="semibold" color="gray.800">
                              {formatUsdAmount(job.costUsd)}
                            </Text>
                            <Text fontSize="xs" color="gray.500">
                              {formatVndAmount(
                                Number.isFinite(job.costUsd ?? NaN)
                                  ? (job.costUsd ?? 0) * USD_TO_VND_RATE
                                  : null,
                              )}
                            </Text>
                          </VStack>
                        </Table.Cell>
                        <Table.Cell>
                          {isProcessing && (
                            <HStack gap={2}>
                              <Spinner size="xs" />
                              <Text fontSize="xs" color="blue.600">
                                Đang transcribe...
                              </Text>
                            </HStack>
                          )}
                          {isTranslating && (
                            <HStack gap={2}>
                              <Spinner size="xs" />
                              <Text fontSize="xs" color="orange.600">
                                Đang dịch...
                              </Text>
                            </HStack>
                          )}
                          {job.status === "pending" && (
                            <HStack gap={2}>
                              <Clock size={14} />
                              <Text fontSize="xs" color="gray.600">
                                Chờ xử lý
                              </Text>
                            </HStack>
                          )}
                          {isDone && (
                            <HStack gap={2}>
                              <Check size={14} />
                              <Text fontSize="xs" color="green.600">
                                Hoàn thành
                              </Text>
                            </HStack>
                          )}
                          {isError && (
                            <VStack align="start" gap={0}>
                              <HStack gap={2}>
                                <X size={14} />
                                <Text fontSize="xs" color="red.600">
                                  Lỗi
                                </Text>
                              </HStack>
                              {job.errorMessage && (
                                <Text fontSize="xs" color="red.500">
                                  {job.errorMessage}
                                </Text>
                              )}
                            </VStack>
                          )}
                        </Table.Cell>
                        <Table.Cell textAlign="center">
                          <Button
                            size="xs"
                            variant="ghost"
                            colorPalette="gray"
                            disabled={!isDone || !job.srtContent}
                            onClick={() => handleDownloadSingle(job)}
                            aria-label={`Tải SRT cho ${job.name}`}
                          >
                            <Download size={14} />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table.Root>
            </Box>
          ) : (
            <Box
              borderWidth="1px"
              borderColor="gray.200"
              borderRadius="lg"
              bg="gray.50"
              p={8}
            >
              <VStack align="center" justify="center" gap={3}>
                <Text fontSize="md" fontWeight="medium" color="gray.700">
                  Chưa có file nào trong hàng đợi
                </Text>
                <Text fontSize="sm" color="gray.500" textAlign="center" maxW="md">
                  Hãy chọn nhiều video/âm thanh cùng lúc, sau đó bấm &quot;Bắt đầu xử
                  lý&quot;. Hệ thống sẽ gửi các request transcribe song song, mỗi request
                  được bắt đầu cách nhau 1 giây, sau đó bạn có thể tải từng file SRT hoặc
                  tải tất cả dưới dạng một file nén.
                </Text>
              </VStack>
            </Box>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
}
