import { useState } from "react";
import { publishCampaignAsPack } from "../lib/packs";
import type { Game } from "../state/useGames";
import { useAuth } from "../state/useAuth";
import { useToast } from "../state/Toast";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";

/**
 * Publisher-only tool (packs P1) — serialize a campaign and write it to the
 * marketplace shelf. Gated two ways: this dialog only renders for accounts in
 * pack_publishers (the client check), and the packs RLS refuses writes from
 * anyone not listed (the real lock). Card fields prefill from the campaign.
 */
export const PublishPackDialog = ({ game, onClose }: { game: Game; onClose: () => void }) => {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(game.name);
  const [tagline, setTagline] = useState(game.description ?? "");
  const [publishNow, setPublishNow] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user || !name.trim() || saving) return;
    setSaving(true);
    const { error } = await publishCampaignAsPack(
      game.id,
      user.id,
      {
        name: name.trim(),
        tagline: tagline.trim(),
        cover_url: game.cover_url ?? null,
        level_min: game.level_min ?? null,
        level_max: game.level_max ?? null,
      },
      publishNow
    );
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(publishNow ? "Published to the marketplace." : "Saved as a draft pack.");
    onClose();
  };

  return (
    <Dialog
      onClose={onClose}
      size="sm"
      title="Export as pack"
      subtitle="Serialize this campaign — chapters, scenes, docs, maps, and pins — into a marketplace pack."
    >
      <div style={{ display: "grid", gap: 14 }}>
        <label className="camped-field">
          <span>Pack name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="camped-field">
          <span>Tagline</span>
          <input value={tagline} placeholder="One line for the shelf card." onChange={(e) => setTagline(e.target.value)} />
        </label>
        <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Publish to the shelf now (otherwise saved as a draft pack)</span>
        </label>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? "Exporting…" : publishNow ? "Export & publish" : "Export as draft"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
