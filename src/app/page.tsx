"use client";

import {
  type ChangeEvent,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Field,
  Flex,
  Grid,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Spinner,
  Stack,
  Table,
  Text,
  Textarea,
  VStack,
  chakra,
} from "@chakra-ui/react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileVideo,
  LayoutTemplate,
  Play,
  Trash2,
  Type,
  UploadCloud,
  Video,
  Wand2,
} from "lucide-react";

// --- Types & Helpers ---

type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type EditableSegment = TranscriptSegment & {
  startTimecode: string;
  endTimecode: string;
};

type TranscriptResponse = {
  text: string;
  segments: TranscriptSegment[];
};

type SubtitlePosition = "bottom" | "middle" | "top";

function formatTimecode(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "00:00:00,000";
  }

  const milliseconds = Math.floor(totalSeconds * 1000);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;

  const pad = (value: number, length: number) => value.toString().padStart(length, "0");

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(ms, 3)}`;
}

function parseTimecode(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;

  const [main, msPart] = value.split(/[.,]/);
  const msRaw = msPart ? msPart.trim() : "";
  const ms = msRaw ? Number.parseInt(msRaw.slice(0, 3).padEnd(3, "0"), 10) : 0;

  const parts = main.split(":").map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => Number.isNaN(Number.parseInt(part, 10)))) return null;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = Number.parseInt(parts[0] ?? "0", 10);
    minutes = Number.parseInt(parts[1] ?? "0", 10);
    seconds = Number.parseInt(parts[2] ?? "0", 10);
  } else if (parts.length === 2) {
    minutes = Number.parseInt(parts[0] ?? "0", 10);
    seconds = Number.parseInt(parts[1] ?? "0", 10);
  } else if (parts.length === 1) {
    seconds = Number.parseInt(parts[0] ?? "0", 10);
  } else {
    return null;
  }

  if (minutes > 59 || seconds > 59) return null;

  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function segmentsToSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((segment, index) => {
      const start = formatTimecode(segment.start);
      const end = formatTimecode(segment.end);
      return `${index + 1}\n${start} --> ${end}\n${segment.text}\n`;
    })
    .join("\n")
    .trim();
}

// --- Main Component ---

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<EditableSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>("bottom");
  const [currentTime, setCurrentTime] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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
  };

  const handleTranscribe = async () => {
    if (!file) {
      setError("Vui lòng chọn file video hoặc audio trước.");
      return;
    }

    setIsTranscribing(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Lỗi khi xử lý transcribe.");
      }

      const data = (await response.json()) as TranscriptResponse;
      const mappedSegments: EditableSegment[] = (data.segments ?? []).map((segment) => ({
        ...segment,
        startTimecode: formatTimecode(segment.start),
        endTimecode: formatTimecode(segment.end),
      }));

      if (!mappedSegments.length) {
        setSegments([]);
        setActiveIndex(null);
        setCurrentTime(0);
        if (videoRef.current) videoRef.current.currentTime = 0;
        setError(
          "API không trả về timestamp theo đoạn. Kiểm tra cấu hình DeepInfra (chunk_level=segment, chunk_length_s).",
        );
        return;
      }

      setSegments(mappedSegments);
      setActiveIndex(null);
      setCurrentTime(0);
      if (videoRef.current) videoRef.current.currentTime = 0;
    } catch (err: any) {
      setError(err.message || "Không thể gọi API transcribe.");
    } finally {
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
      prev.map((seg, i) => (i === index ? { ...seg, text: value } : seg)),
    );
  };

  const handleDownloadSrt = () => {
    if (!segments.length) return;
    const srtContent = segmentsToSrt(segments);
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "subtitles.srt";
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

  const handleSeekToSegment = (index: number) => {
    const target = segments[index];
    if (!target || !videoRef.current) return;
    videoRef.current.currentTime = target.start;
    videoRef.current.play().catch(() => {});
  };

  const handlePositionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSubtitlePosition(event.target.value as SubtitlePosition);
  };

  const overlayStyles = (() => {
    switch (subtitlePosition) {
      case "top":
        return { top: "8%", bottom: undefined, transform: "translateX(-50%)" };
      case "middle":
        return { top: "50%", bottom: undefined, transform: "translate(-50%, -50%)" };
      default:
        return { top: undefined, bottom: "8%", transform: "translateX(-50%)" };
    }
  })();

  return (
    <Box minH="100vh" bg="gray.50" color="gray.900" pb={20}>
      {/* Header */}
      <Box bg="white" borderBottomWidth="1px" borderColor="gray.200" py={5} px={8} position="sticky" top={0} zIndex={10} shadow="sm">
        <Container maxW="7xl">
          <HStack justify="space-between">
            <HStack gap={4}>
              <Flex align="center" justify="center" p={2.5} bg="blue.600" borderRadius="xl" color="white" shadow="md">
                <Video size={24} />
              </Flex>
              <Box>
                <Heading size="md" fontWeight="bold" letterSpacing="tight" lineHeight="1.2">
                  Transcribe Video
                </Heading>
                <Text fontSize="sm" color="gray.500" fontWeight="medium">
                  Tạo phụ đề tự động bằng AI
                </Text>
              </Box>
            </HStack>
            <HStack gap={4}>
              <Button size="sm" variant="ghost" colorPalette="gray">
                Hướng dẫn
              </Button>
              <Button size="sm" variant="surface" colorPalette="blue">
                Dự án mới
              </Button>
            </HStack>
          </HStack>
        </Container>
      </Box>

      <Container maxW="7xl" mt={10} px={6}>
        <Grid templateColumns={{ base: "1fr", lg: "1fr 1.2fr" }} gap={10} alignItems="start">
          {/* Left Column: Upload & Preview */}
          <Stack gap={8}>
            {/* Upload Card */}
            <Card.Root variant="elevated" shadow="md" borderRadius="xl" overflow="hidden">
              <Card.Header bg="white" borderBottomWidth="1px" borderColor="gray.100" py={4} px={6}>
                <HStack justify="space-between">
                  <Card.Title fontSize="lg" fontWeight="semibold">File nguồn</Card.Title>
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
                      <Flex p={5} bg="white" borderRadius="full" shadow="sm" color="blue.600" justify="center" align="center">
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
                      <Flex p={3} bg="white" borderRadius="md" color="blue.600" shadow="xs" border="1px solid" borderColor="gray.100">
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
                      onClick={handleClearFile}
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
                  onChange={handleFileChange}
                />
              </Card.Body>
              {file && (
                <Card.Footer pt={0} pb={6} px={6}>
                  <Button
                    w="full"
                    colorPalette="blue"
                    size="lg"
                    onClick={handleTranscribe}
                    loading={isTranscribing}
                    disabled={isTranscribing}
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

            {/* Video Preview */}
            <Card.Root variant="elevated" shadow="md" borderRadius="xl" overflow="hidden">
              <Card.Header bg="white" borderBottomWidth="1px" borderColor="gray.100" py={4} px={6}>
                <HStack justify="space-between">
                  <Card.Title fontSize="lg" fontWeight="semibold">Xem trước</Card.Title>
                  <Field.Root orientation="horizontal" w="auto">
                    <NativeSelect.Root size="xs" variant="subtle" width="140px">
                      <NativeSelect.Field
                        value={subtitlePosition}
                        onChange={handlePositionChange}
                        fontSize="xs"
                        fontWeight="medium"
                      >
                        <option value="bottom">Dưới (Bottom)</option>
                        <option value="middle">Giữa (Middle)</option>
                        <option value="top">Trên (Top)</option>
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                </HStack>
              </Card.Header>
              <Card.Body p={0} position="relative" bg="black">
                {videoUrl ? (
                  <Box position="relative">
                    <chakra.video
                      key={videoUrl ?? "video-player"}
                      ref={videoRef}
                      src={videoUrl ?? undefined}
                      controls
                      playsInline
                      w="100%"
                      maxH="400px"
                      display="block"
                      bg="black"
                      objectFit="contain"
                      onTimeUpdate={handleTimeUpdate}
                    />
                    {currentSegment && (
                      <Box
                        position="absolute"
                        left="50%"
                        px={4}
                        py={2}
                        bg="yellow.400"
                        color="black"
                        borderRadius="md"
                        maxW="90%"
                        textAlign="center"
                        fontWeight="bold"
                        fontSize="lg"
                        textShadow="none"
                        boxShadow="0 2px 10px rgba(0,0,0,0.2)"
                        whiteSpace="pre-wrap"
                        pointerEvents="none"
                        {...overlayStyles}
                      >
                        {currentSegment.text}
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Flex
                    align="center"
                    justify="center"
                    h="320px"
                    bg="gray.900"
                    color="gray.600"
                    direction="column"
                    gap={4}
                  >
                    <LayoutTemplate size={56} strokeWidth={1} />
                    <Text fontSize="sm" color="gray.500">Video xem trước sẽ hiện ở đây</Text>
                  </Flex>
                )}
              </Card.Body>
              {videoUrl && (
                <Card.Footer bg="gray.50" py={3} px={6} borderTopWidth="1px" borderColor="gray.100">
                  <HStack justify="space-between" w="full" fontSize="xs" color="gray.500" fontWeight="medium">
                    <HStack>
                      <Clock size={14} />
                      <Text>{formatTimecode(currentTime)}</Text>
                    </HStack>
                    <Text>
                      {segments.length > 0
                        ? `Đoạn: ${(activeIndex ?? -1) + 1} / ${segments.length}`
                        : "Chưa có đoạn nào"}
                    </Text>
                  </HStack>
                </Card.Footer>
              )}
            </Card.Root>
          </Stack>

          {/* Right Column: Editor */}
          <Stack gap={6} h="full">
            <Card.Root variant="elevated" shadow="md" borderRadius="xl" h="full" display="flex" flexDirection="column" overflow="hidden">
              <Card.Header bg="white" borderBottomWidth="1px" borderColor="gray.100" py={4} px={6}>
                <HStack justify="space-between">
                  <HStack gap={3}>
                    <Card.Title fontSize="lg" fontWeight="semibold">Phụ đề</Card.Title>
                    <Badge variant="surface" colorPalette="blue" px={2} borderRadius="full">
                      {segments.length}
                    </Badge>
                  </HStack>
                  <Button
                    size="sm"
                    variant="outline"
                    colorPalette="gray"
                    disabled={!segments.length}
                    onClick={handleDownloadSrt}
                    fontWeight="medium"
                  >
                    <Download size={16} style={{ marginRight: 6 }} /> Tải file SRT
                  </Button>
                </HStack>
              </Card.Header>

              <Card.Body p={0} flex="1" overflow="hidden" display="flex" flexDirection="column" bg="white">
                {error && (
                  <Box p={6}>
                    <Alert.Root status="error" variant="subtle" borderRadius="lg">
                      <Alert.Indicator>
                        <AlertCircle />
                      </Alert.Indicator>
                      <Alert.Content>
                        <Alert.Title>Lỗi</Alert.Title>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  </Box>
                )}

                {segments.length === 0 ? (
                  <Flex
                    direction="column"
                    align="center"
                    justify="center"
                    flex="1"
                    p={10}
                    color="gray.400"
                    textAlign="center"
                    minH="400px"
                  >
                    <Flex p={6} bg="gray.50" borderRadius="full" mb={6} justify="center" align="center">
                      <Type size={40} className="text-gray-300" />
                    </Flex>
                    <Text fontSize="lg" fontWeight="medium" color="gray.600">
                      Chưa có dữ liệu phụ đề
                    </Text>
                    <Text fontSize="sm" maxW="xs" mt={2} color="gray.500" lineHeight="tall">
                      Hãy tải video lên và nhấn "Bắt đầu Transcribe" để hệ thống tự động tạo phụ đề cho bạn.
                    </Text>
                  </Flex>
                ) : (
                  <Box overflowY="auto" flex="1" className="custom-scrollbar">
                    <Table.Root size="sm" stickyHeader interactive>
                      <Table.Header>
                        <Table.Row bg="gray.50">
                          <Table.ColumnHeader w="60px" textAlign="center" py={3}>#</Table.ColumnHeader>
                          <Table.ColumnHeader w="140px" py={3}>Thời gian</Table.ColumnHeader>
                          <Table.ColumnHeader py={3}>Nội dung</Table.ColumnHeader>
                          <Table.ColumnHeader w="50px" py={3}></Table.ColumnHeader>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {segments.map((segment, index) => {
                          const isActive = index === activeIndex;
                          return (
                            <Table.Row
                              key={segment.id ?? index}
                              bg={isActive ? "blue.50" : undefined}
                              _hover={{ bg: isActive ? "blue.100" : "gray.50" }}
                              transition="background 0.1s"
                            >
                              <Table.Cell textAlign="center" color="gray.500" fontSize="xs" fontWeight="medium">
                                {index + 1}
                              </Table.Cell>
                              <Table.Cell>
                                <VStack gap={1.5} align="start">
                                  <Input
                                    size="xs"
                                    variant="subtle"
                                    fontFamily="mono"
                                    fontSize="2xs"
                                    value={segment.startTimecode}
                                    onChange={(e) =>
                                      handleTimeChange(index, "startTimecode", e.target.value)
                                    }
                                    onBlur={() => handleTimeBlur(index, "start")}
                                    w="84px"
                                    color="green.700"
                                    bg="white"
                                    borderRadius="sm"
                                    px={1}
                                  />
                                  <Input
                                    size="xs"
                                    variant="subtle"
                                    fontFamily="mono"
                                    fontSize="2xs"
                                    value={segment.endTimecode}
                                    onChange={(e) =>
                                      handleTimeChange(index, "endTimecode", e.target.value)
                                    }
                                    onBlur={() => handleTimeBlur(index, "end")}
                                    w="84px"
                                    color="red.700"
                                    bg="white"
                                    borderRadius="sm"
                                    px={1}
                                  />
                                </VStack>
                              </Table.Cell>
                              <Table.Cell py={3}>
                                <Textarea
                                  size="sm"
                                  variant="outline"
                                  resize="vertical"
                                  rows={2}
                                  value={segment.text}
                                  onChange={(e) => handleTextChange(index, e.target.value)}
                                  bg="white"
                                  borderColor={isActive ? "blue.200" : "gray.200"}
                                  _focus={{ borderColor: "blue.500", ring: "2px", ringColor: "blue.100" }}
                                  borderRadius="md"
                                />
                              </Table.Cell>
                              <Table.Cell>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  colorPalette="gray"
                                  onClick={() => handleSeekToSegment(index)}
                                  aria-label="Phát đoạn này"
                                >
                                  <Play size={14} fill="currentColor" />
                                </Button>
                              </Table.Cell>
                            </Table.Row>
                          );
                        })}
                      </Table.Body>
                    </Table.Root>
                  </Box>
                )}
              </Card.Body>
            </Card.Root>
          </Stack>
        </Grid>
      </Container>
    </Box>
  );
}
