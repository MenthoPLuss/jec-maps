import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ReviewApp from "@/components/review/ReviewApp";
import { config, isReviewToolAvailable } from "@/lib/config";

export const metadata: Metadata = {
  title: "Review campus data",
  robots: { index: false, follow: false },
};

/** A tool for the people who collect the data. Visitors of a normal build get "not found". */
export default function ReviewPage() {
  if (!isReviewToolAvailable(config, process.env.NODE_ENV)) notFound();
  return <ReviewApp />;
}
