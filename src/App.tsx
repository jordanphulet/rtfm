import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { PasscodeScreen, usePasscodeRequired } from "./passcode";

const Home = lazy(() => import("./home"));
const Reader = lazy(() => import("./reader"));

export default function App() {
  if (usePasscodeRequired()) return <PasscodeScreen />;
  return (
    <Suspense>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/read/:manualId" element={<Reader />} />
        <Route path="/read/:manualId/:sectionId" element={<Reader />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
