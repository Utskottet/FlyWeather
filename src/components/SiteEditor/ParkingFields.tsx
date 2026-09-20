import { useState } from "react";
import type { SiteDraft } from "../../domain/siteEditor.ts";
import { navigationUrl, parkingProblem, parseParkingLocation } from "../../domain/parking.ts";

type Parking = NonNullable<SiteDraft["parking"]>;

interface Props {
  value: Parking | undefined;
  onChange: (value: Parking | undefined) => void;
}

/**
 * Where to leave the car.
 *
 * The field takes a paste rather than two number boxes: the real
 * authoring flow is "find it in Google Maps, copy something, paste it
 * here", and demanding decimal degrees in a particular order would make
 * a contributor do work a regex can do. Coordinates or a maps URL both
 * work - see domain/parking.ts.
 *
 * The note matters more than it looks. Several of these sites exist on a
 * landowner's goodwill, and a navigable pin with no context is how that
 * gets spent: this is where "ask in the club first" or "gate is locked
 * after 21:00" belongs, and the caption says so rather than leaving
 * somebody to guess what the box is for.
 */
export function ParkingFields({ value, onChange }: Props) {
  const enabled = value !== undefined;
  const [pasted, setPasted] = useState(() => (value ? `${value.lat}, ${value.lon}` : ""));
  const [problem, setProblem] = useState<string | null>(null);

  function applyPaste(text: string) {
    setPasted(text);
    const parsed = parseParkingLocation(text);
    if (parsed.ok) {
      setProblem(null);
      onChange({ lat: parsed.lat, lon: parsed.lon, note: value?.note });
      return;
    }
    setProblem(parkingProblem(parsed.reason));
    // The coordinate is left as it was rather than cleared: somebody
    // mid-edit of a working value should not lose it to a keystroke.
    if (parsed.reason === "empty") onChange(undefined);
  }

  return (
    <fieldset style={{ marginBottom: 16 }}>
      <legend>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              if (e.target.checked) return;
              setPasted("");
              setProblem(null);
              onChange(undefined);
            }}
            onClick={(e) => {
              // Ticking it on does nothing until a coordinate exists -
              // an empty parking spot is not a parking spot.
              if ((e.target as HTMLInputElement).checked && !enabled) e.preventDefault();
            }}
            data-testid="parking-enabled"
          />{" "}
          Parking{" "}
        </label>
      </legend>

      <label style={{ display: "block", marginBottom: 6 }}>
        Coordinates or Google Maps link
        <input
          value={pasted}
          onChange={(e) => applyPaste(e.target.value)}
          placeholder="55.411020, 13.995150"
          style={{ display: "block", width: "100%", padding: 6, boxSizing: "border-box" }}
          data-testid="parking-location"
        />
      </label>

      {problem && (
        <p className="parking-problem" data-testid="parking-problem">
          {problem}
        </p>
      )}

      {value && (
        <p className="parking-confirmed" data-testid="parking-confirmed">
          {value.lat}, {value.lon} —{" "}
          <a href={navigationUrl(value)} target="_blank" rel="noreferrer">
            check it on the map
          </a>
        </p>
      )}

      <label style={{ display: "block" }}>
        Note — access, capacity, who to ask
        <input
          value={value?.note ?? ""}
          onChange={(e) => value && onChange({ ...value, note: e.target.value || undefined })}
          placeholder="T.ex. plats för 6 bilar, fråga i klubben först"
          disabled={!enabled}
          style={{ display: "block", width: "100%", padding: 6, boxSizing: "border-box" }}
          data-testid="parking-note"
        />
      </label>

      <p className="parking-caution" data-testid="parking-caution">
        Lägg bara till parkering som går att använda. Beror tillgången på markägarens goodwill - skriv det i noteringen.
        <br />
        <span className="editor-intro-en">
          Only add parking that can actually be used. If access depends on a landowner&apos;s goodwill, say so in the
          note.
        </span>
      </p>
    </fieldset>
  );
}
