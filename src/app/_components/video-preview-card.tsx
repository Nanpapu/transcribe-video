import { type SyntheticEvent, type RefObject, type ChangeEvent } from "react";
import {
  Box,
  Card,
  Field,
  Flex,
  HStack,
  NativeSelect,
  Text,
  chakra,
} from "@chakra-ui/react";
import { Clock, LayoutTemplate } from "lucide-react";
import { formatTimecode, type SubtitlePosition } from "@/lib/transcript";

type VideoPreviewCardProps = {
  videoUrl: string | null;
  videoRef: RefObject<HTMLVideoElement>;
  subtitlePosition: SubtitlePosition;
  onSubtitlePositionChange: (position: SubtitlePosition) => void;
  onTimeUpdate: (event: SyntheticEvent<HTMLVideoElement>) => void;
  currentSegmentText: string | null;
  currentTime: number;
  totalSegments: number;
  activeIndex: number | null;
};

export function VideoPreviewCard({
  videoUrl,
  videoRef,
  subtitlePosition,
  onSubtitlePositionChange,
  onTimeUpdate,
  currentSegmentText,
  currentTime,
  totalSegments,
  activeIndex,
}: VideoPreviewCardProps) {
  const handlePositionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onSubtitlePositionChange(event.target.value as SubtitlePosition);
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
    <Card.Root variant="elevated" shadow="md" borderRadius="xl" overflow="hidden">
      <Card.Header bg="white" borderBottomWidth="1px" borderColor="gray.100" py={4} px={6}>
        <HStack justify="space-between">
          <Card.Title fontSize="lg" fontWeight="semibold">
            Xem trước
          </Card.Title>
          <Field.Root orientation="horizontal" w="auto" gap={3}>
            <Field.Label
              htmlFor="subtitle-position"
              fontSize="xs"
              color="gray.600"
              fontWeight="medium"
            >
              Vị trí phụ đề
            </Field.Label>
            <NativeSelect.Root size="xs" variant="subtle" width="140px">
              <NativeSelect.Field
                id="subtitle-position"
                value={subtitlePosition}
                onChange={handlePositionChange}
                fontSize="xs"
                fontWeight="medium"
                aria-label="Chọn vị trí hiển thị phụ đề"
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
              onTimeUpdate={onTimeUpdate}
            />
            {currentSegmentText && (
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
                {currentSegmentText}
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
            <Text fontSize="sm" color="gray.500">
              Video xem trước sẽ hiện ở đây
            </Text>
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
              {totalSegments > 0
                ? `Đoạn: ${(activeIndex ?? -1) + 1} / ${totalSegments}`
                : "Chưa có đoạn nào"}
            </Text>
          </HStack>
        </Card.Footer>
      )}
    </Card.Root>
  );
}

