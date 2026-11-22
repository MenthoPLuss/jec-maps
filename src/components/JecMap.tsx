import CampusApp, { type CampusAppProps } from "./CampusApp";

/** The entry point of the app. Everything else lives in CampusApp. */
export default function JecMap(props: CampusAppProps) {
  return <CampusApp {...props} />;
}
