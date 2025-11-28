import { Image } from "lucide-react";

export default function ProfilePortfolio({ portfolio }) {
  if (!portfolio || portfolio.length === 0) {
    return <p className="text-sm text-gray-500 italic">No portfolio items uploaded yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {portfolio.map((url, index) => (
        <div key={index} className="relative rounded-xl overflow-hidden bg-gray-100 aspect-square">
          <img src={url} alt={`Portfolio ${index}`} className="w-full h-full object-cover" />
        </div>
      ))}
    </div>
  );
}
