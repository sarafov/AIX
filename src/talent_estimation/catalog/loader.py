"""Load the capability catalog from YAML, JSON, or an Excel role mapping.

The default catalog ships with the package. Users may upload their own file
for a session; it is parsed in memory and never written to disk.
"""

from __future__ import annotations

import io
import json
import re
from functools import lru_cache
from importlib import resources
from typing import Any

import yaml
from pydantic import BaseModel, Field

from talent_estimation.domain.models import AiCategory, Scope


class RoleProfile(BaseModel):
    """Description of one role in the catalog."""

    code: str
    name: str
    team: str = "data"
    aliases: list[str] = Field(default_factory=list)
    summary: str = ""
    capability_areas: dict[str, str] = Field(default_factory=dict)
    in_scope: str = ""
    out_of_scope: str = ""
    primary_keywords: str = ""
    usually_supporting_on: str = ""
    substitutes: str = ""
    pillars: dict[str, list[str]] = Field(default_factory=dict)
    skill_definitions: dict[str, str] = Field(default_factory=dict)

    def describe(self) -> str:
        """Return a compact text description used in prompts.

        Returns
        -------
        str
            Multi-line description of the role.
        """
        pillars = "; ".join(f"{p}: {', '.join(s)}" for p, s in self.pillars.items())
        areas = "\n".join(f"    - {k}: {v}" for k, v in self.capability_areas.items())
        lines = [f"{self.code} - {self.name}"]
        if self.summary:
            lines.append(f"  Ringkasan: {self.summary}")
        if areas:
            lines.append(f"  Area capability:\n{areas}")
        lines += [
            f"  Lingkup utama: {self.in_scope}",
            f"  Di luar lingkup: {self.out_of_scope}",
            f"  Kata kunci pekerjaan utama: {self.primary_keywords}",
            f"  Biasanya pendukung pada: {self.usually_supporting_on}",
        ]
        if self.substitutes:
            lines.append(f"  Substitusi: {self.substitutes}")
        lines.append(f"  Pilar skill: {pillars}")
        if self.skill_definitions:
            lines.append(
                "  Definisi skill: "
                + "; ".join(f"{s}: {d}" for s, d in self.skill_definitions.items())
            )
        return "\n".join(lines)


class Rule(BaseModel):
    """A decision rule followed by the agents."""

    id: str
    title: str
    text: str


class Catalog(BaseModel):
    """The full capability catalog."""

    version: str = "1.0"
    teams: dict[str, dict[str, Any]] = Field(default_factory=dict)
    roles: dict[str, RoleProfile]
    competency_scale: dict[int, str] = Field(default_factory=dict)
    rules: list[Rule] = Field(default_factory=list)
    allocation_guide: list[dict[str, str]] = Field(default_factory=list)
    classification_rubric: dict[str, str] = Field(default_factory=dict)
    actor_rubric: dict[str, str] = Field(default_factory=dict)
    ai_categories: list[AiCategory] = Field(default_factory=list)

    def roles_for_scope(self, scope: Scope) -> list[str]:
        """Return the role codes that belong to a scope.

        Parameters
        ----------
        scope : {"all", "data", "design"}
            Team scope selected by the user.

        Returns
        -------
        list of str
            Role codes in catalog order.
        """
        if scope == "all":
            return list(self.roles)
        return [code for code, role in self.roles.items() if role.team == scope]

    def find_skill(self, role: str, skill: str, pillar: str = "") -> tuple[str, str] | None:
        """Match a skill name to the role's catalog, ignoring case and spacing.

        Parameters
        ----------
        role : str
            Role code.
        skill : str
            Skill name proposed by a model.
        pillar : str, optional
            Pillar proposed with it, used to break ties.

        Returns
        -------
        tuple of (str, str) or None
            Catalog pillar and skill, or ``None`` when the skill is not listed.
        """
        profile = self.roles.get(role)
        if profile is None:
            return None

        def norm(text: str) -> str:
            return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()

        wanted, wanted_pillar = norm(skill), norm(pillar)
        matches = [
            (p, s) for p, skills in profile.pillars.items() for s in skills if norm(s) == wanted
        ]
        if not matches:
            return None
        return next((m for m in matches if norm(m[0]) == wanted_pillar), matches[0])

    def ai_category(self, key: str) -> AiCategory | None:
        """Return the AI category with the given key, if it exists."""
        return next((c for c in self.ai_categories if c.key == key), None)

    def match_role(self, text: str) -> list[str]:
        """Find catalog roles mentioned in a free-text role hint.

        Parameters
        ----------
        text : str
            Role column of a WBS row, for example ``"Data Engineer, BA"``.

        Returns
        -------
        list of str
            Matching role codes. Short aliases match whole words only.
        """
        found: list[str] = []
        lowered = text.lower()
        for code, role in self.roles.items():
            for alias in [role.name.lower(), *role.aliases]:
                pattern = rf"\b{re.escape(alias.lower())}\d*\b"
                if re.search(pattern, lowered):
                    found.append(code)
                    break
        return found


