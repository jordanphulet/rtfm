import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";

const Home = lazy(() => import("./home"));
const Reader = lazy(() => import("./reader"));

export default function App() {
  return (
    <Suspense>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/read" element={<Reader />} />
        <Route path="/read/:sectionId" element={<Reader />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
