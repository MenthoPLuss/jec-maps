import type { Metadata } from "next";

import TextPage from "@/components/ui/TextPage";
import { DISCLAIMER } from "@/lib/text";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <TextPage title="About JEC Maps">
      <p>
        <strong>{DISCLAIMER}.</strong> The college has not made, checked or approved this app.
      </p>
      <p>JEC Maps is made by a student. It helps you find a building, a place or a room on campus.</p>

      <h2>How far you can trust it</h2>
      <ul>
        <li>
          Your phone only estimates where you are. Next to tall buildings and indoors it can be wrong by tens of metres.
        </li>
        <li>GPS can&apos;t tell which building, floor or room you are in. You tell the app, and it says so.</li>
        <li>
          Floor plans are sketches made from photos and walkthroughs. They are not surveyed and not for emergencies.
        </li>
        <li>
          A solid route follows paths that a person has checked. A dashed line is only a direction: check for fences and
          closed gates yourself.
        </li>
        <li>
          While the &ldquo;Demo data&rdquo; badge is on screen, the campus is made up and the app will not guide you
          with your real position.
        </li>
      </ul>

      <h2>Credits</h2>
      <ul>
        <li>Map engine: MapLibre GL JS (BSD-3-Clause)</li>
        <li>Map data, where it is used: © OpenStreetMap contributors (ODbL)</li>
      </ul>
    </TextPage>
  );
}
