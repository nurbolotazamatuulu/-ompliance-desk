"""
Загрузчик санкционных списков.
Скачивает XML, парсит, сохраняет в БД.
"""

import re
import httpx
import unicodedata
from xml.etree import ElementTree as ET
from sqlalchemy.orm import Session
from app.sanctions_models import SanctionsList, SanctionEntry

# ─── Источники списков ────────────────────────────────────────────────────────

SANCTIONS_SOURCES = [
    {
        "code": "GSFR_KG_1",
        "name": "ГСФР КР — ПФТ (перечень по финансированию терроризма)",
        "url": "https://fiu.gov.kg/uploads/69c2844ea45df.xml",
        "format": "gsfr_kg",
    },
    {
        "code": "GSFR_KG_2",
        "name": "ГСФР КР — ПЛПД ФЛ (физические лица)",
        "url": "https://fiu.gov.kg/uploads/69d7856f2a90f.xml",
        "format": "gsfr_kg",
    },
    {
        "code": "GSFR_KG_3",
        "name": "ГСФР КР — ПЛПД ЮЛ (юридические лица)",
        "url": "https://fiu.gov.kg/uploads/69ddb401c166f.xml",
        "format": "gsfr_kg",
    },
    {
        "code": "GSFR_KG_4",
        "name": "ГСФР КР — Сводный санкционный перечень КР",
        "url": "https://fiu.gov.kg/uploads/69e0b38900069.xml",
        "format": "gsfr_kg",
    },
    {
        "code": "UN",
        "name": "ООН — Сводный список",
        "url": "https://scsanctions.un.org/resources/xml/en/name/consolidated.xml",
        "format": "un",
    },
    {
        "code": "OFAC",
        "name": "США — OFAC SDN",
        "url": "https://data.opensanctions.org/datasets/latest/us_ofac_sdn/targets.simple.csv",
        "format": "opensanctions_csv",
    },
    {
        "code": "EU",
        "name": "ЕС — Санкционный список",
        "url": "https://data.opensanctions.org/datasets/latest/eu_fsf/targets.simple.csv",
        "format": "opensanctions_csv",
    },
    {
        "code": "UK",
        "name": "Великобритания — OFSI",
        "url": "https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv",
        "format": "uk_ofsi_csv",
    },
]


# ─── Нормализация имён ────────────────────────────────────────────────────────

TRANSLIT_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}


