import { useId, useMemo, useState } from "react";
import { CLUBS, NO_CLUB, isKnownClub } from "../../domain/clubs.ts";
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
 */
export function ContributorFields({ value, onChange, disabled, showProblems }: ContributorFieldsProps) {
  const nameId = useId();
  const clubId = useId();
  const otherClubId = useId();
  const trapId = useId();

  // A remembered club that is no longer in the list (renamed, dissolved)
  // must not silently vanish from the form - it opens as free text with
  // the old name still in it.
  const [usingOther, setUsingOther] = useState(() => value.club !== "" && !isKnownClub(value.club));

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
        <select
          id={clubId}
          value={usingOther ? NO_CLUB : value.club}
          onChange={(e) => {
            const chosen = e.target.value;
            if (chosen === NO_CLUB) {
              setUsingOther(true);
              set({ club: "" });
              return;
            }
            setUsingOther(false);
            set({ club: chosen });
          }}
          disabled={disabled}
          data-testid="contributor-club"
        >
          <option value="">Ingen vald</option>
          {CLUBS.map((club) => (
            <option key={club.name} value={club.name}>
              {club.region ? `${club.name} — ${club.region}` : club.name}
            </option>
          ))}
          <option value={NO_CLUB}>{NO_CLUB}</option>
        </select>
      </label>

      {usingOther && (
        <label htmlFor={otherClubId}>
          Klubbens namn
          <input
            id={otherClubId}
            value={value.club}
            onChange={(e) => set({ club: e.target.value })}
            placeholder="Valfritt"
            disabled={disabled}
            data-testid="contributor-club-other"
          />
        </label>
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
