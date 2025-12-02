/**
 * Simple JSON repair function - basic implementation
 */
function simpleJsonRepair(str: string): string {
  return str
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/([{,]\s*)(\w+):/g, '$1"$2":')
    .trim();
}

/**
 * Parse JSON từ AI response string
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAIResponse(response: string): any {
  if (!response || typeof response !== "string") {
    return null;
  }

  const cleaned = response.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // continue to fallbacks
  }

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    try {
      return JSON.parse(simpleJsonRepair(codeBlockMatch[1]?.trim() ?? ""));
    } catch {
      // continue to next fallback
    }
  }

  const jsonMatch = cleaned.match(/[{\[]([\s\S]*)[}\]]/);
  if (jsonMatch) {
    try {
      return JSON.parse(simpleJsonRepair(jsonMatch[0] ?? ""));
    } catch {
      // continue to final fallback
    }
  }

  try {
    return JSON.parse(simpleJsonRepair(cleaned));
  } catch (error) {
    console.warn("Could not parse AI response as JSON:", error);
    return null;
  }
}

