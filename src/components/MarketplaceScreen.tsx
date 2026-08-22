import { LibraryBanner } from "./ui/LibraryBanner";
import { PackMarketplace } from "./PackMarketplace";

/**
 * The Marketplace — its own top-level page (#user ask). Published adventure
 * packs a DM can add to their campaigns in one click; installing creates a new
 * campaign and drops the DM into its editor.
 */
export const MarketplaceScreen = ({ onInstalled }: { onInstalled: (gameId: string) => void }) => (
  <div className="screen-enter" style={{ padding: 24 }}>
    <LibraryBanner
      image="/art/shop.png"
      eyebrow="Community"
      title="Marketplace"
      subtitle="Ready-to-run adventures — add one to your campaigns in a click, then make it your own."
    />
    <PackMarketplace standalone onInstalled={onInstalled} />
  </div>
);
