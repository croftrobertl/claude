# Wildlife Guide: Local-First Classification

Data pulled from the iNaturalist public API on 2026-10-22. Species list: the 402 entries in `window.DCC_WL_CFG` on https://doracanalcourt.com/explore/ (plugin data version 1.44.6).

## Counts

| Group | HERE | NEAR | WIDER | UNRESOLVED | Total |
|---|---|---|---|---|---|
| birds | 126 | 7 | 0 | 0 | 133 |
| critters | 144 | 27 | 4 | 0 | 175 |
| plants | 60 | 12 | 1 | 0 | 73 |
| safety | 16 | 3 | 2 | 0 | 21 |
| **all** | 346 | 49 | 7 | 0 | 402 |

**Unresolved: none.** Five names failed automatic matching and were resolved by hand (see Name Issues).

## Method

- Centre point 28.80, -81.73 (Tavares; the Dora Canal is ~3 km east). HERE = at least one usable record within 15 km. NEAR = none within 15 km, at least one within 40 km (roughly Lake County). WIDER = none within 40 km.
- Records counted: iNaturalist research grade, wild only (`captive=false`, which also drops cultivated plants), and **usable coordinates**: not obscured, and positional accuracy under 5 km or not stated. A first pass without the coordinate filter found 353 HERE; records whose public point is randomised (threatened species, private users) or fuzzed by tens of km were then removed, because they cannot prove a species was within 15 km.
- Species that iNat only has with obscured coordinates are put in NEAR, not WIDER, with the note "NEAR only via obscured/imprecise records - verify before use". iNat hides locations for gopher tortoise, diamondback, indigo snake and others on purpose, so absence of a usable record says nothing about them.
- Subspecies (trinomials) were counted at species level, because iNat users rarely identify to subspecies; the note column records both counts. Genus/family entries (Polistes, Culicoides, Pterygoplichthys, Trombiculidae, Culicidae) were queried at that rank.
- For every NEAR/WIDER species I also listed same-genus species recorded within 15 km, to catch taxonomy splits (see below).
- `example_url` is the most recent usable observation in range; `latest_date` is its date. HERE rows with 1-2 records or a latest record before 2016 are flagged `THIN` in notes.
- Plants: captive/cultivated records within 15 km are excluded and counted in notes.
- Limits: iNat is a presence-only source and strongly undersampled around Tavares (white-tailed deer has 1 usable record within 15 km, 447 within 40 km). NEAR/WIDER means "not verified here", never "absent". Raw API responses are cached in `inat_cache.json`; scripts can be re-run.

## Manatee

- Classified **HERE (owner observation)**: Rob, Erica and Rick have seen manatees in the canal and on the Chain lakes several times, mostly in warm months. iNat has 3 research-grade manatee records within 15 km (340 within 40 km), but iNat hides manatee coordinates, so they support the owners but cannot verify on their own.
- Claim checked: "first Lake County manatee record was in 2015 near Leesburg". **Partly confirmed, with wording issues.**
  - Lake County Water Atlas, 2020-10-16 (republishing the South Lake Tablet): a female called "Leesburg" first visited the Harris Chain in 2015 and was "the first recorded manatee in Lake County". https://lake.wateratlas.usf.edu/news/details/19458/
  - Lake County Water Atlas, 2018-04-23: "The first documented manatee in Lake County". https://lake.wateratlas.usf.edu/news/details/17339/
  - Orlando Sentinel via Water Atlas, 2017-08-25, is more cautious: "One of the first recorded manatees in Lake County", named after the city near where she was first seen in 2015. https://lake.wateratlas.usf.edu/news/details/16789/
  - WDBO, 2015-04-07: several manatees seen that week (two in Lake Griffin, one in Little Lake Harris near Howey-in-the-Hills) and called "rare"; it does not say they were the first. https://www.wdbo.com/news/news/local/rare-sightings-manatees-spotted-lake-county-lakes/nkpWc/
  - No FWC source found. Safe wording: "Manatees were first documented in the Harris Chain in 2015; one, nicknamed Leesburg, became a local regular." Avoid saying the record was a sighting *at* Leesburg; the sources say she was named after the city near where she was first seen.

## Name Issues Found (Site Scientific Names)

