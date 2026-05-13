import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import PermissionSlipsModule, { ParentPermissionSigningPage } from "../../../src/modules/permissions/PermissionSlipsModule.jsx";

function StandalonePermissionSlipsApp() {
  const [parentSigningToken, setParentSigningToken] = useState(() => {
    const match = window.location.hash.match(/^#\/permission-sign\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  });

  useEffect(() => {
    function handleHashRoute() {
      const match = window.location.hash.match(/^#\/permission-sign\/(.+)$/);
      setParentSigningToken(match ? decodeURIComponent(match[1]) : "");
    }

    window.addEventListener("hashchange", handleHashRoute);
    return () => window.removeEventListener("hashchange", handleHashRoute);
  }, []);

  if (parentSigningToken) {
    return <ParentPermissionSigningPage token={parentSigningToken} />;
  }

  return <PermissionSlipsModule currentUserEmail="standalone-dev@wvcs.org" />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <StandalonePermissionSlipsApp />
  </StrictMode>
);
