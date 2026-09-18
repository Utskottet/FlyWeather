# CLUBS.md — Swedish paragliding clubs

The clubs affiliated with Svenska Skärmflygförbundet, as of 2026-09-18.

**Deliberately names only.** The source list also carried each club's
chairman, phone number and email address. None of that is here: it is
personal data belonging to people who did not publish it for this purpose,
and this repository is public. The feature this list exists for needs a
club's *name* and nothing else.

## Why this list exists

Planned as the gate for site editing (see `BACKLOG.md`): to reach the
editor you type your name and the club you fly with. Naming a real club is
something any Swedish pilot can do from memory and a bot cannot.

It is a **shibboleth, not a password**. It is not secret, it never needs
distributing, it never needs rotating, and it cannot be leaked — which is
the whole point. It stops automated traffic, not determined people, and it
is not meant to.

## The clubs

| Club | Abbreviation | Region |
|---|---|---|
| B-stället | | Stockholm |
| Cirrus Skärmflygarklubb | Cirrus | Eckerö |
| Club Parapente Syd | CPS | Skåne |
| Skärmflygklubben Dalmåsarna | Dalmåsarna | Värmland |
| Fenix Skärmflygklubb | Fenix | Stockholm |
| Glidflygarna Häng- & Skärmflygklubb | Glidflygarna | Skellefteå |
| Paranordic Skärmflygklubb | Paranordic | Boden |
| Skärmflygklubben Göteborg | SFG | Göteborg |
| Skärmflygarna i Värmland | SiV | Värmland |
| Smålands Skärmflygklubb | | Småland |
| Västra Skärmflygklubben | VSK | Göteborg |
| Åre Skärm- & Drakflygklubb | | Åre |
| Örebro Paramotorklubb | | Örebro |
| Östergötlands Skärmflygklubb | | Östergötland |
| Sala Skärmflygklubb Silverflygarna | Silverflygarna | Västmanland/Uppland |
| Hässleholms Modellflygklubb | | Skåne |
| Norrsken Häng- & Skärmflygklubb | Norrsken | |
| Norrköpings Skärmflygklubb | | Norrköping |
| Tornedalens Skärmflygklubb | | Tornedalen |
| Skärmflygklubben Pegasus | Pegasus | |
| Pite Paramotor Pilots | | Piteå |
| Skärmflygklubben Sydost | Sydost | Småland, Blekinge |
| Bohusläns Skärm- & Hängflygklubb Konvektionen | Konvektionen | Bohuslän |
| Paragliding Friends Gotland | | Gotland |

Plus the national body itself: **Svenska Skärmflygförbundet (SSFF)**.

## How matching should work

Forgiving, because the point is to recognise a pilot rather than to test
their spelling. Normalise both sides before comparing:

1. lowercase
2. fold `å`/`ä` to `a`, `ö` to `o`
3. strip everything that is not a letter or digit

So `CPS`, `cps`, `C.P.S.` and `c p s` all collapse to `cps`; `Åre Skärm- &
Drakflygklubb` collapses to `areskarmdrakflygklubb`.

Accept a match against **either** the full name or the abbreviation, and
accept a normalised *substring* match - someone typing "Club Parapente
Syd, Skåne" or just "parapente" should get in. A false positive here costs
nothing; a pilot turned away by a hyphen costs a contribution.

## Keeping it current

Clubs come and go. An unrecognised club name should never be a dead end:
the message should say what to do (contact the site owner) rather than
just refusing, or the first pilot from a new club is silently lost.
