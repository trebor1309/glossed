// src/router/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useUser();
  const location = useLocation();

  if (loading) return null; // tu peux mettre un loader si tu veux

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}
