"use client";

import { type ChangeEvent, type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Container, Flex, Grid, HStack, Stack, Tabs, Text } from "@chakra-ui/react";

import {
  formatTimecode,
  parseTimecode,
  segmentsToSrt,
  type SubtitlePosition,
  type EditableTranscriptSegment,
  type TranscriptResponse,
  type TranscriptSegment,
} from "@/lib/transcript";
import { DEFAULT_ASR_MODEL, type AsrModelId } from "@/lib/asr-models";
import { translateSegmentsToVietnamese } from "@/lib/translate-client";
import { AppHeader } from "./_components/app-header";
import { FileUploadCard } from "./_components/file-upload-card";
import { VideoPreviewCard } from "./_components/video-preview-card";
import { SubtitleEditorCard } from "./_components/subtitle-editor-card";
import { BatchTranscribeCard } from "./_components/batch-transcribe-card";

type EditableSegment = EditableTranscriptSegment & {
  originalText?: string;
  translatedText?: string | null;
};

type AsrLanguage = "auto" | "zh" | "ko" | "en" | "ja" | "vi";

// --- Main Component ---

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<EditableSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>("bottom");
  const [model, setModel] = useState<AsrModelId>(DEFAULT_ASR_MODEL);
  const [language, setLanguage] = useState<AsrLanguage>("auto");
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [actualCostUsd, setActualCostUsd] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [shouldTranslate, setShouldTranslate] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const currentSegment = useMemo(
    () => (activeIndex === null ? null : segments[activeIndex] ?? null),
    [activeIndex, segments],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    console.log("[ui] file change", {
      hasFile: !!nextFile,
      name: nextFile?.name,
      size: nextFile?.size,
    });
    if (!nextFile) {
      handleClearFile();
      return;
    }

    setFile(nextFile);
    setError(null);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(nextFile);
    });
    setFileDuration(null);
    setActualCostUsd(null);
  };

  const handleClearFile = () => {
    setFile(null);
    setSegments([]);
    setError(null);
    setActiveIndex(null);
    setCurrentTime(0);
    setVideoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (inputRef.current) inputRef.current.value = "";
    setFileDuration(null);
    setActualCostUsd(null);
    setShowOriginal(false);
  };

  const handleTranslateSegments = async (sourceSegments?: EditableSegment[]) => {
    const segmentsToUse = sourceSegments ?? segments;
    if (!segmentsToUse.length) return;

    console.log("[ui] translate:start", {
      segmentCount: segmentsToUse.length,
    });

    const payloadSegments: TranscriptSegment[] = segmentsToUse.map((segment) => ({
      id: segment.id,
      start: segment.start,
      end: segment.end,
      text: segment.originalText ?? segment.text,
    }));

    setIsTranslating(true);
    try {
      const translatedMap = await translateSegmentsToVietnamese(payloadSegments);
      if (translatedMap.size) {
        setSegments((prev) =>
          prev.map((segment) => {
            const originalText = segment.originalText ?? segment.text;
            const translatedText =
              translatedMap.get(segment.id) ??
              segment.translatedText ??
              segment.text;

            return {
              ...segment,
              originalText,
              translatedText,
              text: showOriginal ? originalText : translatedText,
            };
          }),
        );
        setShowOriginal(false);
        console.log("[ui] translate:done", {
          translatedCount: translatedMap.size,
        });
      } else {
        console.warn("[ui] translate:empty-map");
      }
    } catch (translateError) {
      console.error("[ui] translate:exception", translateError);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleTranscribe = async () => {
    if (!file) {
      setError("Vui lòng chọn file video hoặc audio trước.");
      return;
    }

    console.log("[ui] transcribe:start", {
      fileName: file.name,
      fileSize: file.size,
      model,
    });

    setIsTranscribing(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        console.warn("[ui] transcribe:abort-timeout");
        controller.abort();
      }, 12000000);

      const body = new FormData();
      body.append("file", file);
      body.append("model", model);
      if (language && language !== "auto") {
        body.append("language", language);
      }

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);

      console.log("[ui] transcribe:response", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        console.warn("[ui] transcribe:error-payload", payload);
        throw new Error(payload?.error ?? "Lỗi khi xử lý transcribe.");
      }

      const data = (await response.json()) as TranscriptResponse;
      console.log("[ui] transcribe:data", {
        textLength: data.text?.length ?? 0,
        segments: data.segments?.length ?? 0,
        costUsd: data.costUsd ?? null,
      });
      const baseSegments = data.segments ?? [];
      const mappedSegments: EditableSegment[] = baseSegments.map((segment) => ({
        ...segment,
        startTimecode: formatTimecode(segment.start),
        endTimecode: formatTimecode(segment.end),
        originalText: segment.text,
        translatedText: null,
      }));

      if (!mappedSegments.length) {
        setSegments([]);
        setActiveIndex(null);
        setCurrentTime(0);
        if (videoRef.current) videoRef.current.currentTime = 0;
        console.warn("[ui] transcribe:empty-segments");
        setError(
          "API không trả về timestamp theo đoạn. Kiểm tra cấu hình DeepInfra (chunk_level=segment, chunk_length_s).",
        );
        return;
      }

      setSegments(mappedSegments);
      setActiveIndex(null);
      setCurrentTime(0);
      if (videoRef.current) videoRef.current.currentTime = 0;
      setActualCostUsd(
        typeof data.costUsd === "number" && Number.isFinite(data.costUsd)
          ? data.costUsd
          : null,
      );

      if (shouldTranslate && baseSegments.length) {
        await handleTranslateSegments(mappedSegments);
      }
    } catch (err: unknown) {
      console.error("[ui] transcribe:exception", err);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request transcribe mất quá lâu, vui lòng thử lại sau.");
        return;
      }
      const message = err instanceof Error ? err.message : null;
      setError(message && message.trim() ? message : "Không thể gọi API transcribe.");
    } finally {
      console.log("[ui] transcribe:done");
      setIsTranscribing(false);
    }
  };

  const handleTimeChange = (
    index: number,
    field: "startTimecode" | "endTimecode",
    value: string,
  ) => {
    setSegments((prev) =>
      prev.map((seg, i) => (i === index ? { ...seg, [field]: value } : seg)),
    );
  };

  const handleTimeBlur = (index: number, kind: "start" | "end") => {
    setSegments((prev) => {
      const draft = [...prev];
      const segment = draft[index];
      if (!segment) return prev;

      const raw = kind === "start" ? segment.startTimecode : segment.endTimecode;
      const seconds = parseTimecode(raw);

      if (seconds === null) {
        const fallback = formatTimecode(kind === "start" ? segment.start : segment.end);
        draft[index] = {
          ...segment,
          [kind === "start" ? "startTimecode" : "endTimecode"]: fallback,
        };
        return draft;
      }

      draft[index] = {
        ...segment,
        [kind === "start" ? "start" : "end"]: seconds,
        [kind === "start" ? "startTimecode" : "endTimecode"]: formatTimecode(seconds),
      };
      return draft;
    });
  };

  const handleTextChange = (index: number, value: string) => {
    setSegments((prev) =>
      prev.map((seg, i) => {
        if (i !== index) return seg;
        if (showOriginal) {
          return {
            ...seg,
            text: value,
            originalText: value,
          };
        }
        return {
          ...seg,
          text: value,
          translatedText: value,
        };
      }),
    );
  };

  const handleViewModeChange = (nextShowOriginal: boolean) => {
    setShowOriginal(nextShowOriginal);
    setSegments((prev) =>
      prev.map((segment) => {
        const originalText = segment.originalText ?? segment.text;
        const translatedText =
          typeof segment.translatedText === "string" && segment.translatedText.length > 0
            ? segment.translatedText
            : segment.text;

        return {
          ...segment,
          originalText,
          translatedText,
          text: nextShowOriginal ? originalText : translatedText,
        };
      }),
    );
  };

  const handleDownloadSrt = () => {
    if (!segments.length) return;
    const srtContent = segmentsToSrt(segments);
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const baseName = (() => {
      if (!file?.name) return "subtitles";
      const dotIndex = file.name.lastIndexOf(".");
      if (dotIndex <= 0) return file.name;
      return file.name.slice(0, dotIndex);
    })();

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${baseName}.srt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleTimeUpdate = (event: SyntheticEvent<HTMLVideoElement>) => {
    const nextTime = event.currentTarget.currentTime;
    setCurrentTime(nextTime);
    if (!segments.length) {
      setActiveIndex(null);
      return;
    }
    const foundIndex = segments.findIndex(
      (seg) => nextTime >= seg.start && nextTime < seg.end,
    );
    setActiveIndex(foundIndex >= 0 ? foundIndex : null);
  };

  const handleLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
    const duration = event.currentTarget.duration;
    setFileDuration(Number.isFinite(duration) && duration > 0 ? duration : null);
  };

  const handleSeekToSegment = (index: number) => {
    const target = segments[index];
    if (!target || !videoRef.current) return;
    videoRef.current.currentTime = target.start;
    videoRef.current.play().catch(() => {});
  };

  const hasTranslation = segments.some(
    (segment) => typeof segment.translatedText === "string" && segment.translatedText.length > 0,
  );

  return (
    <Box suppressHydrationWarning minH="100vh" bg="gray.50" color="gray.900" pb={20}>
      <AppHeader />

      <Container maxW="7xl" mt={10} px={6}>
        <Stack gap={4}>
          <Flex justify="flex-end">
            <HStack gap={3}>
              <Text fontSize="sm" color="gray.700">
                Dịch phụ đề sang tiếng Việt
              </Text>
              <Button
                size="sm"
                variant={shouldTranslate ? "solid" : "outline"}
                colorPalette="blue"
                onClick={() => setShouldTranslate((prev) => !prev)}
              >
                {shouldTranslate ? "Đang bật" : "Đang tắt"}
              </Button>
            </HStack>
          </Flex>

          <Tabs.Root defaultValue="single" colorPalette="blue">
            <Tabs.List
              mb={6}
              borderBottomWidth="1px"
              borderColor="gray.200"
              gap={6}
            >
              <Tabs.Trigger
                value="single"
                px={3}
                py={2}
                fontSize="sm"
                fontWeight="medium"
              >
                Transcribe đơn lẻ
              </Tabs.Trigger>
              <Tabs.Trigger
                value="batch"
                px={3}
                py={2}
                fontSize="sm"
                fontWeight="medium"
              >
                Transcribe nhiều file
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="single">
              <Grid
                templateColumns={{ base: "1fr", lg: "1fr 1.2fr" }}
                gap={10}
                alignItems="start"
              >
                <Stack gap={8}>
                  <FileUploadCard
                    file={file}
                    isTranscribing={isTranscribing}
                    inputRef={inputRef}
                    model={model}
                    onModelChange={setModel}
                    language={language}
                    onLanguageChange={setLanguage}
                    onFileChange={handleFileChange}
                    onClearFile={handleClearFile}
                    onTranscribe={handleTranscribe}
                    fileDurationSeconds={fileDuration}
                    actualCostUsd={actualCostUsd}
                  />

                  <VideoPreviewCard
                    videoUrl={videoUrl}
                    videoRef={videoRef}
                    subtitlePosition={subtitlePosition}
                    onSubtitlePositionChange={setSubtitlePosition}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    currentSegmentText={currentSegment?.text ?? null}
                    currentTime={currentTime}
                    totalSegments={segments.length}
                    activeIndex={activeIndex}
                  />
                </Stack>

                <Stack
                  gap={6}
                  alignSelf="start"
                  position={{ base: "static", lg: "sticky" }}
                  top={{ base: "0px", lg: "96px" }}
                >
                  <SubtitleEditorCard
                    segments={segments}
                    error={error}
                    activeIndex={activeIndex}
                    onDownloadSrt={handleDownloadSrt}
                    onTimeChange={handleTimeChange}
                    onTimeBlur={handleTimeBlur}
                    onTextChange={handleTextChange}
                    onSeekToSegment={handleSeekToSegment}
                    isTranslating={isTranslating}
                    showOriginal={showOriginal}
                    hasTranslation={hasTranslation}
                    onViewModeChange={handleViewModeChange}
                    onTranslateClick={() => {
                      void handleTranslateSegments();
                    }}
                  />
                </Stack>
              </Grid>
            </Tabs.Content>

            <Tabs.Content value="batch">
              <BatchTranscribeCard translateEnabled={shouldTranslate} />
            </Tabs.Content>
          </Tabs.Root>
        </Stack>
      </Container>
    </Box>
  );
}
