import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";

export default function UserAvatar({ src, name, className = "h-10 w-10" }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [src]);

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt={name ? `${name} profile` : "Profile"}
        className={`${className} shrink-0 rounded-full bg-gray-100 object-cover`}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500`}
      aria-label={name ? `${name} profile` : "Profile"}
      role="img"
    >
      <UserRound className="h-1/2 w-1/2" aria-hidden="true" />
    </span>
  );
}
