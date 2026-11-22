import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import JecMap from "@/components/JecMap";
import RoomFacts from "@/components/indoor/RoomFacts";
import TextPage from "@/components/ui/TextPage";
import { readPublished } from "@/lib/data/server";
import { roomName } from "@/lib/state/destination";

interface RoomPageProps {
  params: Promise<{ buildingId: string; roomId: string }>;
}

/** Only rooms that exist get a page. Everything else is "not found". */
export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ buildingId: string; roomId: string }[]> {
  const { rooms } = await readPublished();
  return rooms.map(({ buildingId, id }) => ({ buildingId, roomId: id }));
}

export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
  const room = await findRoom(params);
  return { title: room ? roomName(room) : "Room not found" };
}

/** A shared room. It says where to go, never where anyone is. */
export default async function RoomPage({ params }: RoomPageProps) {
  const room = await findRoom(params);
  if (!room) notFound();
  const dataset = await readPublished();

  return (
    <Suspense
      fallback={
        <TextPage title={roomName(room)}>
          <RoomFacts dataset={dataset} room={room} />
          <p>Loading the map…</p>
        </TextPage>
      }
    >
      <JecMap linked={{ kind: "room", id: room.id }} />
    </Suspense>
  );
}

/** The room must exist and really be in that building. */
async function findRoom(params: RoomPageProps["params"]) {
  const { buildingId, roomId } = await params;
  const { rooms } = await readPublished();
  return rooms.find((room) => room.id === roomId && room.buildingId === buildingId);
}
