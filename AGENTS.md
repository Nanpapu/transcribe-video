Môi trường của bạn chỉ được xài bash. Tất cả cmd, powershell đều ko dc

## 📝 Quy tắc comment trong code
- Viết comment ngắn gọn, tập trung vào **lý do** hoặc bối cảnh khó hiểu; tránh mô tả những gì code đã thể hiện rõ.
- Khi xử lý logic phức tạp (ví dụ batch retry, tính chi phí, xử lý placeholder), đặt comment ở đầu block với 1–2 câu giải thích.
- Nếu một hàm có side-effect quan trọng hoặc giả định đặc biệt, thêm comment ngay phía trên khai báo hàm.
- Khi phát hiện chỗ cần ghi chú trong quá trình review, bổ sung ngay.
- Nếu yêu cầu từ reviewer/team cần comment chi tiết hơn, ưu tiên cập nhật comment thay vì chỉ giải thích miệng.


## ⚠️ CHAKRA UI V3 MIGRATION RULES - CRITICAL

### Package & Import Changes
```tsx
// ❌ REMOVED packages (DO NOT USE)
@emotion/styled, framer-motion, @chakra-ui/icons, @chakra-ui/hooks, @chakra-ui/next-js

// ✅ Import from @chakra-ui/react
Alert, Avatar, Button, Card, Field, Table, Input, NativeSelect, Tabs, Textarea,
Separator, useDisclosure, Box, Flex, Stack, HStack, VStack, Text, Heading, Icon

// ✅ Import from components/ui (relative imports)
Provider, Toaster, ColorModeProvider, Tooltip, PasswordInput
```

### Core Component Migrations

#### 1. Toast System
```tsx
// ❌ Old v2
const toast = useToast()
toast({ title: "Title", status: "error", isClosable: true, position: "top-right" })

// ✅ New v3
import { toaster } from "./components/ui/toaster"
toaster.create({
  title: "Title",
  type: "error",              // status → type
  meta: { closable: true },   // isClosable → meta.closable
  placement: "top-end"        // top-right → top-end
})
```

#### 2. Dialog (formerly Modal)
```tsx
// ❌ Old v2
<Modal isOpen={isOpen} onClose={onClose} isCentered>
  <ModalOverlay />
  <ModalContent>
    <ModalHeader>Title</ModalHeader>
    <ModalBody>Content</ModalBody>
  </ModalContent>
</Modal>

// ✅ New v3
<Dialog.Root open={isOpen} onOpenChange={onOpenChange} placement="center">
  <Dialog.Backdrop />
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>Title</Dialog.Title></Dialog.Header>
    <Dialog.Body>Content</Dialog.Body>
  </Dialog.Content>
</Dialog.Root>
```

#### 3. Alert Structure
```tsx
// ❌ Old v2
<Alert variant="left-accent">
  <AlertIcon />
  <AlertTitle>Title</AlertTitle>
  <AlertDescription>Description</AlertDescription>
</Alert>

// ✅ New v3
<Alert.Root borderStartWidth="4px" borderStartColor="colorPalette.solid">
  <Alert.Indicator />
  <Alert.Content>
    <Alert.Title>Title</Alert.Title>
    <Alert.Description>Description</Alert.Description>
  </Alert.Content>
</Alert.Root>
```

#### 4. Form Components
```tsx
// ❌ Old v2
<FormControl isInvalid>
  <FormLabel>Email</FormLabel>
  <Input />
</FormControl>

// ✅ New v3
<Field.Root invalid>
  <Field.Label>Email</Field.Label>
  <Input />
  <Field.ErrorText>This field is required</Field.ErrorText>
</Field.Root>
```

#### 5. Table Structure
```tsx
// ❌ Old v2
<Table variant="simple">
  <Thead><Tr><Th>Header</Th></Tr></Thead>
  <Tbody><Tr><Td>Cell</Td></Tr></Tbody>
</Table>

// ✅ New v3
<Table.Root variant="line">
  <Table.Header>
    <Table.Row><Table.ColumnHeader>Header</Table.ColumnHeader></Table.Row>
  </Table.Header>
  <Table.Body>
    <Table.Row><Table.Cell>Cell</Table.Cell></Table.Row>
  </Table.Body>
</Table.Root>
```

#### 6. Tabs
```tsx
// ❌ Old v2
<Tabs>
  <TabList><Tab>One</Tab></TabList>
  <TabPanels><TabPanel>Content</TabPanel></TabPanels>
</Tabs>

// ✅ New v3
<Tabs.Root defaultValue="one" colorPalette="orange">
  <Tabs.List><Tabs.Trigger value="one">One</Tabs.Trigger></Tabs.List>
  <Tabs.Content value="one">Content</Tabs.Content>
</Tabs.Root>
```

#### 7. Menu
```tsx
// ❌ Old v2
<Menu>
  <MenuButton as={Button}>Actions</MenuButton>
  <MenuList><MenuItem>Download</MenuItem></MenuList>
</Menu>

// ✅ New v3
<Menu.Root>
  <Menu.Trigger asChild><Button>Actions</Button></Menu.Trigger>
  <Menu.Content><Menu.Item value="download">Download</Menu.Item></Menu.Content>
</Menu.Root>
```

