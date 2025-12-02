import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Flex,
  HStack,
  Input,
  Table,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { AlertCircle, Play, Type, Download } from "lucide-react";
import type { EditableTranscriptSegment } from "@/lib/transcript";

type SubtitleEditorCardProps = {
  segments: EditableTranscriptSegment[];
  error: string | null;
  activeIndex: number | null;
  onDownloadSrt: () => void;
  onTimeChange: (
    index: number,
    field: "startTimecode" | "endTimecode",
    value: string,
  ) => void;
  onTimeBlur: (index: number, kind: "start" | "end") => void;
  onTextChange: (index: number, value: string) => void;
  onSeekToSegment: (index: number) => void;
};

export function SubtitleEditorCard({
  segments,
  error,
  activeIndex,
  onDownloadSrt,
  onTimeChange,
  onTimeBlur,
  onTextChange,
  onSeekToSegment,
}: SubtitleEditorCardProps) {
  return (
    <Card.Root
      variant="elevated"
      shadow="md"
      borderRadius="xl"
      h="full"
      display="flex"
      flexDirection="column"
      overflow="hidden"
    >
      <Card.Header bg="white" borderBottomWidth="1px" borderColor="gray.100" py={4} px={6}>
        <HStack justify="space-between">
          <HStack gap={3}>
            <Card.Title fontSize="lg" fontWeight="semibold">
              Phụ đề
            </Card.Title>
            <Badge variant="surface" colorPalette="blue" px={2} borderRadius="full">
              {segments.length}
            </Badge>
          </HStack>
          <Button
            size="sm"
            variant="outline"
            colorPalette="gray"
            disabled={!segments.length}
            onClick={onDownloadSrt}
            fontWeight="medium"
          >
            <Download size={16} style={{ marginRight: 6 }} /> Tải file SRT
          </Button>
        </HStack>
      </Card.Header>

      <Card.Body
        p={0}
        flex="1"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        bg="white"
      >
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
              Hãy tải video lên và nhấn &quot;Bắt đầu Transcribe&quot; để hệ thống tự động tạo phụ
              đề cho bạn.
            </Text>
          </Flex>
        ) : (
          <Box overflowY="auto" flex="1" className="custom-scrollbar">
            <Table.Root size="sm" stickyHeader interactive>
              <Table.Header>
                <Table.Row bg="gray.50">
                  <Table.ColumnHeader w="60px" textAlign="center" py={3}>
                    #
                  </Table.ColumnHeader>
                  <Table.ColumnHeader w="140px" py={3}>
                    Thời gian
                  </Table.ColumnHeader>
                  <Table.ColumnHeader py={3}>Nội dung</Table.ColumnHeader>
                  <Table.ColumnHeader w="50px" py={3} />
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
                      <Table.Cell
                        textAlign="center"
                        color="gray.500"
                        fontSize="xs"
                        fontWeight="medium"
                      >
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
                            onChange={(event) =>
                              onTimeChange(index, "startTimecode", event.target.value)
                            }
                            onBlur={() => onTimeBlur(index, "start")}
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
                            onChange={(event) =>
                              onTimeChange(index, "endTimecode", event.target.value)
                            }
                            onBlur={() => onTimeBlur(index, "end")}
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
                          onChange={(event) => onTextChange(index, event.target.value)}
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
                          onClick={() => onSeekToSegment(index)}
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
  );
}

