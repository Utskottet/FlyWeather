import { useId, useMemo } from "react";
import { matchClub } from "../../domain/clubs.ts";
import { validateContributor, type Contributor } from "../../domain/contributor.ts";

export interface ContributorFieldsProps {
  value: Contributor;
  onChange: (next: Contributor) => void;
  disabled?: boolean;
  /** Shown only after a save has been attempted - see SiteEditorPanel. */
  showProblems?: boolean;
}

/**
 * Who is making this edit, and the two things they affirm before it is
 * taken.
 *
 * This is what replaced the password. It is not a weaker version of
 * signing in - it asks a different question. A password asks "are you
 * allowed to change this", which for a catalogue of flying sites has the
 * wrong answer: the people who know a site's wind band are the pilots who
 * fly it, and almost none of them will ever be given an account. This asks
 * "who is saying this", and publishes the answer next to the change.
 *
 * The two tickboxes are not a CAPTCHA and do not pretend to be. They are
 * a moment of deliberation - the same reason a form asks you to confirm
 * before deleting something - and they state plainly, in the contributor's
 * own words, what this place is for. Somebody who ticks both and then
 * vandalises a site has said so on the record, which is worth more here
 * than a puzzle that a script solves for a tenth of a cent.
 *
 * The club field is the part that actually stops anything. It is typed,
 * not chosen: naming a real Swedish club is something any pilot does
 * without thinking and a script cannot do at all. A dropdown would have
 * asked nothing of anybody - a bot picks the first option - which is why
 * the `<select>` this shipped with first was worth precisely nothing.
 * See domain/clubs.ts: a shibboleth, not a password.
 */
export function ContributorFields({ value, onChange, disabled, showProblems }: ContributorFieldsProps) {
  const nameId = useId();
  const clubId = useId();
  const clubEchoId = useId();
  const trapId = useId();

  const recognised = useMemo(() => (value.club.trim() === "" ? null : matchClub(value.club)), [value.club]);

  const problems = useMemo(() => validateContributor(value), [value]);
  const problemFor = (field: string) =>
    showProblems ? problems.find((p) => p.field === field)?.message : undefined;

  function set(patch: Partial<Contributor>) {
    onChange({ ...value, ...patch });
  }

  return (
    <fieldset className="contributor-fields" data-testid="contributor-fields">
      <legend>Vem gör ändringen?</legend>

      <label htmlFor={nameId}>
        Namn
        <input
          id={nameId}
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="För- och efternamn"
          autoComplete="name"
          disabled={disabled}
          aria-invalid={problemFor("name") !== undefined}
          data-testid="contributor-name"
        />
      </label>
      {problemFor("name") && (
        <p className="contributor-problem" data-testid="contributor-name-problem">
          {problemFor("name")}
        </p>
      )}

      <label htmlFor={clubId}>
        Klubb
        <input
          id={clubId}
          value={value.club}
          onChange={(e) => set({ club: e.target.value })}
          placeholder="T.ex. CPS eller Club Parapente Syd"
          autoComplete="organization"
          disabled={disabled}
          aria-invalid={problemFor("club") !== undefined}
          aria-describedby={recognised ? clubEchoId : undefined}
          data-testid="contributor-club"
        />
      </label>
      {recognised ? (
        // Confirmed as you type, and by the club's own name rather than by
        // a tick - "cps" answered with "Club Parapente Syd" tells you it
        // understood you AND what it is about to record about you.
        <p className="contributor-club-ok" id={clubEchoId} data-testid="contributor-club-ok">
          {recognised.name}
          {recognised.region ? ` — ${recognised.region}` : ""}
        </p>
      ) : (
        problemFor("club") && (
          <p className="contributor-problem" data-testid="contributor-club-problem">
            {problemFor("club")}
          </p>
        )
      )}

      <label className="contributor-check">
        <input
          type="checkbox"
          checked={value.isHuman}
          onChange={(e) => set({ isHuman: e.target.checked })}
          disabled={disabled}
          data-testid="contributor-human"
        />
        <span>Jag är en människa</span>
      </label>

      <label className="contributor-check">
        <input
          type="checkbox"
          checked={value.goodFaith}
          onChange={(e) => set({ goodFaith: e.target.checked })}
          disabled={disabled}
          data-testid="contributor-goodfaith"
        />
        <span>Jag är här för att jag vill förbättra världen för mina flygande medmänniskor</span>
      </label>

      {showProblems && (problemFor("isHuman") || problemFor("goodFaith")) && (
        <p className="contributor-problem" data-testid="contributor-check-problem">
          {problemFor("isHuman") ?? problemFor("goodFaith")}
        </p>
      )}

      {/*
        Honeypot. Hidden from people (and from screen readers, which is why
        aria-hidden and tabIndex are both set) but present in the DOM, so a
        bot that fills every input it finds identifies itself. It stops
        only the laziest scripts, which is exactly what it costs: one field
        and no friction for anybody real.
      */}
      <div className="contributor-trap" aria-hidden="true">
        <label htmlFor={trapId}>Lämna detta fält tomt</label>
        <input
          id={trapId}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={value.trap ?? ""}
          onChange={(e) => set({ trap: e.target.value })}
          data-testid="contributor-trap"
        />
      </div>

      <p className="contributor-note">
        Ditt namn och din klubb sparas publikt i platsens ändringslogg, tillsammans med vad du ändrade.
      </p>
    </fieldset>
  );
}
