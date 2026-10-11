import { useParams } from "react-router";

export function useManualId(): string {
  return useParams().manualId!;
}
