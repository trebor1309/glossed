import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function AdminRoute({ children }) {
  const { session, user, isAdmin, loading } = useUser();

  if (loading) return null;
  if (!session) return <Navigate to="/" replace />;
  if (!user || !isAdmin) return <Navigate to="/dashboard" replace />;

  return children;
}
