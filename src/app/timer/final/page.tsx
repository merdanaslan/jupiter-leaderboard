import type { Metadata } from "next";
import { SummitTimerPage } from "@/components/leaderboard/summit-timer-page";

export const metadata: Metadata = {
  title: "Final Timer | Trading Cup",
};

export default function FinalTimerPage() {
  return <SummitTimerPage mode="final" />;
}