def _from_mapping(data: dict[str, Any]) -> Catalog:
    roles = {code: RoleProfile(code=code, **body) for code, body in data.get("roles", {}).items()}
    return Catalog(**{**data, "roles": roles})


@lru_cache(maxsize=1)
def load_default_catalog() -> Catalog:
    """Load the catalog that ships with the package.

    Returns
    -------
    Catalog
        The default catalog.
    """
    text = (
        resources.files("talent_estimation.catalog")
        .joinpath("default_catalog.yaml")
        .read_text(encoding="utf-8")
    )
    catalog = _from_mapping(yaml.safe_load(text))
    overlay_file = resources.files("talent_estimation.catalog").joinpath("capability_overlay.json")
    if overlay_file.is_file():
        grouped: dict[str, dict[str, list[str]]] = {}
        for row in json.loads(overlay_file.read_text(encoding="utf-8")):
            code, pillar, skill, definition = row
            grouped.setdefault(code, {}).setdefault(pillar, []).append(skill)
            catalog.roles[code].skill_definitions[skill] = definition
        for code, pillars in grouped.items():
            catalog.roles[code].pillars = pillars
        catalog.version = "1.2-AIX"
    return catalog


def _split_skills(value: str) -> list[str]:
    return [s.strip() for s in re.split(r"[·;\n]", value) if s.strip()]


SCOPE_COLUMNS: list[tuple[str, str, str]] = [
    ("code", "Kode", "Kode singkat role, misalnya DE. Wajib."),
    ("name", "Capability", "Nama role. Wajib."),
    ("team", "Tim", "data atau design."),
    ("summary", "Ringkasan", "Satu-dua kalimat tentang apa yang dikerjakan role ini."),
    (
        "capability_areas",
        "Area capability",
        "Satu area per baris dengan format: Nama area: deskripsi.",
    ),
    ("in_scope", "In-scope (Utama)", "Pekerjaan inti role ini."),
    ("out_of_scope", "Out-of-scope", "Pekerjaan yang bukan milik role ini, sebutkan pemiliknya."),
    (
        "primary_keywords",
        "Kata kunci item -> Utama",
        "Kata kunci item WBS yang menandakan role ini Utama, pisahkan dengan koma.",
    ),
    (
        "usually_supporting_on",
        "Biasanya Pendukung pada",
        "Situasi di mana role ini hanya mendukung.",
    ),
    ("substitutes", "Substitusi", "Role lain yang bisa menutup sebagian pekerjaan ini."),
    ("aliases", "Alias", "Nama lain role di WBS, pisahkan dengan koma."),
]
"""Columns of the ``Scope_Capability`` sheet: field, header, and guidance."""

_HEADER_ALIASES = {
    "kode": "code",
    "capability": "name",
    "role": "name",
    "tim": "team",
    "team": "team",
    "ringkasan": "summary",
    "area capability": "capability_areas",
    "in-scope (utama)": "in_scope",
    "in-scope": "in_scope",
    "out-of-scope": "out_of_scope",
    "kata kunci item -> utama": "primary_keywords",
    "kata kunci item → utama": "primary_keywords",
    "kata kunci": "primary_keywords",
    "biasanya pendukung pada": "usually_supporting_on",
    "substitusi": "substitutes",
    "alias": "aliases",
}
_LEGACY_ORDER = [
    "code",
    "name",
    "in_scope",
    "out_of_scope",
    "primary_keywords",
    "usually_supporting_on",
]


def _parse_areas(text: str) -> dict[str, str]:
    areas: dict[str, str] = {}
    for line in str(text).splitlines():
        if ":" in line:
            name, description = line.split(":", 1)
            areas[name.strip(" -")] = description.strip()
    return areas


