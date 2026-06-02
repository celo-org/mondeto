"""Continent → ISO 3166-1 alpha-3 country code mapping.

Codes match the `class` attributes in `Blank_world_map_Equal_Earth_projection.svg`
(taken from Natural Earth). A few non-ISO codes used by that file are included:

  - SAH (Western Sahara), PSX (Palestine), SDS (South Sudan),
    KOS (Kosovo), CYN (Northern Cyprus), ALD (Aland), ATF (French
    Southern & Antarctic Lands).

Cross-continent countries are placed where the bulk of their land sits:
Russia and Turkey go in Asia (most of their area is east of the Urals /
Bosporus), even though they are culturally European.
"""

CONTINENTS: dict[str, list[str]] = {
    "africa": [
        "DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CMR", "CPV", "CAF",
        "TCD", "COM", "COG", "COD", "CIV", "DJI", "EGY", "GNQ", "ERI",
        "SWZ", "ETH", "GAB", "GMB", "GHA", "GIN", "GNB", "KEN", "LSO",
        "LBR", "LBY", "MDG", "MWI", "MLI", "MRT", "MUS", "MAR", "MOZ",
        "NAM", "NER", "NGA", "RWA", "STP", "SEN", "SYC", "SLE", "SOM",
        "ZAF", "SDS", "SDN", "TZA", "TGO", "TUN", "UGA", "ZMB", "ZWE",
        "SAH", "SHN", "IOT",
    ],
    "asia": [
        "AFG", "ARM", "AZE", "BHR", "BGD", "BTN", "BRN", "KHM", "CHN",
        "GEO", "HKG", "IND", "IDN", "IRN", "IRQ", "ISR", "JPN", "JOR",
        "KAZ", "KWT", "KGZ", "LAO", "LBN", "MAC", "MYS", "MDV", "MNG",
        "MMR", "NPL", "PRK", "OMN", "PAK", "PHL", "QAT", "RUS", "SAU",
        "SGP", "KOR", "LKA", "SYR", "TWN", "TJK", "THA", "TLS", "TUR",
        "TKM", "ARE", "UZB", "VNM", "YEM", "CYP", "PSX", "CYN",
    ],
    "europe": [
        "ALB", "AND", "AUT", "BLR", "BEL", "BIH", "BGR", "HRV", "CZE",
        "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "ISL", "IRL",
        "ITA", "LVA", "LIE", "LTU", "LUX", "MLT", "MDA", "MCO", "MNE",
        "NLD", "MKD", "NOR", "POL", "PRT", "ROU", "SMR", "SRB",
        "SVK", "SVN", "ESP", "SWE", "CHE", "UKR", "GBR", "VAT", "KOS",
        "ALD", "FRO", "GGY", "JEY", "IMN", "GIB",
    ],
    "north-america": [
        "ATG", "BHS", "BRB", "BLZ", "CAN", "CRI", "CUB", "DMA", "DOM",
        "SLV", "GRD", "GTM", "HTI", "HND", "JAM", "MEX", "NIC", "PAN",
        "KNA", "LCA", "VCT", "TTO", "USA", "ABW", "AIA", "BMU", "CYM",
        "CUW", "GRL", "MSR", "PRI", "BLM", "MAF", "SPM", "SXM", "TCA",
        "VGB", "VIR",
    ],
    "oceania": [
        # PNG (Papua New Guinea) is intentionally omitted: it shares the
        # island of New Guinea with Indonesia (IDN, which lives in Asia), so
        # including it would render only the eastern half of the island,
        # bisected by the political border. Drop it to keep Oceania visually
        # clean.
        "AUS", "FJI", "KIR", "MHL", "FSM", "NRU", "NZL", "PLW",
        "WSM", "SLB", "TON", "TUV", "VUT", "COK", "NCL", "NIU", "NFK",
        "ASM", "GUM", "MNP", "PYF", "WLF",
    ],
    "south-america": [
        "ARG", "BOL", "BRA", "CHL", "COL", "ECU", "GUY", "PRY", "PER",
        "SUR", "URY", "VEN", "FLK",
    ],
    "antarctica": [
        "ATA", "ATF",
    ],
}
