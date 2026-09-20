export interface EditorIntroProps {
  mode: "create" | "edit";
  /** The site being edited, so the screen names it rather than saying "this site". */
  siteName?: string;
  onAccept: () => void;
  onCancel: () => void;
}

/**
 * What to know before editing, shown once each time the editor opens.
 *
 * A deliberate speed bump rather than a warning after the fact. Every
 * one of these points is something that is either impossible or
 * expensive to undo later: a duplicate site has to be found and deleted
 * by somebody, a guessed wind band gets flown on, and a contributor who
 * does not know a deploy takes a couple of minutes assumes their edit
 * failed and saves it three more times.
 *
 * Swedish first and English under it. The pilots who fly these sites are
 * overwhelmingly Swedish and Danish, and a Swedish sentence is the one
 * most of them will actually read - but the visiting pilot who spots a
 * wrong number is exactly the person worth keeping, so neither language
 * is a footnote.
 *
 * Kept to three points. A screen with eight rules on it is a screen
 * people learn to click through without reading, which would cost more
 * than it buys.
 */
export function EditorIntro({ mode, siteName, onAccept, onCancel }: EditorIntroProps) {
  const creating = mode === "create";

  return (
    <div className="editor-intro" data-testid="editor-intro">
      <h3>{creating ? "Lägg till en ny startplats" : `Ändra ${siteName ?? "platsen"}`}</h3>
      <p className="editor-intro-en">{creating ? "Add a new flying site" : `Edit ${siteName ?? "this site"}`}</p>

      <ol className="editor-intro-points">
        {creating ? (
          <li>
            <p>
              <strong>Kolla först att platsen inte redan finns.</strong> Två markörer på samma backe gör kartan svårare
              att läsa för alla.
            </p>
            <p className="editor-intro-en">
              Check the site is not already on the map. Two markers on the same hill make the map harder to read for
              everyone.
            </p>
          </li>
        ) : (
          <li>
            <p>
              <strong>Ändra bara det du själv har kontrollerat.</strong> Andra planerar sin flygning efter de här
              uppgifterna.
            </p>
            <p className="editor-intro-en">
              Only change what you have checked yourself. Other pilots plan their flying from this.
            </p>
          </li>
        )}

        <li>
          <p>
            <strong>Gissa inte.</strong> Ett tomt fält är bättre än ett påhittat värde.
          </p>
          <p className="editor-intro-en">Do not guess. An empty field is better than an invented one.</p>
        </li>

        <li>
          <p>
            <strong>Det tar några minuter innan ändringen syns.</strong> Sidan byggs om när du har sparat - ingenting har
            gått fel under tiden.
          </p>
          <p className="editor-intro-en">
            Your change takes a few minutes to appear. The site rebuilds after you save - nothing has gone wrong in the
            meantime.
          </p>
        </li>
      </ol>

      <div className="editor-intro-actions">
        <button type="button" onClick={onCancel} data-testid="editor-intro-cancel">
          Avbryt / Cancel
        </button>
        <button type="button" onClick={onAccept} data-testid="editor-intro-ok" autoFocus>
          OK, jag förstår / Got it
        </button>
      </div>
    </div>
  );
}
