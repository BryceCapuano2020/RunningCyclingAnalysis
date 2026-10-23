"""Extract the USATF 2025 road age standards from the two published workbooks, as JSON.

Stdlib only. Run it isolated, because the workbooks are downloaded, untrusted files:

    python3 -I packages/core/scripts/extract-road-standards.py \
        MaleRoadStd2025.xlsx FemaleRoadStd2025.xlsx > road-standards.json

Provenance chain, in order:

1. Download both workbooks from the Age-Grade-Tables repository (CC0 1.0; Alan Jones and
   Tom Bernhard), pinned to commit 4aac6737cb9f216c90a0a610355667cd3d921c61 (2025-07-27),
   folder "2025 Files":
   - https://raw.githubusercontent.com/AlanLyttonJones/Age-Grade-Tables/4aac6737cb9f216c90a0a610355667cd3d921c61/2025%20Files/MaleRoadStd2025.xlsx
     SHA-256 f9fc6cdc202194dccf730c352d49c025f7466e50049a54224535ece3b956099e
   - https://raw.githubusercontent.com/AlanLyttonJones/Age-Grade-Tables/4aac6737cb9f216c90a0a610355667cd3d921c61/2025%20Files/FemaleRoadStd2025.xlsx
     SHA-256 3dd4fc6ccba593019066dece02ddda3a8b264c76f338476a6cf6c40917560c99
   This script refuses any file whose SHA-256 differs from these values.
2. This script reads the seconds sheet of each workbook (AgeStdSec for male, AgeStanSec for
   female) and writes road-standards.json to stdout. It reads no other sheet.
3. packages/core/scripts/build-road-standards.mjs turns the JSON into
   packages/core/src/grade/roadStandards.ts.
"""

import hashlib
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RELS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG = "{http://schemas.openxmlformats.org/package/2006/relationships}"

WORKBOOKS = {
    "male": {
        "name": "MaleRoadStd2025.xlsx",
        "sheet": "AgeStdSec",
        "sha256": "f9fc6cdc202194dccf730c352d49c025f7466e50049a54224535ece3b956099e",
    },
    "female": {
        "name": "FemaleRoadStd2025.xlsx",
        "sheet": "AgeStanSec",
        "sha256": "3dd4fc6ccba593019066dece02ddda3a8b264c76f338476a6cf6c40917560c99",
    },
}
REPO = "https://github.com/AlanLyttonJones/Age-Grade-Tables"
RAW = (
    "https://raw.githubusercontent.com/AlanLyttonJones/Age-Grade-Tables/"
    "4aac6737cb9f216c90a0a610355667cd3d921c61/2025%20Files"
)
FIRST_AGE, LAST_AGE = 5, 100
DISTANCE_COUNT = 22


def column_index(col):
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n