def _catalog_from_excel(content: bytes) -> Catalog:
    """Read a catalog workbook with ``Scope_Capability`` and ``Pilar_Skill`` sheets.

    Columns are matched by header name, so they may appear in any order.
    Workbooks without the newer columns are still read in the original order.
    Fields that are missing keep their default value when the role code is
    known.
    """
    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    base = load_default_catalog().model_copy(deep=True)
    roles: dict[str, RoleProfile] = {}

    # Accept the one-skill-per-row catalog prepared for the self-assessment.
    flat_sheet = next(
        (
            s
            for s in workbook
            if [str(c or "").strip().lower() for c in next(s.iter_rows(values_only=True), ())][:4]
            == ["role", "category", "skill", "definition"]
        ),
        None,
    )
    if flat_sheet is not None:
        for row in flat_sheet.iter_rows(min_row=2, values_only=True):
            if len(row) < 3 or not all(row[:3]):
                continue
            code, pillar, skill = (str(x).strip() for x in row[:3])
            if code not in base.roles:
                raise ValueError(f"Unknown catalog role: {code}.")
            if code not in roles:
                roles[code] = base.roles[code].model_copy(deep=True)
                roles[code].pillars = {}
                roles[code].skill_definitions = {}
            if skill in roles[code].pillars.get(pillar, []):
                raise ValueError(f"Duplicate catalog skill: {code}/{pillar}/{skill}.")
            roles[code].pillars.setdefault(pillar, []).append(skill)
            if len(row) > 3 and row[3]:
                roles[code].skill_definitions[skill] = str(row[3]).strip()
        if not roles:
            raise ValueError("The catalog has no skill rows.")
        base.roles.update(roles)
        return base

    if "Scope_Capability" in workbook.sheetnames:
        rows = list(workbook["Scope_Capability"].iter_rows(values_only=True))
        header_index = next(
            (
                i
                for i, row in enumerate(rows)
                if row and str(row[0] or "").strip().lower() == "kode"
            ),
            None,
        )
        if header_index is not None:
            headers = [str(c or "").strip().lower() for c in rows[header_index]]
            fields = [_HEADER_ALIASES.get(h) for h in headers]
            if "summary" not in fields and "capability_areas" not in fields:
                fields = _LEGACY_ORDER + [None] * max(0, len(headers) - len(_LEGACY_ORDER))
            for row in rows[header_index + 1 :]:
                values = {f: row[i] for i, f in enumerate(fields) if f and i < len(row)}
                code = str(values.get("code") or "").strip()
                name = str(values.get("name") or "").strip()
                if not code or not name or len(code) > 6:
                    continue
                default = base.roles.get(code)
                data: dict[str, Any] = default.model_dump() if default else {"team": "data"}
                data.update({"code": code, "name": name})
                for field in (
                    "team", "summary", "in_scope", "out_of_scope", "primary_keywords",
                    "usually_supporting_on", "substitutes",
                ):  # fmt: skip
                    if values.get(field) not in (None, ""):
                        data[field] = str(values[field]).strip()
                if values.get("capability_areas"):
                    data["capability_areas"] = _parse_areas(str(values["capability_areas"]))
                if values.get("aliases"):
                    data["aliases"] = [
                        a.strip().lower() for a in str(values["aliases"]).split(",") if a.strip()
                    ]
                elif not default:
                    data["aliases"] = [name.lower()]
                data["pillars"] = {}
                roles[code] = RoleProfile(**data)

    if "Pilar_Skill" in workbook.sheetnames:
        for row in workbook["Pilar_Skill"].iter_rows(values_only=True):
            if not row or len(row) < 3 or not row[0] or not row[1]:
                continue
            code = str(row[0]).strip()
            if code in roles and row[2]:
                roles[code].pillars[str(row[1]).strip()] = _split_skills(str(row[2]))

    for code, role in roles.items():
        if not role.pillars and code in base.roles:
            role.pillars = base.roles[code].pillars

    if "Skill_Definitions" in workbook.sheetnames:
        for row in workbook["Skill_Definitions"].iter_rows(min_row=2, values_only=True):
            if len(row) >= 4 and str(row[0]) in roles and row[2] and row[3]:
                roles[str(row[0])].skill_definitions[str(row[2]).strip()] = str(row[3]).strip()

    if not roles:
        raise ValueError(
            "Workbook tidak memuat sheet Scope_Capability dengan kolom Kode dan Capability."
        )
    base.roles = roles
    return base


