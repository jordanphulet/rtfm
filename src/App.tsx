import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import LibraryPrototype from "./library-prototypes";

const Reader = lazy(() => import("./reader"));

export default function App() {
  return (
    <Suspense>
      <Routes>
        <Route path="/read" element={<Reader />} />
        <Route path="/read/:sectionId" element={<Reader />} />
        <Route path="/library" element={<LibraryPrototype />} />
        <Route path="/library/:variant" element={<LibraryPrototype />} />
        <Route path="*" element={<Navigate to="/read" replace />} />
      </Routes>
    </Suspense>
  );
}
