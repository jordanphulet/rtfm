import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AdminPage, LinkPage } from "./link";
import { PasscodeScreen, usePasscodeReason } from "./passcode";

const Home = lazy(() => import("./home"));
const Reader = lazy(() => import("./reader"));

export default function App() {
  const passcodeReason = usePasscodeReason();
  if (passcodeReason) return <PasscodeScreen linkClosed={passcodeReason === "link-closed"} />;
  return (
    <Suspense>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/read/:manualId" element={<Reader />} />
        <Route path="/read/:manualId/:sectionId" element={<Reader />} />
        <Route path="/l" element={<LinkPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