def catalog_to_excel(catalog: Catalog) -> bytes:
    """Write a catalog as an Excel workbook that can be edited and uploaded again.

    Parameters
    ----------
    catalog : Catalog
        Catalog to export, usually the one active in the session.

    Returns
    -------
    bytes
        ``.xlsx`` content with ``Petunjuk``, ``Scope_Capability``, and
        ``Pilar_Skill`` sheets.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2E1A47")
    wrap = Alignment(wrap_text=True, vertical="top")

    workbook = Workbook()
    guide = workbook.active
    guide.title = "Petunjuk"
    guide_rows = [
        ["Format katalog capability"],
        [],
        [
            "1. Ubah isi sheet Scope_Capability dan Pilar_Skill. Jangan ganti nama sheet atau judul kolom."
        ],
        ["2. Satu baris Scope_Capability = satu role. Kode dan Capability wajib diisi."],
        [
            "3. Pilar_Skill: satu baris per pilar; pisahkan skill dengan titik tengah (·) atau titik koma."
        ],
        ["4. Simpan sebagai .xlsx lalu unggah di halaman Katalog Capability."],
        [],
        ["Kolom Scope_Capability", "Keterangan"],
        *[[header, guidance] for _, header, guidance in SCOPE_COLUMNS],
    ]
    for row in guide_rows:
        guide.append(row)
    guide["A1"].font = Font(bold=True, size=13)
    for cell in guide[8]:
        cell.font = header_font
        cell.fill = header_fill
    guide.column_dimensions["A"].width = 28
    guide.column_dimensions["B"].width = 90

    scope = workbook.create_sheet("Scope_Capability")
    scope.append([header for _, header, _ in SCOPE_COLUMNS])
    for code, role in catalog.roles.items():
        values = role.model_dump()
        values["code"] = code
        values["capability_areas"] = "\n".join(
            f"{k}: {v}" for k, v in role.capability_areas.items()
        )
        values["aliases"] = ", ".join(role.aliases)
        scope.append([values.get(field, "") for field, _, _ in SCOPE_COLUMNS])
    widths = [8, 18, 8, 40, 60, 60, 45, 60, 45, 40, 30]
    for index, width in enumerate(widths):
        scope.column_dimensions[chr(65 + index)].width = width
    for row in scope.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = wrap

    pillars = workbook.create_sheet("Pilar_Skill")
    pillars.append(["Kode", "Pilar", "Skill"])
    for code, role in catalog.roles.items():
        for pillar, skills in role.pillars.items():
            pillars.append([code, pillar, " · ".join(skills)])
    pillars.column_dimensions["A"].width = 8
    pillars.column_dimensions["B"].width = 30
    pillars.column_dimensions["C"].width = 110

    definitions = workbook.create_sheet("Skill_Definitions")
    definitions.append(["Kode", "Pilar", "Skill", "Definition"])
    for code, role in catalog.roles.items():
        for pillar, skills in role.pillars.items():
            for skill in skills:
                definitions.append([code, pillar, skill, role.skill_definitions.get(skill, "")])
    for letter, width in zip("ABCD", [8, 32, 50, 100], strict=True):
        definitions.column_dimensions[letter].width = width
    for row in definitions.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = wrap

    for sheet in (scope, pillars, definitions):
        for cell in sheet[1]:
            cell.font = header_font
            cell.fill = header_fill
        sheet.freeze_panes = "A2"

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def load_catalog_file(filename: str, content: bytes) -> Catalog:
    """Parse an uploaded catalog file.

    Parameters
    ----------
    filename : str
        Original file name, used to detect the format.
    content : bytes
        File content. It is parsed in memory only.

    Returns
    -------
    Catalog
        The parsed catalog.

    Raises
    ------
    ValueError
        If the format is not supported or the content is invalid.
    """
    name = filename.lower()
    if name.endswith((".yaml", ".yml")):
        return _from_mapping(yaml.safe_load(content.decode("utf-8")))
    if name.endswith(".json"):
        return _from_mapping(json.loads(content.decode("utf-8")))
    if name.endswith(".xlsx"):
        return _catalog_from_excel(content)
    raise ValueError("Format katalog harus .yaml, .json, atau .xlsx.")