- Florida Box Turtle — site `Terrapene bauri`, iNat uses `Terrapene carolina`
- Cooper’s Hawk — site `Accipiter cooperii`, iNat uses `Astur cooperii`
- Barn Owl — site `Tyto alba`: iNat splits American Barn Owl (Tyto furcata) from Tyto alba; site sci name may be outdated
- Red-cockaded Woodpecker — site `Dryobates borealis`, iNat uses `Leuconotopicus borealis`
- Herring Gull — site `Larus argentatus`: American Herring Gull is Larus smithsonianus on iNat
- Hairy Woodpecker — site `Dryobates villosus`, iNat uses `Leuconotopicus villosus`
- Red Bay — site `Persea borbonia`, iNat uses `Tamala borbonia`
- Camphor Tree — site `Cinnamomum camphora`, iNat uses `Camphora officinarum`
- Sawgrass — site `Cladium jamaicense`, iNat uses `Cladium mariscus jamaicense (subspecies)`
- Florida Black Bear — site `Ursus americanus floridanus`, iNat uses `Ursus americanus americanus`
- Nine-banded Armadillo — site `Dasypus novemcinctus`: iNat files US nine-banded armadillos under Dasypus mexicanus (split from D. novemcinctus); site sci name may be outdated
- Brook Silverside — site `Labidesthes sicculus`: iNat splits Florida populations as Labidesthes vanhyningi (Hardy Silverside) from L. sicculus
- Green Tree Frog — site `Hyla cinerea`, iNat uses `Dryophytes cinereus`
- Squirrel Tree Frog — site `Hyla squirella`, iNat uses `Dryophytes squirellus`
- Barking Treefrog — site `Hyla gratiosa`, iNat uses `Dryophytes gratiosus`
- Pinewoods Treefrog — site `Hyla femoralis`, iNat uses `Dryophytes femoralis`
- Peninsula Ribbon Snake — site `Thamnophis sauritus sackenii`, iNat uses `Thamnophis saurita sackenii`
- Six-lined Racerunner — site `Aspidoscelis sexlineata`, iNat uses `Aspidoscelis sexlineatus`
- Cattle Egret — site `Bubulcus ibis`, iNat uses `Ardea ibis`
- Least Bittern — site `Ixobrychus exilis`, iNat uses `Botaurus exilis`
- Florida Gar — site spells `Lepisosteus platyrhinus`; correct is `Lepisosteus platyrhincus` (typo).
- Bowfin — site `Amia ocellata` (the 2022 split) is not in iNat; queried `Amia calva`.
- Blue Flag Iris — no usable `Iris virginica` within 40 km, but Prairie Iris (`Iris savannarum`) has 5 within 15 km. The site may have the wrong species.

## NEAR: Rob to Decide

