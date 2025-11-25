// src/router/OnboardingGuard.jsx
import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function OnboardingGuard({ children }) {
  const { user } = useUser();

  if (!user) return children;

  const missingUsername = !user.username;
  const missingAddress = !user.address;
  const missingPhone = !user.phone_number;

  const needsOnboarding = missingUsername || missingAddress || missingPhone;

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
