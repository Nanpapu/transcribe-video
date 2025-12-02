import { type ChangeEvent, type RefObject } from "react";
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
  Text,
  VStack,
} from "@chakra-ui/react";
import { CheckCircle2, FileVideo, Trash2, UploadCloud, Wand2 } from "lucide-react";
import { ASR_MODELS, type AsrModelId } from "@/lib/asr-models";

type FileUploadCardProps = {
  file: File | null;
  isTranscribing: boolean;
  inputRef: RefObject<HTMLInputElement>;
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
            <Field.Label
              htmlFor="asr-model"
              fontSize="sm"
              color="gray.700"
              fontWeight="medium"
            >
              Model nhận dạng
            </Field.Label>
            <NativeSelect.Root size="sm" variant="outline" width="260px">
              <NativeSelect.Field
                id="asr-model"
                value={model}
                onChange={(event) => onModelChange(event.target.value as AsrModelId)}
              >
                {ASR_MODELS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
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

