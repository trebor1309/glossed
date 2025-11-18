// 📄 src/components/chat/ChatLayout.jsx
import { Outlet, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function ChatLayout({ leftPanel }) {
  const isMobile = useIsMobile(768);
  const location = useLocation();

  const isChatPage = location.pathname.includes("/chat/");

  return (
    <div className="w-full h-[calc(100vh-6rem)] flex overflow-hidden">
      {/* DESKTOP SPLIT VIEW */}
      {!isMobile && (
        <>
          {/* LEFT = inbox */}
          <div className="w-1/3 border-r overflow-y-auto bg-white">{leftPanel}</div>

          {/* RIGHT = chat */}
          <div className="flex-1 bg-white overflow-y-auto">
            <Outlet />
          </div>
        </>
      )}

      {/* MOBILE VIEW */}
      {isMobile && (
        <>
          {/* Only inbox OR chat */}
          {isChatPage ? (
            <div className="flex-1 overflow-y-auto">
              <Outlet />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">{leftPanel}</div>
          )}
        </>
      )}
    </div>
  );
}
