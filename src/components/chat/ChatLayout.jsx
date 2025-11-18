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
    <div className="w-full h-[calc(100vh-6rem)] flex overflow-hidden bg-white">
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
            // Inbox only
            <div className="flex-1 overflow-y-auto">{leftPanel}</div>
          ) : (
            // Chat only
            <div className="flex-1 overflow-y-auto">
              <Outlet />
            </div>
          )}
        </>
      )}
    </div>
  );
}
