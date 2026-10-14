import { useEffect } from "react";
import { useNavigate } from "react-router";
import { leaveLibrary } from "./api";
import { Opening } from "./Opening";

/** `/admin`: leaves a recipient's library, then opens `/`, the admin's library or the passcode screen. */
export function AdminPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let current = true;
    void leaveLibrary().then(() => {
      if (current) navigate("/", { replace: true });
    });
    return () => {
      current = false;
    };
  }, [navigate]);

  return <Opening />;
}