| Species | Group | Why |
|---|---|---|
| Eastern Diamondback Rattlesnake (*Crotalus adamanteus*) | safety | 3 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 56 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 56) |
| Dusky Pygmy Rattlesnake (*Sistrurus miliarius barbouri*) | safety | 0 usable records within 15 km; 239 within 40 km (all-precision: 344) |
| Cane Toad (*Rhinella marina*) | critters | 0 usable records within 15 km; 1 within 40 km (all-precision: 3) |
| Saddleback Caterpillar (*Acharia stimulea*) | safety | 0 usable records within 15 km; 16 within 40 km (all-precision: 21) |
| Gopher Tortoise (*Gopherus polyphemus*) | critters | 69 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 1111 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 1111) |
| Florida Box Turtle (*Terrapene bauri*) | critters | iNat name: Terrapene carolina; 11 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 114 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 114) |
| Loggerhead Musk Turtle (*Sternotherus minor*) | critters | 4 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 64 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 64) |
| Florida Mud Turtle (*Kinosternon steindachneri*) | critters | 8 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 8) |
| Florida Chicken Turtle (*Deirochelys reticularia chrysea*) | critters | 4 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 26 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 26) |
| Eastern Whip-poor-will (*Antrostomus vociferus*) | birds | 0 usable records within 15 km; 6 within 40 km (all-precision: 7) |
| Red-cockaded Woodpecker (*Dryobates borealis*) | birds | iNat name: Leuconotopicus borealis; 1 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 0 usable records within 15 km; 17 within 40 km (all-precision: 23) |
| Common Loon (*Gavia immer*) | birds | 0 usable records within 15 km; 9 within 40 km (all-precision: 11) |
| Herring Gull (*Larus argentatus*) | birds | TAXONOMY: American Herring Gull is Larus smithsonianus on iNat (queried Larus smithsonianus, taxon 1578489; original name gave n15=0); 0 usable records within 15 km; 3 within 40 km |
| Painted Bunting (*Passerina ciris*) | birds | 25 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 163 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 163) |
| Loggerhead Shrike (*Lanius ludovicianus*) | birds | 1 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 0 usable records within 15 km; 84 within 40 km (all-precision: 106) |
| Hairy Woodpecker (*Dryobates villosus*) | birds | iNat name: Leuconotopicus villosus; 0 usable records within 15 km; 8 within 40 km (all-precision: 9) |
| Laurel Oak (*Quercus laurifolia*) | plants | 0 usable records within 15 km; 13 within 40 km (all-precision: 19) |
| Turkey Oak (*Quercus laevis*) | plants | 1 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 0 usable records within 15 km; 143 within 40 km (all-precision: 202) |
| Pop Ash (*Fraxinus caroliniana*) | plants | 0 usable records within 15 km; 20 within 40 km (all-precision: 29) |
| Chickasaw Plum (*Prunus angustifolia*) | plants | 0 usable records within 15 km; 8 within 40 km (all-precision: 10) |
| Coontie (*Zamia integrifolia*) | plants | 10 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 205 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 205); 3 captive/cultivated iNat records within 15 km excluded |
| Tickseed (*Coreopsis floridana*) | plants | 0 usable records within 15 km; 1 within 40 km (all-precision: 1) |
| Cattail (*Typha domingensis*) | plants | 0 usable records within 15 km; 5 within 40 km (all-precision: 5) |
| Sawgrass (*Cladium jamaicense*) | plants | iNat name: Cladium mariscus jamaicense (subspecies); 0 usable records within 15 km; 3 within 40 km (all-precision: 3) |
| Bladderwort (*Utricularia juncea*) | plants | 0 usable records within 15 km; 1 within 40 km (all-precision: 2) |
| Maidencane (*Panicum hemitomon*) | plants | 0 usable records within 15 km; 1 within 40 km (all-precision: 2) |
| Torpedo Grass (*Panicum repens*) | plants | 1 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 0 usable records within 15 km; 1 within 40 km (all-precision: 3) |
| Duckweed (*Lemna minor*) | plants | 0 usable records within 15 km; 5 within 40 km (all-precision: 5) |
| Gray Fox (*Urocyon cinereoargenteus*) | critters | 0 usable records within 15 km; 4 within 40 km (all-precision: 6) |
| Striped Skunk (*Mephitis mephitis*) | critters | 0 usable records within 15 km; 1 within 40 km (all-precision: 1) |
| Rhesus Macaque (*Macaca mulatta*) | critters | 0 usable records within 15 km; 5 within 40 km (all-precision: 5) |
| Southeastern Pocket Gopher (*Geomys pinetis*) | critters | 0 usable records within 15 km; 73 within 40 km (all-precision: 89) |
| Round-tailed Muskrat (*Neofiber alleni*) | critters | 0 usable records within 15 km; 5 within 40 km (all-precision: 6) |
| Scarlet Kingsnake (*Lampropeltis elapsoides*) | critters | 0 usable records within 15 km; 40 within 40 km (all-precision: 52) |
| Eastern Hognose Snake (*Heterodon platirhinos*) | critters | 4 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 16 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 16) |
| Sand Skink (*Plestiodon reynoldsi*) | critters | 12 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 12) |
| Florida Worm Lizard (*Rhineura floridana*) | critters | 2 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 23 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 23) |
| Florida Scrub Lizard (*Sceloporus woodi*) | critters | 1 record(s) within 15 km but all have obscured or imprecise (>5 km) coordinates; not counted; 59 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 59) |
| Bluespotted Sunfish (*Enneacanthus gloriosus*) | critters | 0 usable records within 15 km; 7 within 40 km (all-precision: 8) |
| Lake Chubsucker (*Erimyzon sucetta*) | critters | 0 usable records within 15 km; 32 within 40 km (all-precision: 37) |
| American Eel (*Anguilla rostrata*) | critters | 9 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 9) |
| Grass Carp (*Ctenopharyngodon idella*) | critters | 0 usable records within 15 km; 6 within 40 km (all-precision: 9) |
| Asian Clam (*Corbicula fluminea*) | critters | 0 usable records within 15 km; 9 within 40 km (all-precision: 15) |
| Everglades Crayfish (*Procambarus alleni*) | critters | 0 usable records within 15 km; 1 within 40 km (all-precision: 1) |
| Grass Shrimp (*Palaemon paludosus*) | critters | 0 usable records within 15 km; 6 within 40 km (all-precision: 8) |
| Gopher Frog (*Lithobates capito*) | critters | 23 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 23) |
| Little Grass Frog (*Pseudacris ocularis*) | critters | 0 usable records within 15 km; 5 within 40 km (all-precision: 6) |
| Peninsula Newt (*Notophthalmus viridescens piaropicola*) | critters | 0 usable records within 15 km; 1 within 40 km (all-precision: 3) |
| Eastern Indigo Snake (*Drymarchon couperi*) | critters | 4 record(s) within 40 km but all obscured/imprecise; NEAR only via obscured/imprecise records - verify before use; 0 usable records within 15 km; 0 within 40 km (all-precision: 4) |

