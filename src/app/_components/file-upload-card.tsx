import { type ChangeEvent, type RefObject, useState } from "react";
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
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileVideo,
  Trash2,
  UploadCloud,
  Wand2,
} from "lucide-react";
import { ASR_MODELS, type AsrModelId } from "@/lib/asr-models";

type FileUploadCardProps = {
  file: File | null;
  isTranscribing: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  model: AsrModelId;
  onModelChange: (value: AsrModelId) => void;
  language: "auto" | "zh" | "ko" | "en" | "ja" | "vi";
  onLanguageChange: (value: "auto" | "zh" | "ko" | "en" | "ja" | "vi") => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onTranscribe: () => void;
  fileDurationSeconds: number | null;
};

export function FileUploadCard({
  file,
  isTranscribing,
  inputRef,
  model,
  onModelChange,
  language,
  onLanguageChange,
  onFileChange,
  onClearFile,
  onTranscribe,
  fileDurationSeconds,
}: FileUploadCardProps) {
  const deepInfraModels = ASR_MODELS.filter((item) => item.provider === "deepinfra");
  const usdToVndRate = 27300;
  const [pricingOpen, setPricingOpen] = useState(false);

  const formatUsdPerMinute = (value: number) =>
    `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 8,
    })}/phút`;

  const formatVndPerMinute = (value: number) =>
    `${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    })} VND/phút`;

  const formatDurationLabel = (value: number) => {
    const totalSeconds = Math.max(0, Math.round(value));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  const formatUsdAmount = (value: number) =>
    `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 8,
    })}`;

  const formatVndAmount = (value: number) =>
    `${value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} VND`;

  const selectedModel = deepInfraModels.find((item) => item.id === model);
  const hasDuration =
    selectedModel !== undefined &&
    typeof fileDurationSeconds === "number" &&
    fileDurationSeconds > 0;
  const estimatedCostUsd = hasDuration
    ? selectedModel.pricePerMinuteUsd * (fileDurationSeconds / 60)
    : null;
  const estimatedCostVnd = estimatedCostUsd !== null ? estimatedCostUsd * usdToVndRate : null;

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
          <Field.Root orientation="horizontal" w="full" gap={4}>
            <Field.Label htmlFor="asr-model-select" fontSize="sm" color="gray.700" fontWeight="medium">
              Model nhận dạng
            </Field.Label>
            <NativeSelect.Root size="sm" variant="outline" width="260px">
              <NativeSelect.Field
                id="asr-model-select"
                value={model}
                onChange={(event) => onModelChange(event.target.value as AsrModelId)}
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
          <Field.Root orientation="horizontal" w="full" gap={4} mt={4}>
            <Field.Label htmlFor="asr-language-select" fontSize="sm" color="gray.700" fontWeight="medium">
              Ngôn ngữ
            </Field.Label>
            <NativeSelect.Root size="sm" variant="outline" width="260px">
              <NativeSelect.Field
                id="asr-language-select"
                value={language}
                onChange={(event) =>
                  onLanguageChange(
                    event.target.value as "auto" | "zh" | "ko" | "en" | "ja" | "vi",
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
          <Box mt={6} borderWidth="1px" borderColor="gray.100" borderRadius="lg" bg="gray.50" p={4}>
          <Button
            variant="ghost"
            w="full"
            justifyContent="space-between"
            px={0}
            onClick={() => setPricingOpen((prev) => !prev)}
            aria-expanded={pricingOpen}
          >
            <HStack w="full" justify="space-between">
              <Text fontWeight="semibold" fontSize="sm">
                Giá thuê ngoài (theo phút)
              </Text>
              {pricingOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </HStack>
          </Button>
          {pricingOpen && (
            <>
              <Text fontSize="xs" color="gray.500" mt={1} mb={3}>
                Tỷ giá 1 USD = 27,300 VND
              </Text>
              {estimatedCostUsd !== null && fileDurationSeconds !== null && (
                <Box
                  p={3}
                  borderWidth="1px"
                  borderColor="gray.100"
                  borderRadius="md"
                  bg="white"
                  mb={4}
                >
                  <Text fontSize="xs" color="gray.600">
                    Chi phí ước tính ({formatDurationLabel(fileDurationSeconds)}):
                  </Text>
                  <Text fontSize="lg" fontWeight="semibold" mt={1}>
                    {formatUsdAmount(estimatedCostUsd)}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    ~{formatVndAmount(estimatedCostVnd ?? 0)}
                  </Text>
                </Box>
              )}
              <Table.Root variant="line" w="full">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>Model</Table.ColumnHeader>
                    <Table.ColumnHeader>Task</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Giá / phút</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
              <Table.Body>
                {deepInfraModels.map((entry) => {
                  const perMinuteUsd = entry.pricePerMinuteUsd;
                  const perMinuteVnd = perMinuteUsd * usdToVndRate;
                  return (
                    <Table.Row key={entry.id}>
                      <Table.Cell>
                        <Text fontWeight="semibold">{entry.label}</Text>
                        <Text fontSize="xs" color="gray.500">
                          {entry.id}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text fontSize="sm" color="gray.600">
                          {entry.task}
                        </Text>
                      </Table.Cell>
                      <Table.Cell textAlign="right">
                        <Text fontWeight="semibold">{formatUsdPerMinute(perMinuteUsd)}</Text>
                        <Text fontSize="xs" color="gray.500">
                          ~{formatVndPerMinute(perMinuteVnd)}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
            </>
          )}
          </Box>
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
  );
}
