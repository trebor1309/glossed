import { Outlet, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function ChatLayout({ leftPanel }) {
  const isMobile = useIsMobile(768);
  const location = useLocation();

  // Detect chat route correctly
  const isChatPage =
    location.pathname.match(/\/dashboard\/messages\/[^/]+$/) ||
    location.pathname.match(/\/prodashboard\/messages\/[^/]+$/);

  return (
    <div className="w-full flex justify-center">
      {/* 🔒 Contrainte de largeur */}
      <div className="w-full max-w-5xl h-[calc(100vh-6rem)] flex overflow-hidden bg-white shadow-sm rounded-xl">
        {/* --- DESKTOP SPLIT VIEW --- */}
        {!isMobile && (
          <div className="flex flex-1 overflow-hidden">
            {/* Inbox */}
            <div className="w-1/3 min-w-[280px] max-w-[380px] border-r overflow-y-auto">
              {leftPanel}
            </div>

            {/* Chat */}
            <div className="flex-1 overflow-y-auto">
              <Outlet />
            </div>
          </div>
        )}

        {/* --- MOBILE VIEW --- */}
        {isMobile && (
          <>
            {!isChatPage ? (
              <div className="flex-1 overflow-y-auto">{leftPanel}</div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <Outlet />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