#### 8. Popover
```tsx
// ❌ Old v2
<Popover>
  <PopoverTrigger><Button>Click</Button></PopoverTrigger>
  <PopoverContent>
    <PopoverArrow />
    <PopoverBody>Content</PopoverBody>
  </PopoverContent>
</Popover>

// ✅ New v3
<Popover.Root positioning={{ placement: "bottom-end" }}>
  <Popover.Trigger asChild><Button>Click</Button></Popover.Trigger>
  <Popover.Content>
    <PopoverArrow />
    <Popover.Body>Content</Popover.Body>
  </Popover.Content>
</Popover.Root>
```

#### 9. Select/NativeSelect
```tsx
// ❌ Old v2
<Select placeholder="Select option">
  <option value="1">Option 1</option>
</Select>

// ✅ New v3
<NativeSelect.Root size="sm">
  <NativeSelect.Field placeholder="Select option">
    <option value="1">Option 1</option>
  </NativeSelect.Field>
  <NativeSelect.Indicator />
</NativeSelect.Root>
```

#### 10. Tooltip
```tsx
// ❌ Old v2
<Tooltip label="Content" hasArrow placement="top">
  <Button>Hover me</Button>
</Tooltip>

// ✅ New v3
import { Tooltip } from "./components/ui/tooltip"
<Tooltip content="Content" showArrow positioning={{ placement: "top" }}>
  <Button>Hover me</Button>
</Tooltip>
```

### Prop Name Changes

#### Boolean Props
- `isOpen` → `open`
- `isDisabled` → `disabled`
- `isInvalid` → `invalid`
- `isRequired` → `required`
- `isActive` → `data-active`
- `isLoading` → `loading`
- `isChecked` → `checked`
- `isIndeterminate` → `indeterminate`

#### Style Props
- `colorScheme` → `colorPalette`
- `spacing` → `gap`
- `noOfLines` → `lineClamp`
- `truncated` → `truncate`
- `thickness` → `borderWidth`
- `speed` → `animationDuration`

#### Component Renames
- `Divider` → `Separator`
- `Modal` → `Dialog`
- `Collapse` → `Collapsible`
- `Tags` → `Badge`

### Button Icons
```tsx
// ❌ Old v2
<Button leftIcon={<Mail />} rightIcon={<ChevronRight />}>Email</Button>

// ✅ New v3
<Button>
  <Mail /> Email <ChevronRight />
</Button>
```

### Style System Changes

#### Nested Styles
```tsx
// ❌ Old v2
<Box sx={{ svg: { color: "red.500" } }} />

// ✅ New v3 (the & is required)
<Box css={{ "& svg": { color: "red.500" } }} />
```

#### Gradients
```tsx
// ❌ Old v2
<Box bgGradient="linear(to-r, red.200, pink.500)" />

// ✅ New v3
<Box bgGradient="to-r" gradientFrom="red.200" gradientTo="pink.500" />
```

#### Theme Access
```tsx
// ❌ Old v2
const theme = useTheme()
const gray400 = theme.colors.gray["400"]

// ✅ New v3
const system = useChakra()
const gray400 = system.token("colors.gray.400")
```

### 🚨 MANDATORY COMPOUND COMPONENTS
**Khi thấy bất kỳ component nào trong list này, PHẢI dùng compound structure:**

- `Alert.Root` + `Alert.Indicator` + `Alert.Title`
- `Card.Root` + `Card.Header` + `Card.Body`
- `Dialog.Root` + `Dialog.Content` + `Dialog.Header` + `Dialog.Body`
- `Field.Root` + `Field.Label` + `Field.ErrorText`
- `Menu.Root` + `Menu.Trigger` + `Menu.Content` + `Menu.Item`
- `Popover.Root` + `Popover.Trigger` + `Popover.Content`
- `Progress.Root` + `Progress.Track` + `Progress.Range`
- `Stat.Root` + `Stat.Label` + `Stat.ValueText`
- `Table.Root` + `Table.Header` + `Table.Body` + `Table.Row` + `Table.Cell`
- `Tabs.Root` + `Tabs.List` + `Tabs.Trigger` + `Tabs.Content`

## 🎨 ICON USAGE RULES - CRITICAL

### ❌ NEVER USE EMOJI ICONS
```jsx
// ❌ WRONG - Trông AI-generated, không professional
<Heading>🏠 Dashboard</Heading>
<Button>📁 Thêm dự án</Button>
<Text fontSize="4xl">👥</Text>
```

### ✅ ALWAYS USE LUCIDE REACT SVG ICONS
```jsx
// ✅ CORRECT - Professional, customizable, consistent
import { Home, Folder, Users, Plus } from 'lucide-react';

// In headings with icon
<HStack gap={2}>
  <Home size={24} />
  <Heading>Dashboard</Heading>
</HStack>

// In buttons with icon
<Button>
  <Plus size={16} style={{ marginRight: '6px' }} />
  Thêm dự án
</Button>

// Large icon display
<Users size={48} strokeWidth={1.5} />
```

### Icon Library Location
- **Constants File**: `/src/constants/icons.tsx`
- **Available Icons**: Home, Folder, User, Users, Building2, BarChart3, Plus, Check, X, AlertTriangle, Trash2, Mail, Lock, ArrowLeft, ChevronRight, etc.

### Import Pattern
```tsx
// Import specific icons from lucide-react
import { Home, Folder, Users, Plus, Settings } from 'lucide-react';

// Usage with size
<Home size={16} />        // Small (buttons, breadcrumbs)
<Folder size={20} />      // Medium (headings, cards)
<Users size={24} />       // Large (page titles)
<BarChart3 size={48} />   // Extra large (featured displays)
```
