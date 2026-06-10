import type { Metadata } from "next";
import { SummitTimerPage } from "@/components/leaderboard/summit-timer-page";

export const metadata: Metadata = {
  title: "Qualifier Timer | Trading Cup",
};

export default function QualifierTimerPage() {
  return <SummitTimerPage mode="qualifier" />;
}