def shared_strings(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return [
        "".join(t.text or "" for t in si.iter(MAIN + "t")) for si in root.findall(MAIN + "si")
    ]


def sheet_part(z, name):
    workbook = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    targets = {r.get("Id"): r.get("Target") for r in rels.findall(PKG + "Relationship")}
    for sheet in workbook.find(MAIN + "sheets").findall(MAIN + "sheet"):
        if sheet.get("name") == name:
            target = targets.get(sheet.get(RELS + "id"))
            if target is None:
                raise ValueError(f"sheet {name!r} has no relationship target")
            target = target.lstrip("/")
            return target if target.startswith("xl/") else "xl/" + target
    raise ValueError(f"no sheet named {name!r}")


def cell_value(cell, strings):
    kind = cell.get("t", "n")
    if kind == "inlineStr":
        return "".join(t.text or "" for t in cell.iter(MAIN + "t"))
    raw = cell.findtext(MAIN + "v")
    if raw is None:
        return None
    if kind == "s":
        index = int(raw)
        if index >= len(strings):
            raise ValueError(f"cell {cell.get('r')} refers to shared string {index}, not in the table")
        return strings[index]
    if kind == "str":
        return raw
    if kind == "n":
        return float(raw)
    raise ValueError(f"unsupported cell type {kind!r} at {cell.get('r')}")


def read_grid(path, sheet):
    """Map (column, row) to the value of each non-empty cell on the named sheet."""
    with zipfile.ZipFile(path) as z:
        strings = shared_strings(z)
        root = ET.fromstring(z.read(sheet_part(z, sheet)))
    grid = {}
    for cell in root.iter(MAIN + "c"):
        match = re.fullmatch(r"([A-Z]+)(\d+)", cell.get("r", ""))
        value = cell_value(cell, strings)
        if match and value is not None:
            grid[(match.group(1), int(match.group(2)))] = value
    return grid


def whole_seconds(value, where):
    if value is None:
        raise ValueError(f"{where}: the cell is empty")
    if not isinstance(value, float) or not math.isfinite(value):
        raise ValueError(f"{where}: {value!r} is not a number of seconds")
    if value != int(value) or value <= 0:
        raise ValueError(f"{where}: {value!r} is not positive whole seconds")
    return int(value)


def age_rows(grid, sex):
    """Map each age to its row in column A. Repeated, fractional or stray ages are errors."""
    rows = {}
    for (col, row), value in grid.items():
        if col != "A" or row < 4 or not isinstance(value, float):
            continue
        if not math.isfinite(value) or value != int(value):
            raise ValueError(f"{sex}: row {row} has age {value!r}, which is not a whole number")
        age = int(value)
        if age in rows:
            raise ValueError(f"{sex}: age {age} is on rows {rows[age]} and {row}")
        rows[age] = row
    wanted = set(range(FIRST_AGE, LAST_AGE + 1))
    if set(rows) != wanted:
        extra = sorted(set(rows) - wanted)
        missing = sorted(wanted - set(rows))
        raise ValueError(
            f"{sex}: ages must be {FIRST_AGE} to {LAST_AGE}; extra {extra}, missing {missing}"
        )
    return rows


def extract_sex(sex, path):
    grid = read_grid(path, WORKBOOKS[sex]["sheet"])
    columns = sorted(
        (col for (col, row), v in grid.items() if row == 3 and col != "A" and isinstance(v, float)),
        key=column_index,
    )
    if len(columns) != DISTANCE_COUNT:
        raise ValueError(f"{sex}: found {len(columns)} distance columns, expected {DISTANCE_COUNT}")
    km = [grid[(col, 3)] for col in columns]
    labels = [grid.get((col, 2)) for col in columns]
    rows = age_rows(grid, sex)
    table = {}
    for age in range(FIRST_AGE, LAST_AGE + 1):
        row = rows[age]
        table[str(age)] = [
            whole_seconds(grid.get((col, row)), f"{sex} age {age}, column {col}")
            for col in columns
        ]
    return labels, [round(k * 1000.0, 6) for k in km], table


def check_sha256(path, expected, name):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected:
        raise ValueError(f"{name}: SHA-256 {actual} does not match the published {expected}")


def build(paths):
    for sex, path in paths.items():
        check_sha256(path, WORKBOOKS[sex]["sha256"], WORKBOOKS[sex]["name"])
    female_labels, female_distances, female = extract_sex("female", paths["female"])
    male_labels, male_distances, male = extract_sex("male", paths["male"])
    if male_distances != female_distances or male_labels != female_labels:
        raise ValueError("male and female workbooks disagree on the distance columns")
    return {
        "source": {
            "repository": REPO,
            "commit": "4aac6737cb9f216c90a0a610355667cd3d921c61",
            "commitDate": "2025-07-27T19:44:11Z",
            "folder": "2025 Files",
            "files": {sex: "2025 Files/" + WORKBOOKS[sex]["name"] for sex in WORKBOOKS},
            "urls": {sex: f"{RAW}/{WORKBOOKS[sex]['name']}" for sex in WORKBOOKS},
            "sha256": {sex: WORKBOOKS[sex]["sha256"] for sex in WORKBOOKS},
            "licence": "CC0 1.0 Universal (public domain dedication), see LICENSE.md in the repository",
            "licenceUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
            "approval": "Approved 2025-01-10 by Masters Long Distance Running (MLDR) of USA Track & "
            "Field (USATF), as stated in the workbooks",
            "compiled": "Alan Jones; single-age bests by Tom Bernhard (as stated in the workbooks)",
        },
        "distanceLabels": male_labels,
        "distancesM": male_distances,
        "female": female,
        "male": male,
    }


def main(argv):
    names = [WORKBOOKS["male"]["name"], WORKBOOKS["female"]["name"]]
    if len(argv) != 3:
        print(
            f"usage: python3 -I extract-road-standards.py {' '.join(names)} > road-standards.json",
            file=sys.stderr,
        )
        return 2
    try:
        data = build({"male": argv[1], "female": argv[2]})
    except (OSError, ValueError, zipfile.BadZipFile, ET.ParseError) as error:
        print(f"extract-road-standards: {error}", file=sys.stderr)
        return 1
    except (IndexError, OverflowError) as error:
        print(f"extract-road-standards: the workbook is malformed: {error}", file=sys.stderr)
        return 1
    json.dump(data, sys.stdout, indent=1)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
