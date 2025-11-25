import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function PublicOnlyRoute({ children }) {
  const { isAuthenticated, loading } = useUser();

  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return children;
}
