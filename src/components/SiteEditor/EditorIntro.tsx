import { PROVIDER_LABELS, PROVIDER_LABELS_SV } from "../../providers/live/resolver.ts";

export interface EditorIntroProps {
  mode: "create" | "edit";
  /** The site being edited, so the screen names it rather than saying "this site". */
  siteName?: string;
  onAccept: () => void;
  onCancel: () => void;
}

/**
 * Read from the live registry rather than typed out, so this screen
 * cannot promise a provider that no longer works, or omit one that was
 * added last week. The one place a reader is told what is supported
 * should not be a list somebody has to remember to update.
 */
function list(labels: Record<string, string>, conjunction: string): string {
  const names = Object.values(labels);
  return `${names.slice(0, -1).join(", ")} ${conjunction} ${names[names.length - 1]}`;
}

const WORKING_PROVIDERS_SV = list(PROVIDER_LABELS_SV, "och");
const WORKING_PROVIDERS_EN = list(PROVIDER_LABELS, "and");

/**
 * What to know before editing, shown each time the editor opens.
 *
 * A deliberate speed bump rather than a warning after the fact. Every
 * point here is something that is either impossible or expensive to undo
 * later: a duplicate site has to be found and deleted by somebody, a
 * guessed wind band gets flown on, and a contributor who does not know a
 * deploy takes a couple of minutes assumes their edit failed and saves
 * it three more times.
 *
 * Structured as one framing sentence, three rules, and a practical note
 * about stations. That is deliberate: what this place IS and how the
 * station finder works are not rules, and numbering them alongside the
 * rules would make a list of five that people skim instead of a list of
 * three they read.
 *
 * Swedish first and English under it. The pilots who fly these sites are
 * overwhelmingly Swedish and Danish, and a Swedish sentence is the one
 * most of them will actually read - but the visiting pilot who spots a
 * wrong number is exactly the person worth keeping, so neither language
 * is a footnote.
 */
export function EditorIntro({ mode, siteName, onAccept, onCancel }: EditorIntroProps) {
  const creating = mode === "create";

  return (
    <div className="editor-intro" data-testid="editor-intro">
      <h3>{creating ? "Lägg till en ny startplats" : `Ändra ${siteName ?? "platsen"}`}</h3>
      <p className="editor-intro-en">{creating ? "Add a new flying site" : `Edit ${siteName ?? "this site"}`}</p>

      {/*
        The first thing anybody reads, and not a rule - it is why the
        rules exist. Somebody who understands that real pilots fly on
        these numbers needs far less telling than somebody who thinks
        they are filling in a form.
      */}
      <div className="editor-intro-lead">
        <p>
          Det här är en flygkarta av wikipedia-typ. <strong>Alla ser dina ändringar</strong>, och kartan fungerar för att
          vi litar på varandra - därför skriver du ditt namn och din klubb när du sparar.
        </p>
        <p className="editor-intro-en">
          This is a Wikipedia-style flying map. Everyone sees your changes, and it works because we trust each other -
          which is why you sign your edit with your name and club.
        </p>
      </div>

      <ol className="editor-intro-points">
        {creating ? (
          <li>
            <p>
              <strong>Håll kartan prydlig.</strong> Flera startplatser på samma ställe gör kartan svårare att läsa för
              alla. Kolla först att platsen inte redan finns.
            </p>
            <p className="editor-intro-en">
              Keep the map tidy. Several launch points in the same place make it harder to read for everyone. Check the
              site is not already there.
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

      <div className="editor-intro-note">
        <p>
          <strong>Vindmätare lägger du till med stationsverktyget</strong> - knappen "Find nearby station". Just nu
          fungerar {WORKING_PROVIDERS_SV}. Saknas din mätare? Kolla att den publicerar sina värden öppet, så kan en admin
          lägga till den.
        </p>
        <p className="editor-intro-en">
          Add a wind meter with the station finder - the "Find nearby station" button. {WORKING_PROVIDERS_EN} work today.
          Missing yours? Check that it publishes its readings openly and an admin can add it.
        </p>
      </div>

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
