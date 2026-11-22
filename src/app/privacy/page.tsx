import type { Metadata } from "next";

import OnlineMapSetting from "@/components/ui/OnlineMapSetting";
import TextPage from "@/components/ui/TextPage";
import { config } from "@/lib/config";
import { providerName } from "@/lib/map/basemap";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <TextPage title="Privacy">
      <p>
        <strong>Your position stays on your device.</strong> The app works out routes and distances in your browser. It
        has no accounts, no analytics and no server that receives where you are, where you go or which room you are in.
      </p>

      <h2>What your device keeps</h2>
      <ul>
        <li>Your destination, so that it is still there after a reload. Clearing the destination removes it.</li>
        <li>Your choices, such as &ldquo;avoid stairs&rdquo; or the street map.</li>
        <li>Never where you have been, and never the room you said you are in.</li>
      </ul>

      <h2>What is downloaded</h2>
      <ul>
        <li>The app itself and the campus data, from the site you are on. These requests never carry your position.</li>
        <li>
          {config.basemapMode === "online" ? (
            <>
              The street map, from {providerName(config)}, and only after you agree. That provider sees which part of
              the map you look at and your network address. It never gets your GPS position or your routes.
            </>
          ) : (
            <>Nothing from any other site: this version has no street map.</>
          )}
        </li>
      </ul>

      {config.basemapMode === "online" && <OnlineMapSetting />}

      <h2>What the app can&apos;t control</h2>
      <p>
        Your browser and phone work out your position with GPS, Wi-Fi and mobile networks. They may ask their own
        location service for help, and they have their own privacy rules.
      </p>

      <h2>Links to rooms</h2>
      <p>A shared room link says where the room is. It never says where you are.</p>
    </TextPage>
  );
}
