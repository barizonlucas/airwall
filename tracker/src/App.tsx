import { useEffect, useState } from "react";
import TrackerView from "./components/TrackerView";
import ProjectorView from "./components/ProjectorView";

/**
 * Minimal hash-based router.
 *
 *   /              → TrackerView   (default)
 *   /#tracker      → TrackerView
 *   /#projector    → ProjectorView
 */
function getRoute(): string {
  return window.location.hash.replace("#", "") || "tracker";
}

export default function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  switch (route) {
    case "projector":
      return <ProjectorView />;
    default:
      return <TrackerView />;
  }
}
