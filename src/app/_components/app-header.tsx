import { Box, Button, Container, Flex, Heading, HStack, Text } from "@chakra-ui/react";
import { Video } from "lucide-react";

export function AppHeader() {
  return (
    <Box
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
      py={5}
      px={8}
      position="sticky"
      top={0}
      zIndex={10}
      shadow="sm"
    >
      <Container maxW="7xl">
        <HStack justify="space-between">
          <HStack gap={4}>
            <Flex
              align="center"
              justify="center"
              p={2.5}
              bg="blue.600"
              borderRadius="xl"
              color="white"
              shadow="md"
            >
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
  );
}

