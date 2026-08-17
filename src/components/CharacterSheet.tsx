import { useState } from "react";
import type { Character } from "../types/character";
import type { CharacterAPI } from "../state/useCharacter";
import { TopBar } from "./TopBar";
import { AbilityScores, SavingThrows } from "./AbilityScores";
import { Skills, Senses } from "./Skills";
import { Proficiencies, Defenses } from "./Proficiencies";
import { VitalStats } from "./VitalStats";
import { TabbedPanel } from "./TabbedPanel";
import { MobileSheet } from "./MobileSheet";
import { AvatarDialog } from "./AvatarDialog";
import { classArtFor } from "../lib/classArt";
import { useMediaQuery } from "../state/useMediaQuery";

export const CharacterSheet = ({ character, api }: { character: Character; api: CharacterAPI }) => {
  // Phones get a paginated sheet rather than the desktop columns stacked —
  // see MobileSheet for why. Structural, so it can't be a CSS-only breakpoint.
  const isPhone = useMediaQuery("(max-width: 760px)");
  // Clicking the avatar (desktop TopBar or mobile header) opens this.
  const [avatarOpen, setAvatarOpen] = useState(false);

  return (
    <div
      className="sheet-page screen-enter"
      style={{ backgroundImage: `url(${classArtFor(character)})` }}
    >
      <div className="sheet-bg-scrim" aria-hidden="true" />
      <div className="sheet-inner">
        {isPhone ? (
          <MobileSheet character={character} api={api} onEditAvatar={() => setAvatarOpen(true)} />
        ) : (
          <>
            <TopBar character={character} api={api} onEditAvatar={() => setAvatarOpen(true)} />
            {/* One horizontal strip under the name: ability scores on the left,
                AC / Initiative / Speed / Prof / HP on the right — matching the
                D&D Beyond reference, where the header carries only identity and
                rest actions. Saving throws / senses / proficiencies then stack
                in the left column, skills in the middle, and defenses sits
                above the tabbed panel on the right. */}
            <div className="sheet-vitals">
              <AbilityScores character={character} />
              <VitalStats character={character} api={api} />
            </div>
            <div className="sheet">
              <div className="col">
                <SavingThrows character={character} />
                <Senses character={character} />
                <Proficiencies character={character} />
              </div>
              <div className="col">
                <Skills character={character} />
              </div>
              <div className="col">
                <Defenses character={character} />
                <TabbedPanel character={character} api={api} />
              </div>
            </div>
          </>
        )}
      </div>

      {avatarOpen && (
        <AvatarDialog
          character={character}
          onClose={() => setAvatarOpen(false)}
          onApply={(url) => api.setPortrait(url)}
        />
      )}
    </div>
  );
};
