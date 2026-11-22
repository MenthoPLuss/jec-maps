import type { Metadata } from "next";

import TextPage from "@/components/ui/TextPage";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <TextPage title="Help">
      <h2>Finding a place</h2>
      <p>Type its name into the search. Room numbers and building names work too.</p>

      <h2>Location is not working</h2>
      <ul>
        <li>The app asks for your location only after you press &ldquo;Enable location&rdquo;.</li>
        <li>
          <strong>You said no before:</strong> open the settings of this site in your browser (the icon next to the
          address), allow Location, then reload the page.
        </li>
        <li>
          <strong>Android:</strong> Settings → Location must be on. Allow &ldquo;Precise location&rdquo; for your
          browser.
        </li>
        <li>
          <strong>iPhone:</strong> Settings → Privacy &amp; Security → Location Services, then your browser: choose
          &ldquo;While Using&rdquo; and turn on Precise Location.
        </li>
        <li>The address has to start with https. Browsers block location on other addresses.</li>
        <li>Step outside, away from walls, and wait half a minute. The first fix is often the worst.</li>
      </ul>

      <h2>The app has to stay open</h2>
      <p>Browsers pause location when the screen is off or another app is in front. Come back and it continues.</p>
    </TextPage>
  );
}
