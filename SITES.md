# SITES.md — Canonical Flying Site Catalogue

This file is the human-maintained authority for which sites the app knows about.

**Important:** values marked `verified: false` are provisional seeds. The implementation agent must research and improve them, but must not silently turn them into verified data.

The application must parse the fenced YAML block below and validate it.

## Data semantics

- `enabled`: appears on V1 map.
- `type`: currently `hang`, `winch`, `paramotor`, `school`, or `other`.
- `coordinates`: must be verified before production marker placement.
- `source_direction_label`: textual direction from CPS/source.
- `rose.green`: optimal direction sector(s).
- `rose.orange`: marginal direction sector(s).
- `rose.verified`: whether exact angular sectors have been verified.
- `wind_speed.verified`: whether site-specific speed thresholds are trusted.
- `soaring_height.agl_m`: practical model-wind comparison height, not merely ridge height.
- `live_sources`: ordered best-first.
- `cps_url`: original CPS page.
- `description`: short pilot-oriented description; richer information can be added later.

**Do not assume the provisional degree bands below are exact flying limits.** They are development seeds derived from the CPS compass labels. Until verified, they should not independently produce a green GOOD state.

```yaml
schema_version: 1

defaults:
  timezone: Europe/Stockholm
  units: m/s
  live_fresh_minutes: 10
  live_stale_minutes: 30

sites:

  # -----------------------
  # SWEDEN — SOUTH / EAST
  # -----------------------

  - id: hammar
    enabled: true
    name: Hammars backar
    short_name: Hammar
    country: SE
    type: hang
    coordinates:
      lat: 55.403333
      lon: 14.012167
      verified: true
      source: CPS
    source_direction_label: SV
    ridge_height_m: 37
    rose:
      verified: false
      green:
        - { from_deg: 213.75, to_deg: 236.25 }
      orange:
        - { from_deg: 202.5, to_deg: 213.75 }
        - { from_deg: 236.25, to_deg: 247.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 150
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "214"
        priority: 1
        verified: true
    description: "Long southwest-facing coastal ridge; CPS describes it as a beginner-friendly hang."
    cps_url: "https://www.cps.to/flygstallen/sv-hammar/"

  - id: kaseberga-s
    enabled: true
    name: Kåseberga Sydhanget
    short_name: Kåseberga
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: S
    ridge_height_m: 50
    rose:
      verified: false
      green:
        - { from_deg: 168.75, to_deg: 191.25 }
      orange:
        - { from_deg: 157.5, to_deg: 168.75 }
        - { from_deg: 191.25, to_deg: 202.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 150
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "155"
        priority: 1
        verified: true
    description: "South-facing Kåseberga ridge; CPS describes it as an accessible training/soaring site with important local restrictions."
    restrictions:
      - type: local_rule
        severity: warning
        message: "Show CPS site-specific restrictions prominently in detail view."
    cps_url: "https://www.cps.to/flygstallen/s-kaseberga/"

  - id: rokerierna
    enabled: true
    name: Rökerierna Kåseberga
    short_name: Rökerierna
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: SO
    ridge_height_m: null
    rose:
      verified: false
      green:
        - { from_deg: 123.75, to_deg: 146.25 }
      orange:
        - { from_deg: 112.5, to_deg: 123.75 }
        - { from_deg: 146.25, to_deg: 157.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "155"
        priority: 1
        verified: false
        note: "Proxy candidate; verify exposure/appropriateness."
    description: "Southeast-facing Kåseberga site. Advanced site with seasonal/local access rules in CPS description."
    cps_url: "https://www.cps.to/flygstallen/so-rokerierna/"

  - id: ales-stenar-sv
    enabled: true
    name: Ales stenar / Stenarna
    short_name: Stenarna
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: SV
    ridge_height_m: 30
    rose:
      verified: false
      green:
        - { from_deg: 213.75, to_deg: 236.25 }
      orange:
        - { from_deg: 202.5, to_deg: 213.75 }
        - { from_deg: 236.25, to_deg: 247.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "214"
        priority: 1
        verified: false
        note: "Nearby proxy candidate; verify."
    description: "Southwest-facing ridge near Ales stenar; CPS lists it as intermediate."
    cps_url: "https://www.cps.to/flygstallen/sv-alestenar/"

  - id: ravlunda
    enabled: true
    name: Ravlunda / Haväng
    short_name: Ravlunda
    country: SE
    type: hang
    coordinates:
      lat: 55.731167
      lon: 14.194000
      verified: true
      source: CPS
    source_direction_label: O
    ridge_height_m: 20
    rose:
      verified: false
      green:
        - { from_deg: 78.75, to_deg: 101.25 }
      orange:
        - { from_deg: 67.5, to_deg: 78.75 }
        - { from_deg: 101.25, to_deg: 112.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "126"
        priority: 1
        verified: true
    description: "East-facing Ravlunda/Haväng coastal ridge. CPS specifically warns about local wind behavior ('Ravlunda effect') and military-range availability."
    restrictions:
      - type: military_range
        severity: hard
        message: "Flying availability depends on Ravlunda firing-range activity; weather green must not imply the site is open."
    cps_url: "https://www.cps.to/flygstallen/o-ravlunda/"

  - id: vik
    enabled: true
    name: Vik
    short_name: Vik
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: O
    ridge_height_m: null
    rose:
      verified: false
      green:
        - { from_deg: 78.75, to_deg: 101.25 }
      orange:
        - { from_deg: 67.5, to_deg: 78.75 }
        - { from_deg: 101.25, to_deg: 112.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "596"
        priority: 1
        verified: true
    description: "East-facing advanced coastal site; CPS explicitly describes it as very advanced."
    cps_url: "https://www.cps.to/flygstallen/o-vik/"

  - id: vitemolla
    enabled: true
    name: Vitemölla
    short_name: Vitemölla
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: ONO
    ridge_height_m: 25
    rose:
      verified: false
      green:
        - { from_deg: 56.25, to_deg: 78.75 }
      orange:
        - { from_deg: 45.0, to_deg: 56.25 }
        - { from_deg: 78.75, to_deg: 90.0 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources: []
    description: "ENE-facing 25 m site; CPS describes mixed hang/back-gliding use and notes advanced/novice context."
    restrictions:
      - type: seasonal_closure
        severity: hard
        message: "Länsstyrelsen prohibits flying at Vitemölla backar 1 April through 31 July to protect sensitive vegetation and bird habitats (in effect from 2024)."
        status_provider: null
    cps_url: "https://www.cps.to/flygstallen/ono-vitemolla/"

  # -----------------------
  # SWEDEN — ÖRESUND / WEST
  # -----------------------

  - id: lernacken
    enabled: true
    name: Lernacken
    short_name: Lernacken
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: SSO-SSV
    ridge_height_m: 20
    rose:
      verified: false
      green:
        - { from_deg: 157.5, to_deg: 202.5 }
      orange:
        - { from_deg: 146.25, to_deg: 157.5 }
        - { from_deg: 202.5, to_deg: 213.75 }
    wind_speed:
      verified: false
      notes: "CPS mentions 6–7 m/s SSW for flying the low ridge toward the bridge; do not generalize this into full-site safe limits without review."
    soaring_height:
      agl_m: 120
      verified: false
    live_sources: []
    description: "South-facing Malmö/Lernacken ridge with orientation-dependent low-ridge behavior."
    restrictions:
      - type: nature_reserve
        severity: warning
        message: "Site sits within a nature reserve; CPS warns of hidden hazards in the reed beds below the ridge (old scrap/debris), electric fencing in lower landing areas, and advises avoiding the eastern Stenören section and bird nesting areas."
        status_provider: null
    cps_url: "https://www.cps.to/flygstallen/s-lernacken/"

  - id: brofastet
    enabled: true
    name: Brofästet
    short_name: Brofästet
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: V
    ridge_height_m: 10
    rose:
      verified: false
      green:
        - { from_deg: 258.75, to_deg: 281.25 }
      orange:
        - { from_deg: 247.5, to_deg: 258.75 }
        - { from_deg: 281.25, to_deg: 292.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 100
      verified: false
    live_sources: []
    description: "Small west-facing ridge north of the Öresund bridge; CPS lists it as advanced."
    cps_url: "https://www.cps.to/flygstallen/v-brofastet/"

  - id: barseback
    enabled: true
    name: Barsebäck camping
    short_name: Barsebäck
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: VNV-NNV
    ridge_height_m: 10
    rose:
      verified: false
      green:
        - { from_deg: 292.5, to_deg: 337.5 }
      orange:
        - { from_deg: 281.25, to_deg: 292.5 }
        - { from_deg: 337.5, to_deg: 348.75 }
    wind_speed:
      verified: false
      notes: "CPS: \"no point coming here unless it blows at least 8 m/s\" - strong-wind site requiring fast gliders and very good launch technique; treat as a hard practical minimum, not a full verified speed band."
    soaring_height:
      agl_m: 100
      verified: false
    live_sources:
      - provider: viva
        station_id: null
        priority: 1
        verified: false
        note: "Research CPS-linked/nearby ViVa source."
    description: "Low coastal ridge; CPS gives WNW–NNW as the usable direction range and lists it as advanced."
    cps_url: "https://www.cps.to/flygstallen/vnv-nnv-barseback/"

  - id: alabodarna
    enabled: true
    name: Ålabodarna
    short_name: Ålabodarna
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: V-SV
    ridge_height_m: 15
    rose:
      verified: false
      green:
        - { from_deg: 225.0, to_deg: 270.0 }
      orange:
        - { from_deg: 213.75, to_deg: 225.0 }
        - { from_deg: 270.0, to_deg: 281.25 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 100
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "216"
        priority: 1
        verified: true
    description: "15 m west-to-southwest-facing coastal ridge near Glumslöv."
    restrictions:
      - type: local_rule
        severity: warning
        message: "CPS: do not use the adjacent field for launch/landing during the agricultural growing season; use the beach/cliff edge instead."
        status_provider: null
    cps_url: "https://www.cps.to/flygstallen/v-sv-alabodarna/"

  - id: larod
    enabled: true
    name: Larödbaden
    short_name: Laröd
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: SV
    ridge_height_m: 35
    rose:
      verified: false
      green:
        - { from_deg: 213.75, to_deg: 236.25 }
      orange:
        - { from_deg: 202.5, to_deg: 213.75 }
        - { from_deg: 236.25, to_deg: 247.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources: []
    description: "35 m southwest-facing ridge in a built-up area; CPS asks pilots to consider nearby residents."
    cps_url: "https://www.cps.to/flygstallen/sv-larod/"

  - id: hoganas
    enabled: true
    name: Höganäs Strandbaden
    short_name: Höganäs
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: VNV
    ridge_height_m: null
    rose:
      verified: false
      green:
        - { from_deg: 281.25, to_deg: 303.75 }
      orange:
        - { from_deg: 270.0, to_deg: 281.25 }
        - { from_deg: 303.75, to_deg: 315.0 }
    wind_speed:
      verified: false
      notes: "CPS calls this a hard-wind ridge; do not infer numeric limits without verification."
    soaring_height:
      agl_m: 100
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "128"
        priority: 1
        verified: true
    description: "WNW-facing Höganäs site; CPS describes it as an intermediate hard-wind ridge."
    cps_url: "https://www.cps.to/flygstallen/vnv-hoganas/"

  - id: molle
    enabled: true
    name: Kullaberg / Mölle
    short_name: Mölle
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: SSV-VSV
    ridge_height_m: 80
    rose:
      verified: false
      green:
        - { from_deg: 202.5, to_deg: 247.5 }
      orange:
        - { from_deg: 191.25, to_deg: 202.5 }
        - { from_deg: 247.5, to_deg: 258.75 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 180
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "597"
        priority: 1
        verified: true
    description: "Advanced Kullaberg/Mölle ridge; CPS gives SSW–WSW orientation and about 80 m site height."
    restrictions:
      - type: nature_reserve
        severity: warning
        message: "Landing area is on private land within a nature reserve; respect posted signs and reserve personnel instructions. CPS warns of strong currents near the landing beach with a history of drowning incidents - pilots typically fly out over water to lose altitude before final approach."
        status_provider: null
    cps_url: "https://www.cps.to/flygstallen/172-2/"

  # -----------------------
  # SWEDEN — BJÄRE
  # -----------------------

  - id: hovs-hallar-n
    enabled: true
    name: Hovs Hallar N
    short_name: Hovet N
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: N
    ridge_height_m: 150
    rose:
      verified: false
      green:
        - { from_deg: 348.75, to_deg: 11.25 }
      orange:
        - { from_deg: 337.5, to_deg: 348.75 }
        - { from_deg: 11.25, to_deg: 22.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 250
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "127"
        priority: 1
        verified: false
        note: "Verify whether station exposure matches N and/or NV launches."
    description: "North-facing advanced Hovs Hallar site; CPS lists 150 m height."
    cps_url: "https://www.cps.to/flygstallen/n-hovshallar/"

  - id: hovs-hallar-nv
    enabled: true
    name: Hovs Hallar NV
    short_name: Hovet NV
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: NV-NNV
    ridge_height_m: 25
    rose:
      verified: false
      green:
        - { from_deg: 315.0, to_deg: 337.5 }
      orange:
        - { from_deg: 303.75, to_deg: 315.0 }
        - { from_deg: 337.5, to_deg: 348.75 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 150
      verified: false
    live_sources:
      - provider: holfuy
        station_id: "127"
        priority: 1
        verified: true
    description: "NW–NNW Hovs Hallar coastal ridge; CPS lists intermediate/advanced use."
    restrictions:
      - type: local_rule
        severity: warning
        message: "CPS: bring pruning shears (pilots have gotten entangled in bushes); do not launch to the right of the inn; do not land on the field above launch (risk of dislodging stones from the boundary wall) - land on the beach instead."
        status_provider: null
    cps_url: "https://www.cps.to/flygstallen/nv-hovshallar/"

  # -----------------------
  # SWEDEN — VEN
  # -----------------------

  - id: ven-n
    enabled: true
    name: Ven nordsidan
    short_name: Ven N
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: N
    ridge_height_m: 15
    rose:
      verified: false
      green:
        - { from_deg: 348.75, to_deg: 11.25 }
      orange:
        - { from_deg: 337.5, to_deg: 348.75 }
        - { from_deg: 11.25, to_deg: 22.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 100
      verified: false
    live_sources: []
    description: "North side of Ven. CPS page has a malformed wind field; north orientation comes from the page title and must be verified."
    cps_url: "https://www.cps.to/flygstallen/n-ven/"

  - id: ven-so
    enabled: true
    name: Ven sydostsidan
    short_name: Ven SO
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: SO-O
    ridge_height_m: null
    rose:
      verified: false
      green:
        - { from_deg: 90.0, to_deg: 135.0 }
      orange:
        - { from_deg: 78.75, to_deg: 90.0 }
        - { from_deg: 135.0, to_deg: 146.25 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 100
      verified: false
    live_sources: []
    description: "Southeast/east side of Ven; CPS lists it as advanced."
    cps_url: "https://www.cps.to/flygstallen/so-ven/"

  - id: ven-sv
    enabled: true
    name: Ven sydvästsidan
    short_name: Ven SV
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: SV (235°)
    ridge_height_m: 35
    rose:
      verified: false
      green:
        - { from_deg: 223.75, to_deg: 246.25 }
      orange:
        - { from_deg: 212.5, to_deg: 223.75 }
        - { from_deg: 246.25, to_deg: 257.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources: []
    description: "Southwest side of Ven; CPS explicitly gives about 235° and 30–35 m height."
    cps_url: "https://www.cps.to/flygstallen/sv-ven/"

  - id: ven-v
    enabled: true
    name: Ven västsidan
    short_name: Ven V
    country: SE
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: V
    ridge_height_m: 15
    rose:
      verified: false
      green:
        - { from_deg: 258.75, to_deg: 281.25 }
      orange:
        - { from_deg: 247.5, to_deg: 258.75 }
        - { from_deg: 281.25, to_deg: 292.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 100
      verified: false
    live_sources: []
    description: "West/northwest corner of Ven; CPS lists west wind and advanced use."
    cps_url: "https://www.cps.to/flygstallen/v-ven/"

  # -----------------------
  # DENMARK
  # -----------------------

  - id: dk-gilbjerg-hoved
    enabled: true
    name: Gilbjerg Hoved
    short_name: Gilbjerg
    country: DK
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: NNV
    ridge_height_m: 33
    rose:
      verified: false
      green:
        - { from_deg: 326.25, to_deg: 348.75 }
      orange:
        - { from_deg: 315.0, to_deg: 326.25 }
        - { from_deg: 348.75, to_deg: 0.0 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources: []
    description: "NNW-facing 33 m ridge near Gilleleje; CPS lists intermediate use."
    cps_url: "https://www.cps.to/flygstallen/danmark-gilbjerg-hoved/"

  - id: dk-strandbjerggard
    enabled: true
    name: Strandbjerggård / Rågeleje
    short_name: Rågeleje
    country: DK
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: NV
    ridge_height_m: 40
    rose:
      verified: false
      green:
        - { from_deg: 303.75, to_deg: 326.25 }
      orange:
        - { from_deg: 292.5, to_deg: 303.75 }
        - { from_deg: 326.25, to_deg: 337.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources: []
    description: "About 40 m NW-facing Danish coastal ridge; CPS lists intermediate use and several kilometres of ridge."
    cps_url: "https://www.cps.to/flygstallen/danmark-strandbjerggard/"

  - id: dk-lokken
    enabled: true
    name: Løkken
    short_name: Løkken
    country: DK
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: VNV (V-NV)
    ridge_height_m: 25
    rose:
      verified: false
      green:
        - { from_deg: 270.0, to_deg: 315.0 }
      orange:
        - { from_deg: 258.75, to_deg: 270.0 }
        - { from_deg: 315.0, to_deg: 326.25 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 120
      verified: false
    live_sources: []
    description: "Long Danish west-coast ridge system; CPS gives W–NW and roughly 15–25 m ridge height."
    cps_url: "https://www.cps.to/flygstallen/danmark-lokken-vnv/"

  - id: dk-dokkedal
    enabled: true
    name: Dokkedal
    short_name: Dokkedal
    country: DK
    type: hang
    coordinates:
      lat: null
      lon: null
      verified: false
    source_direction_label: O
    ridge_height_m: 48
    rose:
      verified: false
      green:
        - { from_deg: 78.75, to_deg: 101.25 }
      orange:
        - { from_deg: 67.5, to_deg: 78.75 }
        - { from_deg: 101.25, to_deg: 112.5 }
    wind_speed:
      verified: false
    soaring_height:
      agl_m: 150
      verified: false
    live_sources: []
    description: "48 m east-facing Danish site; CPS notes it can be thermic."
    cps_url: "https://www.cps.to/flygstallen/danmark-dokkedal-o/"

  # -----------------------
  # CPS INDEX — PRESERVED BUT DISABLED IN V1
  # -----------------------

  - id: skolbackar
    enabled: false
    name: Skolbackar
    country: SE
    type: school
    coordinates: { lat: null, lon: null, verified: false }
    rose: { verified: false, green: [], orange: [] }
    wind_speed: { verified: false }
    soaring_height: { agl_m: null, verified: false }
    live_sources: []
    description: "CPS catalogue entry; preserved but disabled until the individual school-hill locations and semantics are defined."
    cps_url: "https://www.cps.to/flygstallen/"

  - id: paramotor-dalhall
    enabled: false
    name: Paramotor Dalhäll
    country: SE
    type: paramotor
    coordinates: { lat: null, lon: null, verified: false }
    rose: { verified: false, green: [], orange: [] }
    wind_speed: { verified: false }
    soaring_height: { agl_m: null, verified: false }
    live_sources: []
    description: "CPS catalogue entry; disabled until paramotor-specific semantics are designed."
    cps_url: "https://www.cps.to/flygstallen/"

  - id: paramotor-veslanda
    enabled: false
    name: Paramotor Veslanda
    country: SE
    type: paramotor
    coordinates: { lat: null, lon: null, verified: false }
    rose: { verified: false, green: [], orange: [] }
    wind_speed: { verified: false }
    soaring_height: { agl_m: null, verified: false }
    live_sources: []
    description: "CPS catalogue entry; disabled until paramotor-specific semantics are designed."
    cps_url: "https://www.cps.to/flygstallen/"

  - id: winch-brandstad
    enabled: false
    name: Vinschfält Brandstad
    country: SE
    type: winch
    coordinates: { lat: null, lon: null, verified: false }
    rose: { verified: false, green: [], orange: [] }
    wind_speed: { verified: false }
    soaring_height: { agl_m: null, verified: false }
    live_sources: []
    description: "CPS winch-field catalogue entry; disabled from rose map until winch-specific rules are designed."
    cps_url: "https://www.cps.to/flygstallen/"

  - id: winch-urasa
    enabled: false
    name: Vinschfält Uråsa
    country: SE
    type: winch
    coordinates: { lat: null, lon: null, verified: false }
    rose: { verified: false, green: [], orange: [] }
    wind_speed: { verified: false }
    soaring_height: { agl_m: null, verified: false }
    live_sources: []
    description: "CPS winch-field catalogue entry; disabled from rose map until winch-specific rules are designed."
    cps_url: "https://www.cps.to/flygstallen/"
```

## Agent maintenance rules

When the agent verifies a site:
- update the value;
- set the relevant `verified` flag;
- add/source note if useful;
- record the evidence in `docs/SITE_DATA_AUDIT.md`.

Do not widen/narrow a flying sector merely to make more map icons turn green.

The site's physical reality is authoritative, not UI aesthetics.
