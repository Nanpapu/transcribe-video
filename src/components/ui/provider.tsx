"use client";

import { ChakraProvider } from "@chakra-ui/react";
import type { ReactNode } from "react";

type ProviderProps = {
  children: ReactNode;
};

export function Provider({ children }: ProviderProps) {
  return <ChakraProvider>{children}</ChakraProvider>;
}