## WIDER

| Species | Group | Why |
|---|---|---|
| No-see-ums (*Culicoides spp.*) | safety | no usable record within 40 km |
| Chiggers (*Trombiculidae*) | safety | no usable record within 40 km |
| Blue Flag Iris (*Iris virginica*) | plants | Possible ID issue: Prairie Iris (Iris savannarum) has 5 usable records within 15 km; Florida blue flag is often treated as I. savannarum |
| Seminole Bat (*Lasiurus seminolus*) | critters | no usable record within 40 km |
| Florida Mouse (*Podomys floridanus*) | critters | no usable record within 40 km |
| Threadfin Shad (*Dorosoma petenense*) | critters | no usable record within 40 km |
| Firefly (*Photuris fairchildi*) | critters | Species-level firefly IDs are rare on iNat; genus Photuris not checked |

## Thin HERE Records (1-2 records, or none since 2016)

Kept as HERE because the rule is "one verified record". Each has an example URL in the CSV worth a glance before relying on it.

Mosquitoes and No-see-ums (2, 2022-11-25), Southern Black Widow (1, 2026-06-03), Lone Star Tick (1, 2026-06-13), Eastern Musk Turtle (2, 2025-05-26), Eastern Screech-Owl (1, 2026-05-08), Barn Owl (2, 2021-03-12), Chuck-will’s-widow (1, 2010-05-20), Lesser Scaup (1, 2024-12-20), Hooded Merganser (2, 2026-02-23), American Wigeon (1, 2018-12-23), Egyptian Goose (1, 2022-01-29), Laughing Gull (1, 2025-06-12), Bonaparte’s Gull (1, 2023-02-13), Black Skimmer (2, 2024-10-10), Prothonotary Warbler (1, 2026-08-09), Red-eyed Vireo (1, 2025-09-24), American Robin (1, 2023-02-20), American Goldfinch (2, 2025-02-07), Chipping Sparrow (2, 2021-02-26), Chimney Swift (1, 2016-08-27), Summer Tanager (2, 2026-08-30), Red-headed Woodpecker (1, 2020-02-16), Rock Pigeon (2, 2025-10-07), House Sparrow (1, 2026-06-05), Southern Red Cedar (1, 2025-07-25), Swamp Tupelo (1, 2025-05-14), Lantana (1, 2021-04-02), Butterfly Weed (1, 2025-12-29), Yaupon Holly (2, 2023-01-19), Adam’s Needle (2, 2025-02-05), Cogongrass (1, 2026-05-01), Eelgrass (2, 2021-03-28), Alligator Weed (2, 2021-10-23), White-tailed Deer (1, 2022-06-07), Wild Hog (2, 2025-05-26), Sherman’s Fox Squirrel (1, 2025-06-11), Southern Flying Squirrel (1, 2026-10-21), Coyote (1, 2020-10-01), Brazilian Free-tailed Bat (1, 2025-10-23), Evening Bat (1, 2026-03-03), Indo-Pacific Gecko (2, 2018-06-24), Sunshine Bass (2, 2024-11-11), Bowfin (2, 2022-02-19), Channel Catfish (1, 2023-09-30), White Catfish (1, 2025-04-16), Yellow Bullhead (1, 2024-11-25), Brook Silverside (2, 2022-10-09), Golden Topminnow (1, 2025-04-17), Least Killifish (2, 2026-04-12), Common Green Darner (2, 2026-09-25), Needham’s Skimmer (5, 2013-08-10), Carolina Mantis (1, 2016-09-17), Eastern Hercules Beetle (1, 2021-07-16), Palmetto Tortoise Beetle (1, 2025-04-26), Oak Toad (2, 2026-08-27), Eastern Spadefoot (2, 2026-05-24), Eastern Garter Snake (2, 2023-08-28), Broad-headed Skink (1, 2023-03-26), Mediterranean House Gecko (1, 2018-01-11), Yellow-crowned Night Heron (2, 2026-04-04), American White Pelican (2, 2026-05-21)