def normalize_name(name: str) -> str:
    """Нормализует имя для поиска: нижний регистр, убирает лишнее."""
    if not name:
        return ""
    name = name.lower().strip()
    # Убираем диакритику
    name = unicodedata.normalize('NFKD', name)
    name = ''.join(c for c in name if not unicodedata.combining(c))
    # Убираем всё кроме букв и пробелов
    name = re.sub(r'[^a-zа-яёa-z\s]', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def transliterate(name: str) -> str:
    """Транслитерирует кириллицу в латиницу."""
    result = []
    for char in name.lower():
        result.append(TRANSLIT_MAP.get(char, char))
    return ''.join(result)


def get_name_variants(name: str) -> list[str]:
    """Возвращает все варианты написания имени для поиска."""
    normalized = normalize_name(name)
    variants = [normalized]
    translit = transliterate(normalized)
    if translit != normalized:
        variants.append(translit)
    return list(set(variants))


# ─── Парсеры ──────────────────────────────────────────────────────────────────

def parse_gsfr_kg(xml_content: str, list_code: str) -> list[dict]:
    """
    Парсит XML списки ГСФР КР.
    Поддерживает все форматы: ПФТ, ПЛПД ФЛ, ПЛПД ЮЛ, Сводный.
    """
    entries = []
    try:
        # Убираем namespace декларации и i: атрибуты
        xml_clean = re.sub(r'\s+xmlns[^=]*="[^"]*"', '', xml_content)
        xml_clean = re.sub(r'\s+i:[a-zA-Z:]+="[^"]*"', '', xml_clean)
        # Убираем namespace префиксы из тегов
        xml_clean = re.sub(r'<([a-zA-Z0-9_]+):([a-zA-Z0-9_.]+)', r'<\2', xml_clean)
        xml_clean = re.sub(r'</([a-zA-Z0-9_]+):([a-zA-Z0-9_.]+)>', r'</\2>', xml_clean)
        # Убираем div от браузера
        xml_clean = re.sub(r'<div[^>]*/>', '', xml_clean)

        root = ET.fromstring(xml_clean)

        # Специальный формат: SanctionList с вложенными legalPersons/physicPersons
        if root.tag in ('SanctionList', 'sanctionList'):
            # Юридические лица
            legal = root.find('legalPersons')
            if legal is not None:
                for item in legal:
                    name = item.findtext('Name', '').strip()
                    if not name:
                        continue
                    entries.append({
                        "list_code": list_code,
                        "entity_type": "entity",
                        "primary_name": name,
                        "primary_name_normalized": normalize_name(name),
                        "aliases": [],
                        "date_of_birth": None,
                        "country": "KG",
                        "additional_info": item.findtext('CategoryPerson', '') or '',
                        "raw_data": name[:500],
                    })

            # Физические лица (тег: physicPersons, не physicalPersons)
            physical = root.find('physicPersons')
            if physical is not None:
                for item in physical:
                    name_val = item.findtext('Name', '').strip()      # Имя
                    surname_val = item.findtext('Surname', '').strip() # Фамилия
                    patronomic = item.findtext('Patronomic', '').strip()
                    dob = item.findtext('DataBirth', '').strip()
                    if dob and 'T' in dob:
                        dob = dob.split('T')[0]
                    category = item.findtext('CategoryPerson', '').strip()
                    place = item.findtext('PlaceBirth', '').strip()

                    full_name = ' '.join(filter(None, [surname_val, name_val, patronomic]))
                    if not full_name:
                        continue

                    entries.append({
                        "list_code": list_code,
                        "entity_type": "individual",
                        "primary_name": full_name,
                        "primary_name_normalized": normalize_name(full_name),
                        "aliases": [],
                        "date_of_birth": dob or None,
                        "country": "KG",
                        "additional_info": ' | '.join(filter(None, [category, place])),
                        "raw_data": f"{full_name} | {dob} | {category}"[:500],
                    })
            return entries

        # Находим тег записи — первый дочерний не div
        record_tag = None
        for child in root:
            if child.tag not in ('div',):
                record_tag = child.tag
                break

        if not record_tag:
            return entries

        for person in root.findall(record_tag):
            def get(tag):
                el = person.find(tag)
                if el is not None and el.text and el.text.strip():
                    return el.text.strip()
                return ''

            # Определяем тип записи по наличию полей
            # ЮЛ: есть INN и нет Patronomic/DataBirth как у ФЛ
            inn = get('INN')
            reg_number = get('RegistratioNumber') or get('RegistrationNumber')
            founder = get('FounderDetails')
            org_name = get('Name') if (inn or reg_number) and not get('DataBirth') else ''

            if org_name:
                # Юридическое лицо
                if not org_name.strip():
                    continue
                entries.append({
                    "list_code": list_code,
                    "entity_type": "entity",
                    "primary_name": org_name,
                    "primary_name_normalized": normalize_name(org_name),
                    "aliases": [founder] if founder else [],
                    "date_of_birth": None,
                    "country": "KG",
                    "passport_numbers": [inn] if inn else [],
                    "additional_info": ' | '.join(filter(None, [
                        f"ИНН: {inn}" if inn else '',
                        f"Рег.№: {reg_number}" if reg_number else '',
                        f"Учредитель: {founder}" if founder else '',
                    ])),
                    "raw_data": f"{org_name} | {inn}"[:500],
                })
            else:
                # Физическое лицо
                name_val = get('Name')
                surname_val = get('Surname')
                patronomic = get('Patronomic')
                dob = get('DataBirth')
                place = get('PlaceBirth')
                category = get('Category')
                pin = get('PIN')

                full_name = ' '.join(filter(None, [surname_val, name_val, patronomic]))
                if not full_name.strip():
                    continue

                if dob and 'T' in dob:
                    dob = dob.split('T')[0]

                entries.append({
                    "list_code": list_code,
                    "entity_type": "individual",
                    "primary_name": full_name,
                    "primary_name_normalized": normalize_name(full_name),
                    "aliases": [],
                    "date_of_birth": dob or None,
                    "country": "KG",
                    "additional_info": ' | '.join(filter(None, [
                        category,
                        place,
                        f"ПИН: {pin}" if pin else '',
                    ])),
                    "raw_data": f"{full_name} | {dob} | {category}"[:500],
                })

    except Exception as e:
        print(f"Ошибка парсинга ГСФР KG ({list_code}): {e}")
        import traceback
        traceback.print_exc()

    return entries


def parse_un(xml_content: str) -> list[dict]:
    """Парсит UN consolidated XML."""
    entries = []
    try:
        root = ET.fromstring(xml_content)

        for individual in root.findall('.//INDIVIDUAL'):
            first = individual.findtext('FIRST_NAME', '').strip()
            second = individual.findtext('SECOND_NAME', '').strip()
            third = individual.findtext('THIRD_NAME', '').strip()
            fourth = individual.findtext('FOURTH_NAME', '').strip()
            full_name = ' '.join(filter(None, [first, second, third, fourth]))
            if not full_name:
                continue

            # Псевдонимы
            aliases = []
            for aka in individual.findall('.//INDIVIDUAL_ALIAS'):
                alias_name = aka.findtext('ALIAS_NAME', '').strip()
                if alias_name:
                    aliases.append(alias_name)

            # Дата рождения — может быть в YEAR или NOTE
            dob = None
            dob_el = individual.find('.//INDIVIDUAL_DATE_OF_BIRTH')
            if dob_el is not None:
                year = dob_el.findtext('YEAR', '').strip()
                note = dob_el.findtext('NOTE', '').strip()
                dob = year or note or None

            # Гражданство
            nat_el = individual.find('.//NATIONALITY/VALUE')
            nationality = nat_el.text.strip() if nat_el is not None and nat_el.text else None

            # Страна проживания
            addr_el = individual.find('.//INDIVIDUAL_ADDRESS/COUNTRY')
            country = addr_el.text.strip() if addr_el is not None and addr_el.text else None

            entries.append({
                "list_code": "UN",
                "entity_type": "individual",
                "primary_name": full_name,
                "primary_name_normalized": normalize_name(full_name),
                "aliases": aliases,
                "date_of_birth": dob,
                "nationality": nationality,
                "country": country,
                "raw_data": f"{full_name} | {nationality}"[:500],
            })

        for entity in root.findall('.//ENTITY'):
            name = entity.findtext('FIRST_NAME', '').strip()
            if not name:
                continue
            aliases = []
            for aka in entity.findall('.//ENTITY_ALIAS'):
                alias_name = aka.findtext('ALIAS_NAME', '').strip()
                if alias_name:
                    aliases.append(alias_name)

            entries.append({
                "list_code": "UN",
                "entity_type": "entity",
                "primary_name": name,
                "primary_name_normalized": normalize_name(name),
                "aliases": aliases,
                "raw_data": name[:500],
            })

    except Exception as e:
        print(f"Ошибка парсинга UN: {e}")

    return entries


def parse_uk_ofsi_csv(csv_content: str) -> list[dict]:
    """
    Парсит UK OFSI ConList.csv.
    Колонки: Name 6 (фамилия), Name 1-5 (имена), DOB, Nationality, Country,
             Group Type, Alias Type, Group ID.
    Группирует строки по Group ID — одна группа = одна запись + псевдонимы.
    """
    import csv, io
    entries_by_group = {}

    try:
        # Первая строка — "Last Updated,date" — пропускаем
        lines = csv_content.splitlines()
        # Найти строку с заголовком
        header_idx = 0
        for i, line in enumerate(lines):
            if line.startswith('Name 6,'):
                header_idx = i
                break

        csv_data = '\n'.join(lines[header_idx:])
        reader = csv.DictReader(io.StringIO(csv_data))

        for row in reader:
            group_id = row.get('Group ID', '').strip()
            if not group_id:
                continue

            # Имя из частей
            parts = [
                row.get('Name 6', '').strip(),  # фамилия
                row.get('Name 1', '').strip(),
                row.get('Name 2', '').strip(),
                row.get('Name 3', '').strip(),
                row.get('Name 4', '').strip(),
                row.get('Name 5', '').strip(),
            ]
            full_name = ' '.join(filter(None, parts))
            if not full_name:
                continue

            alias_type = row.get('Alias Type', '').strip().lower()
            dob = row.get('DOB', '').strip()
            if dob == '00/00/0000' or dob.startswith('00/00'):
                dob = None
            nationality = row.get('Nationality', '').strip()
            country = row.get('Country', '').strip()
            entity_type = 'entity' if row.get('Group Type', '').lower() == 'entity' else 'individual'

            if group_id not in entries_by_group:
                entries_by_group[group_id] = {
                    "list_code": "UK",
                    "entity_type": entity_type,
                    "primary_name": full_name,
                    "primary_name_normalized": normalize_name(full_name),
                    "aliases": [],
                    "date_of_birth": dob,
                    "nationality": nationality,
                    "country": country,
                    "raw_data": f"{full_name} | {dob} | {nationality}"[:500],
                }
                # Если первая строка — псевдоним, добавляем его же как псевдоним
                if 'primary' not in alias_type:
                    entries_by_group[group_id]["aliases"].append(full_name)
            else:
                # Добавляем псевдоним
                existing = entries_by_group[group_id]
                if full_name != existing["primary_name"] and full_name not in existing["aliases"]:
                    if 'primary' in alias_type:
                        # Это может быть основное имя
                        existing["aliases"].append(full_name)
                    else:
                        existing["aliases"].append(full_name)
                # Обновляем ДР если пустая
                if not existing["date_of_birth"] and dob:
                    existing["date_of_birth"] = dob

    except Exception as e:
        print(f"Ошибка парсинга UK OFSI CSV: {e}")
        import traceback
        traceback.print_exc()

    return list(entries_by_group.values())
    """Парсит CSV от OpenSanctions (targets.simple.csv)."""
    import csv
    import io
    entries = []
    try:
        reader = csv.DictReader(io.StringIO(csv_content))
        for row in reader:
            name = row.get('caption', row.get('name', '')).strip()
            if not name:
                continue

            # Псевдонимы из поля aliases
            aliases = []
            raw_aliases = row.get('aliases', '')
            if raw_aliases:
                aliases = [a.strip() for a in raw_aliases.split(';') if a.strip()]

            entries.append({
                "list_code": list_code,
                "entity_type": row.get('schema', 'Person').lower(),
                "primary_name": name,
                "primary_name_normalized": normalize_name(name),
                "aliases": aliases,
                "date_of_birth": row.get('birthDate', ''),
                "nationality": row.get('nationality', ''),
                "country": row.get('country', ''),
                "additional_info": row.get('topics', ''),
                "raw_data": str(row)[:500],
            })
    except Exception as e:
        print(f"Ошибка парсинга OpenSanctions CSV ({list_code}): {e}")
    return entries


# ─── Загрузчик ────────────────────────────────────────────────────────────────

async def load_sanctions_list(db: Session, source: dict) -> dict:
    """Скачивает и загружает один список в БД."""
    code = source["code"]
    result = {"code": code, "status": "error", "count": 0}

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(
                source["url"],
                headers={"User-Agent": "ComplianceDesk/1.0 AML-Screening"}
            )
            if response.status_code != 200:
                result["error"] = f"HTTP {response.status_code}"
                return result

            content = response.text

        # Парсим
        fmt = source["format"]
        if fmt == "gsfr_kg":
            entries_data = parse_gsfr_kg(content, code)
        elif fmt == "un":
            entries_data = parse_un(content)
        elif fmt == "opensanctions_csv":
            entries_data = parse_opensanctions_csv(content, code)
        else:
            result["error"] = f"Неизвестный формат: {fmt}"
            return result

        # Удаляем старые записи этого списка
        db.query(SanctionEntry).filter(SanctionEntry.list_code == code).delete()

        # Сохраняем новые
        for ed in entries_data:
            entry = SanctionEntry(**ed)
            db.add(entry)

        # Обновляем метаданные списка
        sl = db.query(SanctionsList).filter(SanctionsList.code == code).first()
        if not sl:
            sl = SanctionsList(code=code, name=source["name"], source_url=source["url"])
            db.add(sl)
        sl.last_updated = __import__('datetime').datetime.utcnow()
        sl.entry_count = len(entries_data)

        db.commit()
        result["status"] = "ok"
        result["count"] = len(entries_data)

    except Exception as e:
        db.rollback()
        result["error"] = str(e)

    return result


async def load_all_sanctions(db: Session) -> list[dict]:
    """Загружает все списки."""
    results = []
    for source in SANCTIONS_SOURCES:
        print(f"Загружаю {source['code']}...")
        r = await load_sanctions_list(db, source)
        results.append(r)
        print(f"  → {r['status']}: {r.get('count', 0)} записей")
    return results