/* eslint-disable react/jsx-no-useless-fragment */
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
  Box,
  Button,
  Field,
  Flex,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Table,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { Download, UploadCloud } from "lucide-react";

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

  if (!value) {
    return null;
  }

  const [main, msPart] = value.split(/[.,]/);
  const msRaw = msPart ? msPart.trim() : "";
  const ms = msRaw ? Number.parseInt(msRaw.slice(0, 3).padEnd(3, "0"), 10) : 0;

  const parts = main.split(":").map((part) => part.trim()).filter(Boolean);

  if (parts.some((part) => Number.isNaN(Number.parseInt(part, 10)))) {
    return null;
  }

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

  if (minutes > 59 || seconds > 59) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function segmentsToSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((segment, index) => {
      const start = formatTimecode(segment.start);
      const end = formatTimecode(segment.end);

      return `${index + 1}
${start} --> ${end}
${segment.text}
`;
    })
    .join("\n")
    .trim();
}

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

  useEffect(
    () => () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    },
    [videoUrl],
  );

  const currentSegment = useMemo(
    () => (activeIndex === null ? null : segments[activeIndex] ?? null),
    [activeIndex, segments],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;

    if (!nextFile) {
      setFile(null);
      setVideoUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }

        return null;
      });
      return;
    }

    setFile(nextFile);
    setError(null);

    setVideoUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }

      return URL.createObjectURL(nextFile);
    });
  };

  const handleClearFile = () => {
    setFile(null);
    setSegments([]);
    setError(null);
    setActiveIndex(null);
    setCurrentTime(0);

    setVideoUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }

      return null;
    });

    if (inputRef.current) {
      // eslint-disable-next-line no-param-reassign
      inputRef.current.value = "";
    }
  };

  const handleTranscribe = async () => {
    if (!file) {
      setError("Chưa chọn file video hoặc audio.");
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
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        const message = payload?.error ?? "Transcribe thất bại.";
        setError(message);
        return;
      }

      const data = (await response.json()) as TranscriptResponse;

      const mappedSegments: EditableSegment[] = (data.segments ?? []).map(
        (segment) => ({
          ...segment,
          startTimecode: formatTimecode(segment.start),
          endTimecode: formatTimecode(segment.end),
        }),
      );

      setSegments(mappedSegments);
      setActiveIndex(null);
      setCurrentTime(0);

      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    } catch (exception) {
      setError("Không thể gọi API transcribe. Kiểm tra server hoặc cấu hình lại sau.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTimeChange = (
    index: number,
    field: "startTimecode" | "endTimecode",
    value: string,
  ) => {
    setSegments((previous) =>
      previous.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, [field]: value } : segment,
      ),
    );
  };

  const handleTimeBlur = (index: number, kind: "start" | "end") => {
    setSegments((previous) => {
      const draft = [...previous];
      const segment = draft[index];

      if (!segment) {
        return previous;
      }

      const raw = kind === "start" ? segment.startTimecode : segment.endTimecode;
      const seconds = parseTimecode(raw);

      if (seconds === null) {
        const fallbackSeconds = kind === "start" ? segment.start : segment.end;
        const fallback = formatTimecode(fallbackSeconds);

        draft[index] =
          kind === "start"
            ? { ...segment, startTimecode: fallback }
            : { ...segment, endTimecode: fallback };

        return draft;
      }

      if (kind === "start") {
        draft[index] = {
          ...segment,
          start: seconds,
          startTimecode: formatTimecode(seconds),
        };
      } else {
        draft[index] = {
          ...segment,
          end: seconds,
          endTimecode: formatTimecode(seconds),
        };
      }

      return draft;
    });
  };

  const handleTextChange = (index: number, value: string) => {
    setSegments((previous) =>
      previous.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, text: value } : segment,
      ),
    );
  };

  const handleDownloadSrt = () => {
    if (!segments.length) {
      return;
    }

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

    const foundIndex =
      segments.findIndex(
        (segment) => nextTime >= segment.start && nextTime < segment.end,
      ) ?? -1;

    setActiveIndex(foundIndex >= 0 ? foundIndex : null);
  };

  const handleSeekToSegment = (index: number) => {
    const target = segments[index];

    if (!target || !videoRef.current) {
      return;
    }

    videoRef.current.currentTime = target.start;
    videoRef.current.play().catch(() => {});
  };

  const handlePositionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as SubtitlePosition;
    setSubtitlePosition(value);
  };

  const overlayStyles = (() => {
    if (subtitlePosition === "top") {
      return {
        top: "8",
        bottom: undefined,
        transform: "translateX(-50%)",
      };
    }

    if (subtitlePosition === "middle") {
      return {
        top: "50%",
        bottom: undefined,
        transform: "translate(-50%, -50%)",
      };
    }

    return {
      top: undefined,
      bottom: "8",
      transform: "translateX(-50%)",
    };
  })();

  return (
    <Box minH="100vh" bg="gray.950" color="gray.50">
      <Box maxW="1120px" mx="auto" px={{ base: 4, md: 6 }} py={{ base: 6, md: 10 }}>
        <VStack align="stretch" gap={4}>
          <Box>
            <Text fontSize="sm" color="gray.400" textTransform="uppercase" letterSpacing="0.12em">
              Subtitle tool
            </Text>
            <Text fontSize="2xl" fontWeight="semibold" mt={1}>
              Transcribe video, chỉnh sửa sub, xuất SRT
            </Text>
            <Text fontSize="sm" color="gray.400" mt={2} maxW="640px">
              Chọn file video hoặc âm thanh, gửi đi transcribe, sau đó chỉnh sửa timecode và nội dung
              sub. Subtitle overlay mặc định nền vàng, chữ đen giống CapCut.
            </Text>
          </Box>

          <Flex
            gap={{ base: 6, lg: 8 }}
            mt={2}
            direction={{ base: "column", lg: "row" }}
            align="stretch"
          >
            <Box
              flex="1"
              borderWidth="1px"
              borderColor="gray.800"
              borderRadius="xl"
              bg="gray.900"
              p={4}
            >
              <Stack gap={4}>
                <Box
                  borderWidth="1px"
                  borderStyle="dashed"
                  borderColor="gray.700"
                  borderRadius="xl"
                  bg="gray.900"
                  px={4}
                  py={6}
                  cursor="pointer"
                  onClick={() => inputRef.current?.click()}
                >
                  <VStack gap={3}>
                    <Box
                      w={12}
                      h={12}
                      borderRadius="full"
                      bg="gray.800"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <UploadCloud size={22} />
                    </Box>
                    <Text fontWeight="medium">
                      {file ? "Đã chọn file, bấm Transcribe để xử lý" : "Nhấn để chọn video / audio"}
                    </Text>
                    <Text fontSize="xs" color="gray.400">
                      Hỗ trợ video và âm thanh phổ biến. Thời lượng càng dài thì thời gian xử lý càng
                      lâu.
                    </Text>
                    {file ? (
                      <Text fontSize="xs" color="gray.300">
                        File hiện tại: {file.name}
                      </Text>
                    ) : null}
                  </VStack>
                  <Input
                    ref={inputRef}
                    type="file"
                    accept="video/*,audio/*"
                    display="none"
                    onChange={handleFileChange}
                  />
                </Box>

                <HStack justify="space-between" gap={3}>
                  <HStack gap={2}>
                    <Button
                      size="sm"
                      colorPalette="yellow"
                      onClick={handleTranscribe}
                      loading={isTranscribing}
                      disabled={!file || isTranscribing}
                    >
                      Transcribe
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClearFile}
                      disabled={!file && !segments.length}
                    >
                      Xóa file
                    </Button>
                  </HStack>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadSrt}
                    disabled={!segments.length}
                  >
                    <Download size={16} style={{ marginRight: 6 }} />
                    Tải SRT
                  </Button>
                </HStack>

                <Field.Root>
                  <Field.Label fontSize="sm">Vị trí subtitle trên video</Field.Label>
                  <NativeSelect.Root size="sm" maxW="220px" mt={2}>
                    <NativeSelect.Field value={subtitlePosition} onChange={handlePositionChange}>
                      <option value="bottom">Dưới (mặc định)</option>
                      <option value="middle">Giữa khung hình</option>
                      <option value="top">Trên cùng</option>
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>

                <Box mt={2}>
                  <Text fontSize="sm" mb={2}>
                    Preview video kèm subtitle
                  </Text>
                  <Box
                    position="relative"
                    borderRadius="lg"
                    overflow="hidden"
                    bg="black"
                    minH="220px"
                  >
                    {videoUrl ? (
                      <>
                        <video
                          ref={videoRef}
                          src={videoUrl}
                          controls
                          style={{ width: "100%", height: "auto", display: "block" }}
                          onTimeUpdate={handleTimeUpdate}
                        />
                        {currentSegment ? (
                          <Box
                            position="absolute"
                            left="50%"
                            px={4}
                            py={2}
                            bg="yellow.300"
                            color="black"
                            borderRadius="md"
                            maxW="90%"
                            textAlign="center"
                            fontWeight="semibold"
                            fontSize="lg"
                            boxShadow="0 0 12px rgba(0,0,0,0.6)"
                            {...overlayStyles}
                          >
                            <Text>{currentSegment.text}</Text>
                          </Box>
                        ) : null}
                      </>
                    ) : (
                      <Flex
                        align="center"
                        justify="center"
                        h="100%"
                        minH="220px"
                        px={4}
                        py={6}
                      >
                        <Text fontSize="sm" color="gray.500">
                          Chọn file để xem preview video và subtitle.
                        </Text>
                      </Flex>
                    )}
                  </Box>
                </Box>
              </Stack>
            </Box>

            <Box
              flex="1"
              borderWidth="1px"
              borderColor="gray.800"
              borderRadius="xl"
              bg="gray.900"
              p={4}
            >
              <Stack gap={3} h="100%">
                <HStack justify="space-between" align="center">
                  <Text fontWeight="medium">Subtitle segments</Text>
                  <Text fontSize="xs" color="gray.400">
                    Tổng: {segments.length} đoạn
                  </Text>
                </HStack>

                {error ? (
                  <Alert.Root borderStartWidth="4px" borderStartColor="red.500">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Lỗi</Alert.Title>
                      <Alert.Description fontSize="sm">{error}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                ) : null}

                <Box
                  flex="1"
                  borderRadius="lg"
                  borderWidth="1px"
                  borderColor="gray.800"
                  overflow="hidden"
                  bg="gray.950"
                >
                  {segments.length === 0 ? (
                    <Flex
                      align="center"
                      justify="center"
                      h="100%"
                      minH="260px"
                      px={4}
                      py={6}
                    >
                      <Text fontSize="sm" color="gray.500" textAlign="center">
                        Chưa có dữ liệu subtitle. Chọn file và bấm Transcribe để tạo danh sách segment
                        SRT, sau đó chỉnh thời gian và nội dung tại đây.
                      </Text>
                    </Flex>
                  ) : (
                    <Box maxH="420px" overflowY="auto">
                      <Table.Root size="sm" variant="line">
                        <Table.Header position="sticky" top={0} bg="gray.950" zIndex={1}>
                          <Table.Row>
                            <Table.ColumnHeader w="48px">#</Table.ColumnHeader>
                            <Table.ColumnHeader w="152px">Start</Table.ColumnHeader>
                            <Table.ColumnHeader w="152px">End</Table.ColumnHeader>
                            <Table.ColumnHeader>Text</Table.ColumnHeader>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {segments.map((segment, index) => (
                            <Table.Row
                              key={segment.id ?? index}
                              bg={index === activeIndex ? "yellow.900" : "transparent"}
                              _hover={{ bg: "gray.900", cursor: "pointer" }}
                              onClick={() => handleSeekToSegment(index)}
                            >
                              <Table.Cell fontSize="xs" color="gray.400">
                                {index + 1}
                              </Table.Cell>
                              <Table.Cell>
                                <Input
                                  size="xs"
                                  value={segment.startTimecode}
                                  onChange={(event) =>
                                    handleTimeChange(index, "startTimecode", event.target.value)
                                  }
                                  onBlur={() => handleTimeBlur(index, "start")}
                                />
                              </Table.Cell>
                              <Table.Cell>
                                <Input
                                  size="xs"
                                  value={segment.endTimecode}
                                  onChange={(event) =>
                                    handleTimeChange(index, "endTimecode", event.target.value)
                                  }
                                  onBlur={() => handleTimeBlur(index, "end")}
                                />
                              </Table.Cell>
                              <Table.Cell>
                                <Textarea
                                  size="xs"
                                  rows={2}
                                  value={segment.text}
                                  onChange={(event) => handleTextChange(index, event.target.value)}
                                />
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    </Box>
                  )}
                </Box>

                {segments.length > 0 && currentSegment ? (
                  <Box mt={2}>
                    <Text fontSize="xs" color="gray.400">
                      Đang phát: đoạn {activeIndex !== null ? activeIndex + 1 : "-"} / {segments.length}{" "}
                      ({formatTimecode(currentTime)})
                    </Text>
                  </Box>
                ) : null}
              </Stack>
            </Box>
          </Flex>
        </VStack>
      </Box>
    </Box>
  );
}
