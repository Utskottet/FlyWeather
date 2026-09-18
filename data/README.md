# data/

Static reference data, maintained by hand and read at build time. Nothing
here is fetched at runtime.

## clubs.json

The Swedish paragliding clubs a contributor can pick from when they edit a
site. Used to populate the club `<select>` in the contributor form.

```json
[
  { "name": "Club Parapente Syd", "abbreviation": "CPS", "region": "Skåne" },
  { "name": "B-stället", "region": "Stockholm" }
]
```

`name` is required. `abbreviation` and `region` are optional and omitted
rather than left empty when a club has neither.

### Updating it

Clubs come and go, and the list is **deliberately not scraped**. Scraping
ssff.se at runtime would make the editor depend on someone else's site
being up, and would silently change what the form offers without anyone
reviewing it. This is repo data: it changes when a person changes it, in a
commit someone can read.

To update:

1. Check the current list at ssff.se (Förbundet → Klubbar).
2. Edit `docs/CLUBS.md`, which is the human-readable source with the
   matching rules and the reasoning.
3. Regenerate this file from that table, or edit it directly - they are
   kept in step by hand, and `docs/CLUBS.md` is the one to read first.
4. Commit both together.

**Names only.** The SSFF listing also carries each club's chairman, phone
number and email address. None of that belongs here: it is personal data
belonging to people who did not publish it for this purpose, and this
repository is public. The form needs a club's name and nothing else.

### "Annan / ingen klubb"

The form appends this option itself rather than storing it here - it is a
UI affordance, not a club. Choosing it reveals a free-text field, so a
pilot from a new club, a visiting pilot, or someone who simply is not a
member is never turned away by a list that has not caught up with them.
