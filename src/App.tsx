import { Navigate, Route, Routes } from "react-router";
import Reader from "./reader";

export default function App() {
  return (
    <Routes>
      <Route path="/read" element={<Reader />} />
      <Route path="/read/:sectionId" element={<Reader />} />
      <Route path="*" element={<Navigate to="/read" replace />} />
    </Routes>
  );
}
