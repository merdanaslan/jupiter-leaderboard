"use client";

import { FinalDisplay } from "./final-display";
import { QualifierDisplay } from "./qualifier-display";
import { useLeaderboard } from "./useLeaderboard";

export function DisplayRouter() {
  const { data } = useLeaderboard("qualifier", 2000);

  if (data?.state.activeMode === "final") return <FinalDisplay />;
  return <QualifierDisplay />;
}
